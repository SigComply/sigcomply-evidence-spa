// Moves the reader to the top of a page that replaced another one: the
// window scrolls up and focus lands on the page's h1, so a screen reader
// announces the new page and Tab starts from its top.
//
// A form's h1 renders only once its catalog loads, after the route change
// has committed. When no h1 is there yet, the next PageHeader to mount takes
// the focus instead.
let pending = false;

export function focusPageHeading(
  h1 = document.querySelector<HTMLElement>("main h1"),
): void {
  window.scrollTo(0, 0);
  pending = !h1;
  h1?.focus({ preventScroll: true });
}

export function takePendingHeadingFocus(): boolean {
  const was = pending;
  pending = false;
  return was;
}

// Focusable from script only, and without the focus ring a control would
// show: a heading is not something to operate.
export const HEADING_FOCUS = "outline-none";
