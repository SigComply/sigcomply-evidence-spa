// Class strings shared by hand-rolled controls, so every page draws the same
// card, button and input as the SigComply web app.
export const CARD = "rounded-xl border border-slate-700 bg-slate-800";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-indigo-600 text-white hover:bg-indigo-500`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} bg-slate-700 text-slate-100 hover:bg-slate-600`;

// For the shadcn Input: the web app draws fields darker than the card. The
// dark: copy outranks the primitive's own dark:bg-input/30.
export const INPUT =
  "h-9 bg-slate-900 dark:bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-indigo-500";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

export const SECTION_LABEL =
  "text-xs font-semibold tracking-wider text-slate-400 uppercase";

export const INLINE_CODE =
  "rounded bg-slate-900 px-1 py-0.5 font-mono text-[0.85em] text-slate-300";
