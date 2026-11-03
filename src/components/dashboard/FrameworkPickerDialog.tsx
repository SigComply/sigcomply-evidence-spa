import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Shield } from "lucide-react";

const frameworkLabels: Record<string, string> = {
  soc2: "SOC 2 Type II",
  iso27001: "ISO 27001",
};

interface FrameworkPickerDialogProps {
  open: boolean;
  frameworks: string[];
  onSelect: (framework: string) => void;
  /** Called when the dialog is closed without an explicit choice
   *  (Esc, backdrop, or the close button). Keeps the dialog escapable. */
  onDismiss?: () => void;
}

export function FrameworkPickerDialog({
  open,
  frameworks,
  onSelect,
  onDismiss,
}: FrameworkPickerDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss?.();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Select your framework
          </DialogTitle>
          <DialogDescription>
            You can change it later from the list.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {frameworks.map((fw) => {
            return (
              <button
                key={fw}
                onClick={() => onSelect(fw)}
                className="flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/50"
              >
                <span className="font-medium text-sm">{frameworkLabels[fw] ?? fw}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
