import React from 'react';
import { Tv, ArrowLeft } from 'lucide-react';
import { unavailableReason, type TvDisabledFeature } from '../services/tvCapabilities';

/**
 * Shown in place of a feature that Plajah deliberately does not run on a television.
 *
 * The point is that a disabled feature must SAY it is disabled. Silently hiding a button, or
 * opening a studio that then can't be driven with a remote, reads as a broken app on a screen
 * the viewer cannot inspect. A sentence explaining where the feature *does* live reads as a
 * product decision — which it is — and tells them what to do instead.
 *
 * Sized for ten feet: this is not a toast.
 */
const TvUnavailableNotice: React.FC<{
  feature: TvDisabledFeature;
  /** Feature name as the viewer knows it, e.g. "Fabula". */
  title?: string;
  onBack?: () => void;
}> = ({ feature, title, onBack }) => {
  const reason = unavailableReason(feature);
  // Available here after all — render nothing rather than a contradiction.
  if (!reason) return null;

  return (
    <div className="w-full h-full flex items-center justify-center p-12">
      <div className="max-w-2xl text-center space-y-8">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <Tv size={40} className="text-white/40" />
        </div>

        <div className="space-y-4">
          <h2 className="text-4xl font-black text-white tracking-tight">
            {title ? `${title} isn’t available on TV` : 'Not available on TV'}
          </h2>
          <p className="text-xl text-white/60 leading-relaxed">{reason}</p>
        </div>

        {onBack && (
          <button
            onClick={onBack}
            data-tv-focusable
            autoFocus
            className="inline-flex items-center gap-3 px-10 py-5 rounded-full bg-white text-black font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform"
          >
            <ArrowLeft size={20} /> Go back
          </button>
        )}
      </div>
    </div>
  );
};

export default TvUnavailableNotice;
