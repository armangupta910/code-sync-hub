import { cn } from "@/lib/utils";
import { Code2, Users } from "lucide-react";

interface RoomInfoCardProps {
  roomCode: string;
  language: string;
  participants: number;
  maxParticipants: number;
  className?: string;
}

const RoomInfoCard = ({
  roomCode,
  language,
  participants,
  maxParticipants,
  className,
}: RoomInfoCardProps) => {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-input p-4 space-y-3 animate-fade-in",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-sans">Room Code</span>
        <span className="font-mono text-sm font-semibold text-primary tracking-wider">
          {roomCode}
        </span>
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Code2 className="h-4 w-4" />
          <span className="font-sans">Language</span>
        </div>
        <span className="text-sm font-sans text-foreground capitalize">{language}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="font-sans">Participants</span>
        </div>
        <span className="text-sm font-sans text-foreground">
          {participants}/{maxParticipants}
        </span>
      </div>
    </div>
  );
};

export default RoomInfoCard;
