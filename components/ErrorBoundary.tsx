import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { isChunkLoadError, recoverFromStaleChunk } from '../src/lib/staleChunk';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** First meaningful frame of the React component stack — names the component that threw. */
  culprit: string | null;
}

// Known firebase-js-sdk defect: after a quota/permission error on its Watch
// stream, Firestore throws "INTERNAL ASSERTION FAILED: Unexpected state
// (ID: ca9/b815)" from listener dispatch. It's backend noise, not an app
// bug — recovering instead of crashing keeps reading/playback alive.
const isRecoverableBackendError = (error: Error | null): boolean =>
  !!error && /FIRESTORE.*INTERNAL ASSERTION|code=resource-exhausted|code=permission-denied/i.test(error.message || '');

/** Pull the first `at <Component>` frame out of a React component stack. */
const firstFrame = (stack?: string | null): string | null => {
  if (!stack) return null;
  const m = stack.split('\n').map(s => s.trim()).find(s => /^(at |in )\w/.test(s));
  return m ? m.replace(/^(at|in)\s+/, '').replace(/\s*\(.*$/, '') : null;
};

class ErrorBoundary extends React.Component<Props, State> {
  private autoRecoveries: number[] = [];
  private btnRef = React.createRef<HTMLButtonElement>();

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, culprit: null };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ culprit: firstFrame(errorInfo?.componentStack) });
    // Stale-deploy chunk error → bust the SW/caches and hard-reload automatically so the
    // user never has to see (or tap through) the crash screen. Loop-guarded internally.
    if (isChunkLoadError(error)) { recoverFromStaleChunk(); return; }
    if (isRecoverableBackendError(error)) {
      const now = Date.now();
      this.autoRecoveries = this.autoRecoveries.filter(t => now - t < 30_000);
      this.autoRecoveries.push(now);
      const delay = Math.min(5_000, 100 * Math.pow(2, this.autoRecoveries.length - 1));
      console.warn(`[ErrorBoundary] Auto-recovering from backend stream error (retry in ${delay}ms).`);
      setTimeout(() => this.setState({ hasError: false, error: null, culprit: null }), delay);
    }
  }

  // A television has no pointer: the recovery control must answer the remote. OK / Enter reboots,
  // Back does the same (there is nowhere further to go from a crash), so the viewer is never stranded
  // on a dead screen. Bound in capture so nothing behind the fallback can eat the key.
  private onKey = (e: KeyboardEvent) => {
    if (!this.state.hasError) return;
    const kc = e.keyCode || e.which;
    if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23 ||
        kc === 4 || e.key === 'Backspace' || e.key === 'XF86Back' || e.key === 'GoBack') {
      e.preventDefault(); e.stopImmediatePropagation();
      this.handleReset();
    }
  };

  public componentDidMount() { window.addEventListener('keydown', this.onKey, true); }
  public componentWillUnmount() { window.removeEventListener('keydown', this.onKey, true); }
  public componentDidUpdate(_p: Props, prev: State) {
    // Focus the recovery button as soon as the crash screen appears, so a D-pad OK acts on it.
    if (this.state.hasError && !prev.hasError) { try { this.btnRef.current?.focus(); } catch { /* */ } }
  }

  private handleReset = () => {
    // If the crash was a stale-deploy chunk error, the only real fix is busting the SW
    // cache and hard-reloading — a soft reset would just re-mount into the same dead chunk.
    if (isChunkLoadError(this.state.error)) { recoverFromStaleChunk(); return; }
    this.setState({ hasError: false, error: null, culprit: null });
    if (this.props.onReset) { this.props.onReset(); return; }
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
          if (parsed.error) errorMessage = `Cloud Error: ${parsed.error}`;
        }
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-[var(--bg-color)] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-8 border border-red-500/20">
            <ShieldAlert size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em] mb-4">System Interruption</h1>
          <p className="text-white/40 text-sm max-w-md mb-3 font-medium leading-relaxed">
            {errorMessage}
          </p>
          {this.state.culprit && (
            <p className="text-white/25 text-[11px] font-mono mb-10">in {this.state.culprit}</p>
          )}
          <button
            ref={this.btnRef}
            autoFocus
            onClick={this.handleReset}
            className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.05] focus:scale-[1.05] focus:outline-none focus:ring-4 focus:ring-[#FF8C00] transition-all shadow-2xl"
          >
            <RefreshCw size={16} />
            {this.props.onReset ? 'Go Back' : 'Reboot Instance'}
          </button>
          <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.25em] mt-5">Press OK to continue</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
