import { Trash2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OutputResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  timeMs: number;
  timestamp: string;
}

interface OutputPanelProps {
  outputs: OutputResult[];
  onClear: () => void;
}

const OutputPanel = ({ outputs, onClear }: OutputPanelProps) => {
  return (
    <div className="w-80 lg:w-96 flex flex-col bg-card">
      <div className="flex items-center justify-between px-4 py-3 bg-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="font-sans text-sm font-medium text-foreground">Output</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        {outputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Terminal className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground font-sans italic">
              Run your code to see output here...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {outputs.map((output, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-input p-3 space-y-2 animate-scale-in"
              >
                <div className="text-xs text-muted-foreground font-mono">
                  [{output.timestamp}]
                </div>

                {output.stdout && (
                  <div className="text-sm font-mono text-success whitespace-pre-wrap break-all">
                    <span className="text-muted-foreground text-xs block mb-1">Output:</span>
                    {output.stdout}
                  </div>
                )}

                {output.stderr && (
                  <div className="text-sm font-mono text-destructive whitespace-pre-wrap break-all">
                    <span className="text-muted-foreground text-xs block mb-1">Error:</span>
                    {output.stderr}
                  </div>
                )}

                <div
                  className={`text-xs font-mono ${
                    output.exitCode === 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  Exit code: {output.exitCode} ({output.timeMs}ms)
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default OutputPanel;
