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
  // With a single configured framework a dropdown that can't change anything
  // is pure noise — show a static label instead.
  if (frameworks.length <= 1) {
    return (
      <span className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium text-muted-foreground">
        {frameworkLabels[value] ?? value}
      </span>
    );
  }

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
