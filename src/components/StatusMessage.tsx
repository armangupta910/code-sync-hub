import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type MessageType = "error" | "success" | "info";

interface StatusMessageProps {
  type: MessageType;
  message: string;
  className?: string;
}

const iconMap = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const styleMap = {
  error: "bg-destructive/10 border-l-destructive text-destructive",
  success: "bg-success/10 border-l-success text-success",
  info: "bg-info/10 border-l-info text-info",
};

const StatusMessage = ({ type, message, className }: StatusMessageProps) => {
  const Icon = iconMap[type];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 text-sm font-sans animate-scale-in",
        styleMap[type],
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
};

export default StatusMessage;
