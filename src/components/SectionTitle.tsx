import { cn } from "@/lib/utils";

interface SectionTitleProps {
  children: React.ReactNode;
  className?: string;
}

const SectionTitle = ({ children, className }: SectionTitleProps) => {
  return (
    <div className={cn("flex items-center gap-3 mb-6", className)}>
      <div className="h-6 w-1 rounded-full bg-gradient-to-b from-primary to-accent" />
      <h2 className="font-serif text-xl font-medium text-foreground tracking-tight">
        {children}
      </h2>
    </div>
  );
};

export default SectionTitle;
