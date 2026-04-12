import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const frameworkLabels: Record<string, string> = {
  soc2: "SOC 2 Type II",
  iso27001: "ISO 27001",
  hipaa: "HIPAA",
};

interface FrameworkSelectorProps {
  value: string;
  onChange: (value: string) => void;
  frameworks: string[];
}

export function FrameworkSelector({ value, onChange, frameworks }: FrameworkSelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(val: string | null) => {
        if (val !== null) onChange(val);
      }}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select framework" />
      </SelectTrigger>
      <SelectContent>
        {frameworks.map((fw) => (
          <SelectItem key={fw} value={fw}>
            {frameworkLabels[fw] ?? fw}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
