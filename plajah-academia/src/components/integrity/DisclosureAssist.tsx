import { useState } from "react";
import "../../theme/tokens.css";

/**
 * One-screen prompt at Independent Persona activation. Most districts
 * permit outside employment but expect disclosure and prohibit use of
 * district time or resources. Generates a disclosure letter the
 * teacher can hand to HR, then records acknowledgment.
 */
export function DisclosureAssist({ teacherName, districtName, onAcknowledge }: {
  teacherName: string;
  districtName: string;
  onAcknowledge: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  function downloadLetter() {
    const today = new Date().toLocaleDateString();
    const letter = [
      `${today}`,
      ``,
      `To: Human Resources, ${districtName}`,
      `Re: Disclosure of outside employment`,
      ``,
      `Dear HR team,`,
      ``,
      `In line with district policy on outside employment, I'm writing to`,
      `disclose that I operate an independent teaching practice on the`,
      `Plajah platform, entirely outside of contracted hours and without`,
      `use of district time, facilities, equipment, or materials.`,
      ``,
      `The platform enforces this separation technically: my independent`,
      `tools are automatically disabled while I'm on school grounds or`,
      `within contracted hours, paid tutoring is blocked for students on`,
      `my current rosters, and an exportable log records this enforcement.`,
      ``,
      `I'm happy to provide that log or answer any questions.`,
      ``,
      `Sincerely,`,
      `${teacherName}`,
    ].join("\n");
    const blob = new Blob([letter], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "outside-employment-disclosure.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function ack() {
    setBusy(true);
    try { await onAcknowledge(); } finally { setBusy(false); }
  }

  return (
    <section style={{
      maxWidth: 520, margin: "0 auto", background: "var(--pj-surface)",
      border: "1px solid var(--pj-rule)", borderRadius: "var(--pj-radius)",
      padding: "var(--pj-space-4)",
    }}>
      <h2 style={{ fontFamily: "var(--pj-font-display)", fontSize: 22, marginTop: 0, color: "var(--pj-ink)" }}>
        Before you open your practice
      </h2>
      <p style={{ color: "var(--pj-ink-soft)", lineHeight: 1.65, fontSize: 15 }}>
        Most districts allow outside teaching as long as it doesn't conflict
        with your duties and you disclose it. Plajah keeps you on the right
        side of that automatically — Silent Mode on campus, a block on paid
        tutoring for your current students, and a log you own.
      </p>
      <p style={{ color: "var(--pj-ink-soft)", lineHeight: 1.65, fontSize: 15 }}>
        The one step only you can take: tell your district. Here's a letter
        to make that easy.
      </p>
      <div style={{ display: "flex", gap: "var(--pj-space-2)", marginTop: "var(--pj-space-3)", flexWrap: "wrap" }}>
        <button onClick={downloadLetter} style={{
          background: "transparent", color: "var(--pj-primary)",
          border: "1px solid var(--pj-primary)", borderRadius: "var(--pj-radius)",
          padding: "10px 18px", fontSize: 14, cursor: "pointer",
        }}>
          Download disclosure letter
        </button>
        <button onClick={ack} disabled={busy} style={{
          background: "var(--pj-primary)", color: "#fff", border: "none",
          borderRadius: "var(--pj-radius)", padding: "10px 18px",
          fontSize: 14, cursor: "pointer", opacity: busy ? 0.6 : 1,
        }}>
          {busy ? "Recording..." : "I understand my district's policy"}
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--pj-ink-soft)", marginTop: "var(--pj-space-3)", marginBottom: 0 }}>
        District policies vary — check yours, and ask HR if anything is
        unclear. Plajah can't give legal advice.
      </p>
    </section>
  );
}
