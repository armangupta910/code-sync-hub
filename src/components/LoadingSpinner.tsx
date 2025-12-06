import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
}

const LoadingSpinner = ({ className }: LoadingSpinnerProps) => {
  return (
    <div
      className={cn(
        "h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin",
        className
      )}
    />
  );
};

export default LoadingSpinner;
