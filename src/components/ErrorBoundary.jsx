import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-d4l-bg flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-danger/10 text-danger mb-5">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-wide text-d4l-text mb-2 font-display">
              Something went wrong
            </h1>
            <p className="text-d4l-muted text-sm mb-6 leading-relaxed">
              An unexpected error occurred. Try refreshing the page to resolve the issue.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs text-d4l-dim bg-d4l-surface border border-d4l-border rounded-lg p-3 mb-6 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
