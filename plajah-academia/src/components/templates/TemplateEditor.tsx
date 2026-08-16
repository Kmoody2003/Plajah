import { useMemo, useState } from "react";
import type { AssignmentTemplate, LibraryItem, StandardRef } from "../../types/schema";
import { gateForCommercialUse } from "../../lib/licensing/licenseGate";
import { parseStandard } from "../../lib/standards/taxonomy";
import "../../theme/tokens.css";

/**
 * Assignment template editor. The license gate is live in the UI:
 * attaching a non-commercial item while "package as paid course" is on
 * shows exactly which material blocks it and why — the wall is visible,
 * not a surprise at publish time.
 */
export function TemplateEditor({ template, library, onSave }: {
  template: AssignmentTemplate;
  library: Record<string, LibraryItem>;
  onSave: (t: AssignmentTemplate) => Promise<void>;
}) {
  const [t, setT] = useState(template);
  const [saving, setSaving] = useState(false);

  const gate = useMemo(() => gateForCommercialUse(
    t.structure.materials
      .filter(id => library[id])
      .map(id => ({ id, item: library[id] }))
  ), [t.structure.materials, library]);

  const commercialBlocked = t.commercialUse && !gate.allowed;

  function set<K extends keyof AssignmentTemplate["structure"]>(key: K, value: AssignmentTemplate["structure"][K]) {
    setT(prev => ({ ...prev, structure: { ...prev.structure, [key]: value } }));
  }

  async function save() {
    setSaving(true);
    try { await onSave({ ...t, licenseValidated: false }); } // server revalidates
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "var(--pj-font-body)", color: "var(--pj-ink)" }}>
      <label style={labelStyle}>Title
        <input value={t.structure.title} onChange={e => set("title", e.target.value)} style={inputStyle} />
      </label>

      <label style={labelStyle}>Learning objective
        <textarea value={t.structure.objective} onChange={e => set("objective", e.target.value)}
          rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </label>

      <div style={{ margin: "var(--pj-space-3) 0" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Standards</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {t.structure.standardsAlignment.map((s: StandardRef) => {
            const p = parseStandard(s);
            return (
              <span key={s.code} style={{
                fontSize: 12, padding: "4px 10px", borderRadius: 999,
                background: s.framework === "PISA" ? "var(--pj-alert-soft)" : "var(--pj-primary-soft)",
                color: s.framework === "PISA" ? "var(--pj-alert)" : "var(--pj-primary)",
              }}>
                {p.framework}: {p.display}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ margin: "var(--pj-space-3) 0" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Materials</span>
        {t.structure.materials.map(id => {
          const item = library[id];
          if (!item) return null;
          const blocking = gate.blocking.some(b => b.itemId === id);
          return (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              border: `1px solid ${blocking && t.commercialUse ? "var(--pj-block)" : "var(--pj-rule)"}`,
              borderRadius: "var(--pj-radius)", padding: "10px 14px", marginTop: 8,
              background: "var(--pj-surface)",
            }}>
              <div>
                <div style={{ fontSize: 14 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "var(--pj-ink-soft)" }}>{item.source} · {item.license}</div>
              </div>
              {blocking && t.commercialUse && (
                <span style={{ fontSize: 12, color: "var(--pj-block)", fontWeight: 600 }}>
                  Free tier only
                </span>
              )}
            </div>
          );
        })}
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "var(--pj-space-3) 0", cursor: "pointer" }}>
        <input type="checkbox" checked={t.commercialUse}
          onChange={e => setT(prev => ({ ...prev, commercialUse: e.target.checked }))} />
        <span style={{ fontSize: 14 }}>
          Package into a paid course (Independent persona)
          <span style={{ display: "block", fontSize: 12.5, color: "var(--pj-ink-soft)" }}>
            Only public-domain and CC-BY materials can be included in paid
            offerings. Attribution renders automatically.
          </span>
        </span>
      </label>

      {commercialBlocked && (
        <div role="alert" style={{
          border: "1px solid var(--pj-block)", borderRadius: "var(--pj-radius)",
          padding: "12px 16px", fontSize: 13.5, background: "#fdf5f5",
          color: "var(--pj-block)", marginBottom: "var(--pj-space-3)",
        }}>
          {gate.blocking.length} material{gate.blocking.length > 1 ? "s are" : " is"} licensed
          non-commercial ({gate.blocking.map(b => b.license).join(", ")}). Remove
          {gate.blocking.length > 1 ? " them" : " it"} or keep this template free.
        </div>
      )}

      <button onClick={save} disabled={saving || commercialBlocked} style={{
        background: "var(--pj-primary)", color: "#fff", border: "none",
        borderRadius: "var(--pj-radius)", padding: "10px 22px", fontSize: 15,
        cursor: "pointer", opacity: saving || commercialBlocked ? 0.6 : 1,
      }}>
        {saving ? "Saving..." : "Save template"}
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, margin: "var(--pj-space-3) 0",
};
const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 6, padding: "9px 12px",
  fontSize: 14, border: "1px solid var(--pj-rule)", borderRadius: "var(--pj-radius)",
  background: "var(--pj-surface)", color: "var(--pj-ink)", boxSizing: "border-box",
};
