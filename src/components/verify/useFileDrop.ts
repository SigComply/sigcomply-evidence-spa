import { useEffect, useMemo, useRef, useState } from "react";

const hasFiles = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

// While /verify is mounted, a file dropped outside a drop zone must not make
// the browser open it in the tab and lose the verdict. A zone's own handlers
// run first and call preventDefault, so anything not yet prevented missed
// every zone and gets "none" as its drop effect.
export function useWindowDropGuard() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.defaultPrevented || !hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const onDrop = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}

/**
 * Picks the file a zone checks from a drop: the first whose name ends in
 * `ext` or whose type is `mime`, else the first file. `note` says which one
 * was used when the drop held several.
 */
export function pickFile(
  files: File[],
  ext: string,
  mime: string,
): { file?: File; note: string | null } {
  const file =
    files.find((f) => f.name.toLowerCase().endsWith(ext) || f.type === mime) ??
    files[0];
  const note =
    file && files.length > 1
      ? `This page checks one file at a time, so it used “${file.name}”.`
      : null;
  return { file, note };
}

export type DropHandlers = {
  onDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
};

// Drag events fire on every child the pointer crosses, so a plain on/off flag
// flickers. Counting enters against leaves keeps the highlight steady.
export function useFileDrop(onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const latest = useRef(onFiles);
  useEffect(() => {
    latest.current = onFiles;
  }, [onFiles]);

  const handlers: DropHandlers = useMemo(
    () => ({
      onDragEnter: (e) => {
        e.preventDefault();
        depth.current++;
        setActive(true);
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      },
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        depth.current = 0;
        setActive(false);
        latest.current(Array.from(e.dataTransfer.files ?? []));
      },
    }),
    [],
  );
  return { active, handlers };
}
