import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Known firebase-js-sdk defect: after a quota/permission error on its Watch
// stream, Firestore throws "INTERNAL ASSERTION FAILED: Unexpected state
// (ID: ca9/b815)" from listener dispatch. It's backend noise, not an app
// bug — recovering instead of crashing keeps reading/playback alive.
const isRecoverableBackendError = (error: Error | null): boolean =>
  !!error && /FIRESTORE.*INTERNAL ASSERTION|code=resource-exhausted|code=permission-denied/i.test(error.message || '');

class ErrorBoundary extends React.Component<Props, State> {
  private autoRecoveries: number[] = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    if (isRecoverableBackendError(error)) {
      // Backend stream noise is categorically not an app bug — keep
      // recovering, with growing delay so a tight rethrow loop can't peg
      // the CPU. Genuine app crashes don't match the pattern and still
      // show the interruption screen immediately.
      const now = Date.now();
      this.autoRecoveries = this.autoRecoveries.filter(t => now - t < 30_000);
      this.autoRecoveries.push(now);
      const delay = Math.min(5_000, 100 * Math.pow(2, this.autoRecoveries.length - 1));
      console.warn(`[ErrorBoundary] Auto-recovering from backend stream error (retry in ${delay}ms).`);
      setTimeout(() => this.setState({ hasError: false, error: null }), delay);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
      return;
    }
    // Prevent infinite reload loop
    const lastErrorTime = sessionStorage.getItem('last_error_time');
    const now = Date.now();
    if (lastErrorTime && now - parseInt(lastErrorTime) < 5000) {
      console.error('Multiple errors detected in short sequence. Stopping auto-reload.');
      return;
    }
    sessionStorage.setItem('last_error_time', now.toString());
    window.dispatchEvent(new CustomEvent('app-reset'));
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = `Cloud Error: ${parsed.error}`;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-[var(--bg-color)] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-8 border border-red-500/20">
            <ShieldAlert size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em] mb-4">System Interruption</h1>
          <p className="text-white/40 text-sm max-w-md mb-10 font-medium leading-relaxed">
            {errorMessage}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.05] transition-all shadow-2xl"
          >
            <RefreshCw size={16} />
            {this.props.onReset ? 'Go Back' : 'Reboot Instance'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
