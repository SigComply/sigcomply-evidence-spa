import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/common/styles";
import { frameworkLabel } from "./framework-labels";

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
          <DialogTitle className="flex items-center gap-2 text-white">
            <Shield className="h-5 w-5 text-indigo-400" aria-hidden />
            Select your framework
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            You can change it later from the list.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {frameworks.map((fw) => (
            <button
              key={fw}
              type="button"
              onClick={() => onSelect(fw)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-left transition-colors hover:border-indigo-500",
                FOCUS_RING,
              )}
            >
              <span className="text-sm font-medium text-white">
                {frameworkLabel(fw)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
