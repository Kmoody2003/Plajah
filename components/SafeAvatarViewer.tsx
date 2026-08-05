import React from 'react';
import { User } from 'lucide-react';
import AvatarViewer, { AvatarViewerProps } from './AvatarViewer';

interface State { hasError: boolean }

class AvatarErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn('[SafeAvatarViewer] Avatar failed to render:', err.message);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const DefaultFallback = ({ size }: { size?: number }) => (
  <div
    className="w-full h-full flex items-center justify-center bg-white/5 rounded-full"
    style={size ? { width: size, height: size } : undefined}
  >
    <User size={size ? size * 0.45 : 24} className="text-white/30" />
  </div>
);

const SafeAvatarViewer: React.FC<AvatarViewerProps & { fallback?: React.ReactNode }> = ({
  fallback,
  ...props
}) => (
  <AvatarErrorBoundary fallback={fallback ?? <DefaultFallback />}>
    <AvatarViewer {...props} />
  </AvatarErrorBoundary>
);

export default SafeAvatarViewer;
