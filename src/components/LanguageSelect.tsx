import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LanguageSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

const languages = [
  { value: "python", label: "Python" },
  { value: "cpp", label: "C++" },
];

const LanguageSelect = ({ value, onValueChange }: LanguageSelectProps) => {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-12 bg-input border-border text-foreground font-sans">
        <SelectValue placeholder="Select a language" />
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {languages.map((lang) => (
          <SelectItem
            key={lang.value}
            value={lang.value}
            className="text-foreground font-sans hover:bg-secondary focus:bg-secondary"
          >
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LanguageSelect;
