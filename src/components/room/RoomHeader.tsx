import { Button } from "@/components/ui/button";
import { Play, LogOut, Wifi, WifiOff, Loader2 } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface RoomHeaderProps {
  roomCode: string;
  participantCount: number;
  maxPaticipantCount: number;
  connectionStatus: ConnectionStatus;
  language: string;
  isRunning: boolean;
  onRunCode: () => void;
  onLeaveRoom: () => void;
}

const RoomHeader = ({
  roomCode,
  participantCount,
  maxPaticipantCount,
  connectionStatus,
  isRunning,
  onRunCode,
  onLeaveRoom,
}: RoomHeaderProps) => {
  const statusConfig = {
    connected: {
      icon: Wifi,
      text: "Connected",
      className: "bg-success/10 text-success border-success/30",
    },
    disconnected: {
      icon: WifiOff,
      text: "Disconnected",
      className: "bg-destructive/10 text-destructive border-destructive/30",
    },
    connecting: {
      icon: Loader2,
      text: "Connecting...",
      className: "bg-info/10 text-info border-info/30",
    },
  };

  const status = statusConfig[connectionStatus];
  const StatusIcon = status.icon;

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-card border-b border-border shadow-card">
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Room Code */}
        <div className="px-4 py-2 rounded-lg bg-gradient-to-r text-black tracking-[0.10em] from-primary to-accent text-foreground font-serif text-l font-semibold tracking-tight shadow-glow">
  {roomCode}
</div>


        {/* Participants */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <span className="text-sm font-sans text-secondary-foreground">
            {participantCount}/{maxPaticipantCount}
          </span>
        </div>

        {/* Connection Status */}
        <div
          className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium font-sans ${status.className}`}
        >
          <StatusIcon
            className={`h-3.5 w-3.5 ${connectionStatus === "connecting" ? "animate-spin" : ""}`}
          />
          <span>{status.text}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="default"
          onClick={onRunCode}
          disabled={isRunning}
          className="gap-2"
        >
          {isRunning ? (
            <>
              <LoadingSpinner />
              Running
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Code
            </>
          )}
        </Button>

        <Button variant="destructive" onClick={onLeaveRoom} className="gap-2">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </header>
  );
};

export default RoomHeader;
