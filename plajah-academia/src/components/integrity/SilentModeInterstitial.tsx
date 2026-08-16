import { useEffect, useState } from "react";
import type { SilentModeEngine, SilentModeState } from "../../lib/integrity/silentMode";
import "../../theme/tokens.css";

/**
 * Full-screen lock over the Independent (creator) dashboard while
 * Silent Mode is engaged. The storefront stays live to buyers; the
 * TEACHER can't transact, message, or edit until they're off campus.
 */
export function SilentModeInterstitial({ engine }: { engine: SilentModeEngine }) {
  const [state, setState] = useState<SilentModeState | null>(null);
  const [holdMsg, setHoldMsg] = useState(false);

  useEffect(() => engine.subscribe(setState), [engine]);
  if (!state?.engaged) return null;

  const since = state.since ? new Date(state.since).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const triggerLabel =
    state.trigger === "geofence" ? "you're on campus" :
    state.trigger === "schedule" ? "you're within contracted hours" :
    "you turned it on";

  async function tryExit() {
    const res = await engine.setManual(false);
    if (!res.ok) setHoldMsg(true);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Silent Mode" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "var(--pj-paper)", display: "grid", placeItems: "center",
      padding: "var(--pj-space-4)",
    }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <div aria-hidden style={{
          width: 56, height: 56, margin: "0 auto var(--pj-space-3)",
          borderRadius: "50%", border: "2px solid var(--pj-primary)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--pj-font-display)", fontSize: 24, color: "var(--pj-primary)",
        }}>S</div>
        <h1 style={{ fontFamily: "var(--pj-font-display)", fontSize: 26, margin: "0 0 var(--pj-space-2)", color: "var(--pj-ink)" }}>
          Silent Mode is on
        </h1>
        <p style={{ color: "var(--pj-ink-soft)", fontSize: 15, lineHeight: 1.6, margin: "0 0 var(--pj-space-2)" }}>
          Your creator tools are paused because {triggerLabel}. Your storefront
          stays live for buyers — nothing is lost, and queued notifications
          arrive when you leave.
        </p>
        <p style={{ fontSize: 13, color: "var(--pj-ink-soft)", margin: "0 0 var(--pj-space-3)" }}>
          Engaged at {since} · Logged to your integrity record
        </p>
        {state.trigger === "manual" ? (
          <button onClick={tryExit} style={btnStyle}>Turn off Silent Mode</button>
        ) : (
          <>
            <button onClick={tryExit} style={btnStyle}>I've left campus</button>
            {holdMsg && (
              <p role="status" style={{ fontSize: 13, color: "var(--pj-alert)", marginTop: "var(--pj-space-2)" }}>
                Silent Mode stays on until the campus boundary clears or a
                30-minute cooldown passes. This protects your integrity record.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "var(--pj-primary)", color: "#fff", border: "none",
  borderRadius: "var(--pj-radius)", padding: "10px 22px",
  fontSize: 15, cursor: "pointer",
};
