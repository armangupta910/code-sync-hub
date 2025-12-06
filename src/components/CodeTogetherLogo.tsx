import { Code2 } from "lucide-react";

const CodeTogetherLogo = () => {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow">
          <Code2 className="h-6 w-6 text-primary-foreground" />
        </div>
      </div>
      <div className="flex flex-col">
        <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Code Together
        </span>
        <span className="text-xs font-sans text-muted-foreground tracking-wide">
          Collaborative Coding Environment
        </span>
      </div>
    </div>
  );
};

export default CodeTogetherLogo;
