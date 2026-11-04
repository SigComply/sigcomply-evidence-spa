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
        <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 px-6 py-12 text-center">
            <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
            <p className="mx-auto mt-2 mb-6 max-w-sm text-slate-400">
              The page hit an unexpected error. Nothing was sent anywhere. Reload
              to try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
