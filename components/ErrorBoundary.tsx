import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
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
  }

  private handleReset = () => {
    // Prevent infinite reload loop
    const lastErrorTime = sessionStorage.getItem('last_error_time');
    const now = Date.now();
    
    if (lastErrorTime && now - parseInt(lastErrorTime) < 5000) {
      console.error('Multiple errors detected in short sequence. Stopping auto-reload.');
      this.setState({ hasError: true }); // Keep showing error state instead of reloading
      return;
    }
    
    sessionStorage.setItem('last_error_time', now.toString());
    this.setState({ hasError: false, error: null });
    // Soft reload (navigation reset) instead of hard window.location.reload()
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
        <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center p-6 text-center">
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
            Reboot Instance
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
