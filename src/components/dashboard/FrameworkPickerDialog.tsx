import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Shield } from "lucide-react";

const frameworkInfo: Record<string, { label: string; description: string }> = {
  soc2: {
    label: "SOC 2 Type II",
    description: "Service Organization Control 2 — security, availability, confidentiality, processing integrity, and privacy.",
  },
  iso27001: {
    label: "ISO 27001",
    description: "International standard for information security management systems (ISMS).",
  },
  hipaa: {
    label: "HIPAA",
    description: "Health Insurance Portability and Accountability Act — safeguarding protected health information.",
  },
};

interface FrameworkPickerDialogProps {
  open: boolean;
  frameworks: string[];
  onSelect: (framework: string) => void;
}

export function FrameworkPickerDialog({ open, frameworks, onSelect }: FrameworkPickerDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Select Your Framework
          </DialogTitle>
          <DialogDescription>
            Choose the compliance framework for your evidence collection.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {frameworks.map((fw) => {
            const info = frameworkInfo[fw] ?? { label: fw, description: "" };
            return (
              <button
                key={fw}
                onClick={() => onSelect(fw)}
                className="flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/50"
              >
                <span className="font-medium text-sm">{info.label}</span>
                {info.description && (
                  <span className="text-xs text-muted-foreground">{info.description}</span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
