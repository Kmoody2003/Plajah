import React from 'react';

interface Props { children: React.ReactNode; scope: 'exhibit' | 'experience'; onBack?: () => void }
interface State { error: Error | null }

/**
 * Keeps one failing piece of an exhibit from taking the whole screen down, and shows what failed
 * so a visitor can report it (the message and the first stack lines, not a blank page).
 */
export default class DossierBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[dossier] ' + this.props.scope + ' failed:', error, info.componentStack);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = String(error.stack || error.message || error).split('\n').slice(0, 4).join('\n');
    return (
      <div role="alert" style={{ margin: '16px 0', padding: 18, border: '1px solid rgba(255,255,255,.25)', borderRadius: 12, background: 'rgba(255,255,255,.05)', color: '#f2ece6', font: '15px/1.5 system-ui, sans-serif' }}>
        <b>{this.props.scope === 'exhibit' ? 'This exhibit hit a problem.' : 'This interactive piece hit a problem.'}</b>
        <div style={{ marginTop: 6, opacity: .8 }}>The rest of the exhibit is still here. If you report this, please include the text below.</div>
        <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12, opacity: .75 }}>{detail}</pre>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button onClick={() => this.setState({ error: null })} style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(255,255,255,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Try again</button>
          {this.props.onBack && <button onClick={this.props.onBack} style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(255,255,255,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Back</button>}
        </div>
      </div>
    );
  }
}
