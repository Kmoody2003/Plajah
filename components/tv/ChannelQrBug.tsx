import React, { useState, useEffect, useRef, useCallback } from 'react';
import Logo from '../Logo';
import { QrCode, Check, Copy } from 'lucide-react';
import { getChannelQrDataUrlSync, generateChannelQrDataUrl } from '../../services/fast/channelQrService';

export interface ChannelQrBugProps {
  /** The direct share URL of the specific channel (no signin required) */
  shareUrl?: string;
  /** Channel number (e.g. "42.1" or "8") for display in the bug */
  channelNumber?: string;
  /** Channel name (optional, used for accessibility and title) */
  channelName?: string;
  /** Position and wrapper styling classes (defaults to lower-left corner) */
  className?: string;
  /** Duration the bug stays on in ms (default: 2 minutes = 120,000 ms) */
  activeDurationMs?: number;
  /** Duration the bug stays off in ms (default: 1 minute = 60,000 ms) */
  inactiveDurationMs?: number;
  /** Don't auto-dissolve while the user hovers with a pointer */
  pauseOnHover?: boolean;
}

const DEFAULT_ACTIVE_MS = 2 * 60 * 1000;   // 2 minutes ON
const DEFAULT_INACTIVE_MS = 1 * 60 * 1000; // 1 minute OFF

/**
 * ChannelQrBug — a broadcast-style QR code link bug overlay for the Live TV Hub and player.
 * Sits in the lower left corner of the video frame.
 *
 * Displays:
 * 1. High-contrast QR code pointing directly to the channel's share link (no sign-in required).
 * 2. Text: "Scan to watch this channel on your device" rendered with vibrant Plajah color branding.
 * 3. "plajah.com" underneath it with the official Plajah chevron logo.
 * 4. Automatic 2-minute ON / 1-minute OFF cadence with a smooth dissolve fade.
 */
export const ChannelQrBug: React.FC<ChannelQrBugProps> = ({
  shareUrl,
  channelNumber,
  channelName,
  className = 'bottom-6 left-6',
  activeDurationMs = DEFAULT_ACTIVE_MS,
  inactiveDurationMs = DEFAULT_INACTIVE_MS,
  pauseOnHover = true,
}) => {
  const [visible, setVisible] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>(() => (shareUrl ? getChannelQrDataUrlSync(shareUrl) || '' : ''));
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  isHoveredRef.current = isHovered;

  // Generate QR code data URL whenever the channel shareUrl changes
  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl('');
      return;
    }
    const cached = getChannelQrDataUrlSync(shareUrl);
    if (cached) {
      setQrDataUrl(cached);
      return;
    }

    // Immediately clear stale QR code so the previous station's QR is NEVER shown
    setQrDataUrl('');
    let cancelled = false;

    generateChannelQrDataUrl(shareUrl)
      .then((url) => {
        if (!cancelled && url) setQrDataUrl(url);
      })
      .catch((err) => {
        console.warn('Failed to generate channel QR code:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  // 2-minute ON, 1-minute OFF cyclic timer with smooth dissolve
  useEffect(() => {
    if (!shareUrl) return;

    // Reset to visible when a new channel tunes in
    setVisible(true);

    let active = true;

    const scheduleNext = (currentlyOn: boolean) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const delay = currentlyOn ? activeDurationMs : inactiveDurationMs;

      timerRef.current = setTimeout(() => {
        if (!active) return;

        // If currently visible and hovered, delay hide until hover ends
        if (currentlyOn && pauseOnHover && isHoveredRef.current) {
          scheduleNext(true);
          return;
        }

        const nextState = !currentlyOn;
        setVisible(nextState);
        scheduleNext(nextState);
      }, delay);
    };

    scheduleNext(true);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [shareUrl, activeDurationMs, inactiveDurationMs, pauseOnHover]);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!shareUrl) return;
      try {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2400);
        }
      } catch (err) {
        console.warn('Clipboard copy failed', err);
      }
    },
    [shareUrl]
  );

  if (!shareUrl) return null;

  return (
    <aside
      aria-label={channelName ? `Scan to watch ${channelName} on your device` : 'Scan to watch channel on your device'}
      className={`absolute z-30 transition-all duration-1000 ease-in-out select-none ${className} ${
        visible
          ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
          : 'opacity-0 translate-y-2 scale-95 pointer-events-none'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        onClick={handleCopy}
        title="Scan with phone camera or click to copy direct link"
        className="group relative flex items-center gap-3.5 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl bg-black/85 hover:bg-black/95 backdrop-blur-md border border-white/20 hover:border-white/35 shadow-[0_12px_40px_rgba(0,0,0,0.8)] cursor-pointer transition-colors max-w-[380px]"
      >
        {/* Crisp QR Code Tile */}
        <div className="relative w-[92px] h-[92px] sm:w-[104px] sm:h-[104px] rounded-xl bg-white p-2 shrink-0 flex items-center justify-center shadow-lg border border-white/40">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Channel QR code"
              className="w-full h-full object-contain block select-none"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
              <QrCode size={30} className="text-gray-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* Text & Branding */}
        <div className="flex flex-col justify-center min-w-0 pr-1">
          {/* Main callout with Plajah color branding in the text */}
          <p className="font-black text-[11px] sm:text-[12px] uppercase tracking-wide leading-[1.25] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <span className="bg-gradient-to-r from-[#FF8C00] via-[#FF3366] to-[#C77DFF] bg-clip-text text-transparent">
              Scan to watch this channel
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#FF3366] to-[#C77DFF] bg-clip-text text-transparent">
              on your device
            </span>
          </p>

          {/* Underneath: plajah.com written small with the chevron logo */}
          <div className="flex items-center gap-1.5 mt-2">
            <Logo size={14} className="shrink-0" />
            <span className="text-[10.5px] sm:text-[11.5px] font-bold tracking-wider text-white/85 lowercase">
              plajah.com
            </span>
            {channelNumber && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/15 text-white/90 border border-white/15 ml-0.5">
                CH {channelNumber}
              </span>
            )}
          </div>
        </div>

        {/* Copy confirmation toast overlay */}
        {copied && (
          <div className="absolute inset-0 rounded-2xl bg-black/95 backdrop-blur-sm border border-emerald-500/50 flex items-center justify-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider animate-fadeIn">
            <Check size={14} className="stroke-[3]" /> Link Copied
          </div>
        )}
      </div>
    </aside>
  );
};

export default ChannelQrBug;
