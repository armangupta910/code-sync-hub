import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

const FormField = ({ label, children, className }: FormFieldProps) => {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="block text-sm font-medium text-secondary-foreground font-sans">
        {label}
      </label>
      {children}
    </div>
  );
};

export default FormField;
