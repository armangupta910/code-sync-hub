import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import RoomHeader from "@/components/room/RoomHeader";
import OutputPanel from "@/components/room/OutputPanel";

const API_BASE = "https://code-sync-render.onrender.com";
const WS_BASE = "wss://code-sync-render.onrender.com";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface OutputResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  timeMs: number;
  timestamp: string;
}

interface CursorPosition {
  lineNumber: number;
  column: number;
}

interface Selection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface RemoteDecoration {
  ids: string[];
  widget: Monaco.editor.IContentWidget | null;
}

const Room = () => {

  const CODE_TEMPLATES: Record<string, string> = {
    python: `def main():
    print("Hello from Collaborative Editor!")

if __name__ == "__main__":
    main()
`,

    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Hello from Collaborative Editor!" << endl;
    return 0;
}
`,
  };

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get("code");

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [participantCount, setParticipantCount] = useState(0);
  const [maxParticipantCount, setMaxParticipantCount] = useState(0);
  const [language, setLanguage] = useState("python");
  const [isRunning, setIsRunning] = useState(false);
  const [outputs, setOutputs] = useState<OutputResult[]>([]);
const [code, setCode] = useState("");


  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Marks when we programmatically change the model to avoid echoing edits back to the server
  const isLocalChangeRef = useRef(false);
  // Decorations being applied -- not used to block cursor events, only to help with timing when necessary
  const isApplyingDecorationsRef = useRef(false);

  const manualDisconnectRef = useRef(false);


  const reconnectAttemptsRef = useRef(0);
  const remoteDecorationsRef = useRef<Record<string, RemoteDecoration>>({});
  const remoteCursorColorsRef = useRef<Record<string, string>>({});

  const clientId = sessionStorage.getItem("clientId");
  const participantId = sessionStorage.getItem("participantId");

  const MAX_RECONNECT_ATTEMPTS = 5;

  const cursorColors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A",
    "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2",
    "#F8B739", "#52B788", "#E63946", "#457B9D",
  ];

  const getColorForUser = useCallback((id: string) => {
    if (remoteCursorColorsRef.current[id]) {
      return remoteCursorColorsRef.current[id];
    }
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = cursorColors[Math.abs(hash) % cursorColors.length];
    remoteCursorColorsRef.current[id] = color;
    return color;
  }, []);

  const getUserDisplayName = (email: string) => email.split("@")[0];

  const removeRemoteCursor = useCallback((remoteClientId: string) => {
    const decorations = remoteDecorationsRef.current[remoteClientId];
    if (decorations && editorRef.current) {
      try {
        if (decorations.ids.length > 0) {
          editorRef.current.deltaDecorations(decorations.ids, []);
        }
        if (decorations.widget) {
          editorRef.current.removeContentWidget(decorations.widget);
        }
      } catch (e) {
        // ignore when editor disposed
      }
      delete remoteDecorationsRef.current[remoteClientId];
    }
  }, []);

  // --- IMPORTANT: Clean cursor rendering without disabling any listeners ---
  const updateRemoteCursor = useCallback(
    (remoteClientId: string, position: CursorPosition | null, selection: Selection | null) => {
      if (!editorRef.current || !monacoRef.current) return;
      if (remoteClientId === clientId) return; // ignore our own

      const editor = editorRef.current;
      const monaco = monacoRef.current;

      const color = getColorForUser(remoteClientId);
      const displayName = getUserDisplayName(remoteClientId);

      // Build decorations for selection highlight (if any)
      const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
      if (selection && (
        selection.startLineNumber !== selection.endLineNumber ||
        selection.startColumn !== selection.endColumn
      )) {
        decorations.push({
          range: new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn
          ),
          options: {
            className: "remote-selection",
            inlineClassName: "remote-selection-inline",
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }

      if (!remoteDecorationsRef.current[remoteClientId]) {
        remoteDecorationsRef.current[remoteClientId] = { ids: [], widget: null };
      }

      // Apply selection decorations via deltaDecorations only (fast & doesn't move caret)
      try {
        remoteDecorationsRef.current[remoteClientId].ids = editor.deltaDecorations(
          remoteDecorationsRef.current[remoteClientId].ids || [],
          decorations
        );
      } catch (e) {
        // ignore
      }

      // Remove old widget (if any)
      if (remoteDecorationsRef.current[remoteClientId].widget) {
        try {
          editor.removeContentWidget(remoteDecorationsRef.current[remoteClientId].widget!);
        } catch (e) {}
        remoteDecorationsRef.current[remoteClientId].widget = null;
      }

      // If there is a cursor position, create a non-interactive content widget for the caret + label.
      if (position) {
        // toast.message("Position Found - " + position.lineNumber + " " + position.column)
        const idSafe = remoteClientId.replace(/[^a-zA-Z0-9]/g, "");
        const widget: Monaco.editor.IContentWidget = {
          getId: () => `remote-cursor-${idSafe}`,
          getDomNode: () => {
            const node = document.createElement("div");
            node.style.pointerEvents = "none"; // critical: do not capture mouse/focus
            node.className = "remote-cursor-wrapper";

            const caret = document.createElement("div");
            caret.className = "remote-caret";
            caret.style.width = "2px";
            caret.style.height = "20px";
            caret.style.background = color;
            caret.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.12)";
            caret.style.margin = "0";
            caret.style.pointerEvents = "none";

            const label = document.createElement("div");
            label.className = "remote-cursor-label";
            label.textContent = displayName;
            label.style.background = color;
            label.style.color = "white";
            label.style.fontSize = "11px";
            label.style.padding = "2px 6px";
            label.style.borderRadius = "4px";
            label.style.marginTop = "2px";
            label.style.whiteSpace = "nowrap";
            label.style.pointerEvents = "none";

            node.appendChild(caret);
            node.appendChild(label);
            return node;
          },
          getPosition: () => ({
            position: {
              lineNumber: position.lineNumber,
              column: position.column,
            },
            // prefer below/above to reduce collision with actual caret rendering
            preference: [
              monaco.editor.ContentWidgetPositionPreference.EXACT,
              monaco.editor.ContentWidgetPositionPreference.ABOVE,
              monaco.editor.ContentWidgetPositionPreference.BELOW,
            ],
          }),
        };

        try {
          editor.addContentWidget(widget);
          editor.layoutContentWidget(widget);
          remoteDecorationsRef.current[remoteClientId].widget = widget;
        } catch (e) {
          // ignore
        }

        // Add per-user inline style (only once)
        const styleId = `remote-style-${remoteClientId.replace(/[^a-zA-Z0-9]/g, "")}`;
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            .remote-selection-inline { background-color: ${color}; opacity: 0.25 !important; }
            .remote-caret { }
            .remote-cursor-label { transform: translateY(-100%); }
          `;
          document.head.appendChild(style);
        }
      }
    },
    [clientId, getColorForUser]
  );

  useEffect(() => {
  // Only set default code when editor is empty
  if (code.trim() !== "") return;

  if (language === "cpp") {
    setCode(`#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Hello from Collaborative Editor!" << endl;
    return 0;
}
`);
  } else {
    setCode(`def main():
    print("Hello from Collaborative Editor!")

if __name__ == "__main__":
    main()
`);
  }
}, [language]);


  const handleWebSocketMessage = useCallback(
    (message: Record<string, unknown>) => {
      switch (message.type) {
        case "STATE":
          // initial full state — set model value without broadcasting an EDIT
          isLocalChangeRef.current = true;
          setCode((message.code as string) || "");
          // if editor mounted, set model value directly to avoid selection resets via React control flow
          if (editorRef.current) {
            const m = editorRef.current.getModel();
            if (m) m.setValue((message.code as string) || "");
          }
          isLocalChangeRef.current = false;
          if (message.participants !== undefined) {
            setParticipantCount(message.participants as number);
          }
          break;

        case "PATCH":
          // a remote edit happened
          if ((message.clientId as string) === clientId) return;
          if (message.code === undefined) return;

          // Apply remote edit directly to model while preserving selection if possible
          if (editorRef.current) {
            const editor = editorRef.current;
            const model = editor.getModel();
            if (model) {
              // preserve current selection/position (best-effort)
              const prevSelection = editor.getSelection();
              isLocalChangeRef.current = true;
              try {
                // replace whole model for simplicity (for robust collaboration you would use OT/CRDT)
                model.pushEditOperations(
                  [],
                  [
                    {
                      range: model.getFullModelRange(),
                      text: message.code as string,
                    },
                  ],
                  () => null
                );

                // restore selection if still valid
                if (prevSelection) {
                  // clamp values into new model range
                  const lineCount = model.getLineCount();
                  const clampLine = (l: number) =>
                    Math.min(Math.max(1, l), lineCount);
                  const clampCol = (line: number, col: number) =>
                    Math.min(Math.max(1, col), model.getLineMaxColumn(line));

                  const startLine = clampLine(prevSelection.startLineNumber);
                  const endLine = clampLine(prevSelection.endLineNumber);
                  const startCol = clampCol(
                    startLine,
                    prevSelection.startColumn
                  );
                  const endCol = clampCol(endLine, prevSelection.endColumn);

                  editor.setSelection(
                    new monacoRef.current!.Selection(
                      startLine,
                      startCol,
                      endLine,
                      endCol
                    )
                  );
                }
              } catch (e) {
                // fallback to setValue
                try {
                  model.setValue(message.code as string);
                } catch (ee) {}
              } finally {
                // small timeout to allow Monaco internal updates
                setTimeout(() => {
                  isLocalChangeRef.current = false;
                }, 0);
              }
            } else {
              // model not ready — set React state (mount will sync)
              setCode(message.code as string);
            }
          } else {
            setCode(message.code as string);
          }
          break;

        case "PARTICIPANT_JOINED":
          toast.success(`${message.clientId} joined the room`);
          setParticipantCount(message.participantCount as number);
          break;

        case "PARTICIPANT_LEFT":
          toast.info(`${message.clientId} left the room`);
          setParticipantCount(message.participantCount as number);
          removeRemoteCursor(message.clientId as string);
          break;

        case "CURSOR":
          if ((message.clientId as string) === clientId) return;

          const original = message.position as CursorPosition;
          // toast.message(
          //   "Cursor Position Received - " +
          //     original.lineNumber +
          //     original.column +
          //     "from client " +
          //     clientId
          // );

          updateRemoteCursor(
            message.clientId as string,
            original,
            (message.selection as Selection) || null
          );

          break;

        case "ERROR":
          toast.error(message.message as string);
          break;
      }
    },
    [clientId, removeRemoteCursor, updateRemoteCursor]
  );

  const connectWebSocket = useCallback(() => {
    if (!roomCode) return;

    setConnectionStatus("connecting");
    // toast.message("Trying to send the INIT message")

    const ws = new WebSocket(`${WS_BASE}/ws/rooms/${roomCode}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;

      ws.send(
        JSON.stringify({
          type: "INIT",
          participantId: participantId || clientId,
          clientId: clientId,
        })
      );
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    ws.onerror = () => {
      toast.error("Connection error");
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");

      if (manualDisconnectRef.current) {
        // user intentionally left → no reconnection
        return;
      }

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        toast.info(
          `Reconnecting... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
        );
        setTimeout(connectWebSocket, 2000 * reconnectAttemptsRef.current);
      } else {
        toast.error("Connection lost. Please refresh the page.");
      }
    };

  }, [roomCode, clientId, participantId, handleWebSocketMessage]);

  const loadRoomData = useCallback(async () => {
    if (!roomCode) return;

    try {
      toast.message("Loading room data...")
      const response = await fetch(`${API_BASE}/rooms/${roomCode}/status`);
      toast.message("Message rec - " + response as String)
      const data = await response.json();

      if (data.exists) {
        setLanguage(data.language);
        setParticipantCount(data.participants);
        setMaxParticipantCount(data.max_participants);
        connectWebSocket();
      } else {
        toast.error("Room not found!");
        setTimeout(() => navigate("/"), 2000);
      }
    } catch {
      toast.error("Failed to load room data");
    }
  }, [roomCode, connectWebSocket, navigate]);

  useEffect(() => {
    if (!roomCode) {
      toast.error("No room code provided!");
      navigate("/");
      return;
    }

    if (!clientId) {
      toast.error("No client ID found. Please start from the home page.");
      navigate("/");
      return;
    }

    loadRoomData();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      // cleanup decorations
      if (editorRef.current) {
        Object.keys(remoteDecorationsRef.current).forEach((id) => {
          try {
            const rd = remoteDecorationsRef.current[id];
            if (rd.ids.length) editorRef.current!.deltaDecorations(rd.ids, []);
            if (rd.widget) editorRef.current!.removeContentWidget(rd.widget);
          } catch (e) {}
        });
      }
    };
  }, [roomCode, clientId, navigate, loadRoomData]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    let changeTimeout: NodeJS.Timeout;
    let cursorTimeout: NodeJS.Timeout;
    let lastSentPositionRef = { line: 0, col: 0 };

    // --- CONTENT CHANGE ---
    editor.onDidChangeModelContent(() => {
      // If we are applying an incoming remote edit, don't broadcast it
      if (isLocalChangeRef.current) return;

      clearTimeout(changeTimeout);
      changeTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const currentCode = editor.getValue();
          wsRef.current.send(JSON.stringify({ type: "EDIT", code: currentCode, clientId }));
          // update local React state so new mount/state consumers see it
          setCode(currentCode);
        }
      }, 100);
    });

    // --- CURSOR CHANGE ---
    const sendCursorPosition = () => {
      if (!editorRef.current) return;

      clearTimeout(cursorTimeout);
      cursorTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const position = editor.getPosition();
          const selection = editor.getSelection();

          if (position) {
            if (lastSentPositionRef.line === position.lineNumber && lastSentPositionRef.col === position.column) {
              return; // nothing changed
            }
            lastSentPositionRef.line = position.lineNumber;
            lastSentPositionRef.col = position.column;
          }

          wsRef.current.send(
            JSON.stringify({
              type: "CURSOR",
              clientId,
              position: position ? { lineNumber: position.lineNumber, column: position.column } : null,
              selection: selection
                ? {
                    startLineNumber: selection.startLineNumber,
                    startColumn: selection.startColumn,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn,
                  }
                : null,
            })
          );
        }
      }, 10);
    };

    editor.onDidChangeCursorPosition(() => {
      // Always broadcast cursor changes (no enabling/disabling)
      sendCursorPosition();
    });

    editor.onDidChangeCursorSelection(() => {
      // selection change -> also broadcast
      sendCursorPosition();
    });

    // If we have initial code from state (setCode), apply it to the model to keep editor in-sync without resetting selection
    if (code && editor.getModel() && editor.getModel()!.getValue() !== code) {
      isLocalChangeRef.current = true;
      editor.getModel()!.setValue(code);
      setTimeout(() => (isLocalChangeRef.current = false), 0);
    }
  };

  const handleRunCode = async () => {
    if (!editorRef.current) return;

    setIsRunning(true);

    try {
      const response = await fetch(`${API_BASE}/rooms/${roomCode}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editorRef.current.getValue(), language: language}),
      });

      const data = await response.json();
      const result: OutputResult = { ...data, timestamp: new Date().toLocaleTimeString() };
      setOutputs((prev) => [result, ...prev]);
    } catch {
      toast.error("Failed to run code");
    } finally {
      setIsRunning(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!confirm("Are you sure you want to leave this room?")) return;

    manualDisconnectRef.current = true; // ✅ signal intentional leave

    try {
      await fetch(`${API_BASE}/rooms/${roomCode}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId || clientId }),
      });
    } catch {}

    if (wsRef.current) wsRef.current.close();

    sessionStorage.removeItem("participantId");
    sessionStorage.removeItem("clientId");

    navigate("/");
  };


  const handleClearOutput = () => setOutputs([]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <RoomHeader
        roomCode={roomCode || ""}
        participantCount={participantCount}
        maxPaticipantCount={maxParticipantCount}
        connectionStatus={connectionStatus}
        language={language}
        isRunning={isRunning}
        onRunCode={handleRunCode}
        onLeaveRoom={handleLeaveRoom}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col border-r border-border">
          <div className="flex items-center justify-between px-4 py-3 bg-secondary border-b border-border">
            <span className="font-sans text-sm font-medium text-foreground">Code Editor</span>
            <span className="px-3 py-1 rounded bg-muted text-xs font-mono text-primary uppercase">{language}</span>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(value) => {
                // keep React state in sync for cases where other UI parts read `code`
                setCode(value || "");
              }}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>
        </div>

        <OutputPanel outputs={outputs} onClear={handleClearOutput} />
      </div>

      {/* minimal styles for remote visuals */}
      <style>{`
        .remote-selection-inline { opacity: 0.25; }
        .remote-cursor-wrapper { display: flex; align-items: flex-start; gap: 6px; }
        .remote-cursor-label { transform: translateY(-100%); }
      `}</style>
    </div>
  );
};

export default Room;
