import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// ErrorBoundary catches render-time exceptions anywhere in the tree and shows
// a recoverable fallback instead of React unmounting to a blank white page.
// This is a static, backend-free app with no Sentry — the fallback is the
// user's only signal that something went wrong, so it stays simple and offers
// a reload.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No server to report to; surface it in the console for local debugging.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The page hit an unexpected error. Nothing was sent anywhere — this
            app runs entirely in your browser. Try reloading.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
