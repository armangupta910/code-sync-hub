import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import RoomHeader from "@/components/room/RoomHeader";
import OutputPanel from "@/components/room/OutputPanel";

const API_BASE = "https://code-sync-render.onrender.com";
const WS_BASE = "ws://code-sync-render.onrender.com/";

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get("code");

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [participantCount, setParticipantCount] = useState(0);
  const [language, setLanguage] = useState("python");
  const [isRunning, setIsRunning] = useState(false);
  const [outputs, setOutputs] = useState<OutputResult[]>([]);
  const [code, setCode] = useState("# Loading...");

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isLocalChangeRef = useRef(false);
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
      if (decorations.ids.length > 0) {
        editorRef.current.deltaDecorations(decorations.ids, []);
      }
      if (decorations.widget) {
        editorRef.current.removeContentWidget(decorations.widget);
      }
      delete remoteDecorationsRef.current[remoteClientId];
    }
  }, []);

  const updateRemoteCursor = useCallback(
    (remoteClientId: string, position: CursorPosition, selection: Selection | null) => {
      if (!position || remoteClientId === clientId || !editorRef.current || !monacoRef.current) return;

      const monaco = monacoRef.current;
      const editor = editorRef.current;
      const color = getColorForUser(remoteClientId);
      const displayName = getUserDisplayName(remoteClientId);

      const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

      if (
        selection &&
        (selection.startLineNumber !== selection.endLineNumber ||
          selection.startColumn !== selection.endColumn)
      ) {
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

      remoteDecorationsRef.current[remoteClientId].ids = editor.deltaDecorations(
        remoteDecorationsRef.current[remoteClientId].ids || [],
        decorations
      );

      if (remoteDecorationsRef.current[remoteClientId].widget) {
        editor.removeContentWidget(remoteDecorationsRef.current[remoteClientId].widget!);
      }

      const cursorWidget: Monaco.editor.IContentWidget = {
        getId: () => `remote-cursor-${remoteClientId}`,
        getDomNode: () => {
          const node = document.createElement("div");
          node.style.background = color;
          node.style.width = "2px";
          node.style.height = "20px";
          node.style.position = "relative";
          node.className = "remote-cursor";

          const label = document.createElement("div");
          label.className = "remote-cursor-label";
          label.style.background = color;
          label.textContent = displayName;
          node.appendChild(label);

          return node;
        },
        getPosition: () => ({
          position: {
            lineNumber: position.lineNumber,
            column: position.column,
          },
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        }),
      };

      editor.addContentWidget(cursorWidget);
      remoteDecorationsRef.current[remoteClientId].widget = cursorWidget;

      // Add dynamic style
      const styleId = `cursor-style-${remoteClientId.replace(/[^a-zA-Z0-9]/g, "")}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `.remote-selection-inline { background-color: ${color}; opacity: 0.3; }`;
        document.head.appendChild(style);
      }
    },
    [clientId, getColorForUser]
  );

  const handleWebSocketMessage = useCallback(
    (message: Record<string, unknown>) => {
      switch (message.type) {
        case "STATE":
          isLocalChangeRef.current = true;
          setCode((message.code as string) || "");
          isLocalChangeRef.current = false;
          if (message.participants !== undefined) {
            setParticipantCount(message.participants as number);
          }
          break;

        case "PATCH":
          if (!isLocalChangeRef.current && message.code !== undefined) {
            isLocalChangeRef.current = true;
            const currentPosition = editorRef.current?.getPosition();
            setCode(message.code as string);
            if (currentPosition && editorRef.current) {
              editorRef.current.setPosition(currentPosition);
            }
            isLocalChangeRef.current = false;
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
          updateRemoteCursor(
            message.clientId as string,
            message.position as CursorPosition,
            message.selection as Selection | null
          );
          break;

        case "ERROR":
          toast.error(message.message as string);
          break;
      }
    },
    [removeRemoteCursor, updateRemoteCursor]
  );

  const connectWebSocket = useCallback(() => {
    if (!roomCode) return;

    setConnectionStatus("connecting");

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

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        toast.info(`Reconnecting... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connectWebSocket, 2000 * reconnectAttemptsRef.current);
      } else {
        toast.error("Connection lost. Please refresh the page.");
      }
    };
  }, [roomCode, clientId, participantId, handleWebSocketMessage]);

  const loadRoomData = useCallback(async () => {
    if (!roomCode) return;

    try {
      const response = await fetch(`${API_BASE}/rooms/${roomCode}/status`);
      const data = await response.json();

      if (data.exists) {
        setLanguage(data.language);
        setParticipantCount(data.participants);
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
    };
  }, [roomCode, clientId, navigate, loadRoomData]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    let changeTimeout: NodeJS.Timeout;
    editor.onDidChangeModelContent(() => {
      if (isLocalChangeRef.current) return;

      clearTimeout(changeTimeout);
      changeTimeout = setTimeout(() => {
        const currentCode = editor.getValue();

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "EDIT",
              code: currentCode,
              clientId: clientId,
            })
          );
        }
      }, 100);
    });

    editor.onDidChangeCursorPosition(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const position = editor.getPosition();
        const selection = editor.getSelection();

        wsRef.current.send(
          JSON.stringify({
            type: "CURSOR",
            clientId: clientId,
            position: position
              ? { lineNumber: position.lineNumber, column: position.column }
              : null,
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
    });
  };

  const handleRunCode = async () => {
    if (!editorRef.current) return;

    setIsRunning(true);

    try {
      const response = await fetch(`${API_BASE}/rooms/${roomCode}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editorRef.current.getValue(),
          language: "python",
        }),
      });

      const data = await response.json();
      const result: OutputResult = {
        ...data,
        timestamp: new Date().toLocaleTimeString(),
      };
      setOutputs((prev) => [result, ...prev]);
    } catch {
      toast.error("Failed to run code");
    } finally {
      setIsRunning(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!confirm("Are you sure you want to leave this room?")) return;

    try {
      await fetch(`${API_BASE}/rooms/${roomCode}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId || clientId }),
      });

      if (wsRef.current) {
        wsRef.current.close();
      }

      navigate("/");
    } catch {
      navigate("/");
    }
  };

  const handleClearOutput = () => setOutputs([]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <RoomHeader
        roomCode={roomCode || ""}
        participantCount={participantCount}
        connectionStatus={connectionStatus}
        language={language}
        isRunning={isRunning}
        onRunCode={handleRunCode}
        onLeaveRoom={handleLeaveRoom}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Section */}
        <div className="flex-1 flex flex-col border-r border-border">
          <div className="flex items-center justify-between px-4 py-3 bg-secondary border-b border-border">
            <span className="font-sans text-sm font-medium text-foreground">Code Editor</span>
            <span className="px-3 py-1 rounded bg-muted text-xs font-mono text-primary uppercase">
              {language}
            </span>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(value) => setCode(value || "")}
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

        {/* Output Section */}
        <OutputPanel outputs={outputs} onClear={handleClearOutput} />
      </div>
    </div>
  );
};

export default Room;
