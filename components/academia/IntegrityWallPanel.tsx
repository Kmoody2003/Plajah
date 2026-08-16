// IntegrityWallPanel — the teacher's control surface for the Integrity Wall.
//
// Four sections, in the order a teacher actually needs them:
//   1. Status      — which personas are active, whether Silent Mode is holding right now
//   2. Silent Mode — auto/manual, the campus geofences, the contracted-hours fence
//   3. Rosters     — submit a class roster; hashed ON THIS DEVICE, raw names never transmitted
//   4. Record      — the append-only log, exportable as CSV; the artifact they hand to HR
//
// Rendered as a tab inside TeacherToolsView. Everything here is District-persona configuration,
// which is why it lives on the teacher-tools side of the app and not in the creator dashboard.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, MapPin, Clock, Radio, Users, FileDown, Plus, Trash2, Loader2,
  Check, AlertTriangle, Crosshair, Lock,
} from 'lucide-react';
import {
  loadIntegrity, ensureIntegrityDoc, saveIntegritySettings, acknowledgeDisclosure,
  loadIntegrityLog, integrityLogToCsv, eventLabel, submitRoster, loadRosterSummaries,
  DEFAULT_INTEGRITY_SETTINGS,
  type TeacherIntegrityDoc, type IntegritySettings, type IntegrityEvent,
  type Geofence, type RosterSummary, type BlockScope,
} from '../../services/academiaIntegrity';
import { getCurrentCoords, locationAvailable, type SilentModeState } from '../../services/campusSilentMode';
import DisclosureAssist from './DisclosureAssist';
import { T, cardStyle, chip, btn, badge, downloadText } from './integrityTheme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const BLOCK_SCOPES: Array<{ id: BlockScope; label: string; note: string }> = [
  { id: 'tutoring_only', label: 'Paid 1:1 only', note: 'Blocks paid tutoring for current students. Matches how most state ethics opinions draw the line.' },
  { id: 'all_paid', label: 'All paid offerings', note: 'Also blocks paid course and workshop purchases by current students.' },
  { id: 'all', label: 'Everything paid or free', note: 'Strictest. Some districts require it; it also blocks harmless free interactions.' },
];

const Section: React.FC<{ icon: React.ElementType; title: string; sub?: string; children: React.ReactNode }> =
  ({ icon: Icon, title, sub, children }) => (
    <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: sub ? 4 : 14 }}>
        <Icon size={16} color={T.orange} />
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{title}</h3>
      </div>
      {sub && <p style={{ margin: '0 0 16px', color: T.faint, fontSize: 12.5, lineHeight: 1.6 }}>{sub}</p>}
      {children}
    </section>
  );

const input: React.CSSProperties = {
  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
  color: T.ink, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
};

interface Props {
  uid: string;
  teacherName?: string;
  /** Live engine state, when the shell has one mounted. Read-only here. */
  silentState?: SilentModeState | null;
}

const IntegrityWallPanel: React.FC<Props> = ({ uid, teacherName = 'Your name', silentState }) => {
  const [record, setRecord] = useState<TeacherIntegrityDoc | null>(null);
  const [settings, setSettings] = useState<IntegritySettings>(DEFAULT_INTEGRITY_SETTINGS);
  const [events, setEvents] = useState<IntegrityEvent[]>([]);
  const [rosters, setRosters] = useState<RosterSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const doc = await ensureIntegrityDoc(uid);
      if (!alive) return;
      setRecord(doc);
      setSettings(doc.integritySettings);
      setEvents(await loadIntegrityLog(uid));
      setRosters(await loadRosterSummaries(uid));
    })();
    return () => { alive = false; };
  }, [uid]);

  const districtActive = !!record?.personas.district?.active;
  const districtName = record?.personas.district?.districtName || 'your district';

  const persist = async (next: IntegritySettings) => {
    setSettings(next);
    setSaving(true);
    setError(null);
    const ok = await saveIntegritySettings(uid, next);
    setSaving(false);
    if (ok) setSavedAt(Date.now());
    else setError("That change was refused. Silent Mode can't be switched off while a verified district persona is active.");
  };

  // ── Geofences ──
  const addGeofenceHere = async () => {
    setError(null);
    const coords = await getCurrentCoords();
    if (!coords) {
      setError('No location fix. Grant location permission, or add the school coordinates by hand.');
      return;
    }
    const fence: Geofence = {
      schoolId: `school_${Date.now().toString(36)}`,
      label: 'My school',
      lat: Number(coords.lat.toFixed(6)),
      lng: Number(coords.lng.toFixed(6)),
      radiusMeters: 200,
    };
    await persist({ ...settings, geofences: [...settings.geofences, fence] });
  };

  const updateGeofence = (i: number, patch: Partial<Geofence>) => {
    const geofences = settings.geofences.map((g, idx) => (idx === i ? { ...g, ...patch } : g));
    setSettings({ ...settings, geofences });
  };

  const removeGeofence = (i: number) =>
    persist({ ...settings, geofences: settings.geofences.filter((_, idx) => idx !== i) });

  // ── Schedule fence ──
  const toggleDay = (day: number) => {
    const hours = settings.scheduleFence.contractHours;
    const exists = hours.some(h => h.day === day);
    const next = exists
      ? hours.filter(h => h.day !== day)
      : [...hours, { day: day as 0 | 1 | 2 | 3 | 4 | 5 | 6, start: '07:30', end: '15:45' }];
    persist({ ...settings, scheduleFence: { ...settings.scheduleFence, contractHours: next } });
  };

  const setDayTime = (day: number, field: 'start' | 'end', value: string) => {
    const contractHours = settings.scheduleFence.contractHours.map(h =>
      h.day === day ? { ...h, [field]: value } : h);
    setSettings({ ...settings, scheduleFence: { ...settings.scheduleFence, contractHours } });
  };

  const exportLog = () =>
    downloadText(
      `plajah-integrity-record-${new Date().toISOString().slice(0, 10)}.csv`,
      integrityLogToCsv(events),
      'text/csv;charset=utf-8',
    );

  const statusColor = silentState?.engaged ? T.warning : T.success;

  return (
    <div style={{ fontFamily: T.font, color: T.ink }}>
      {/* ── 1. Status ───────────────────────────────────────────────────────── */}
      <Section
        icon={ShieldCheck}
        title="Your integrity wall"
        sub="One login, two hard-separated sides. Nothing on your creator side can read your district side — the only thing that crosses is a yes/no answer at checkout, and it never says why."
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={badge(districtActive ? T.cyan : T.faint)}>
            <Users size={11} /> District {districtActive ? `· ${districtName}` : '· not linked'}
          </span>
          <span style={badge(record?.personas.independent?.active ? T.magenta : T.faint)}>
            <Radio size={11} /> Independent {record?.personas.independent?.active ? '· active' : '· not opened'}
          </span>
          <span style={badge(statusColor)}>
            <Lock size={11} /> Silent Mode {silentState?.engaged ? `· holding (${silentState.trigger})` : '· clear'}
          </span>
        </div>
        {rosters.length > 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
            {rosters.filter(r => !r.expired).length} active roster
            {rosters.filter(r => !r.expired).length === 1 ? '' : 's'} on file. Paid bookings from
            those students are blocked until the term ends.
          </p>
        )}
      </Section>

      {/* ── 2. Silent Mode ──────────────────────────────────────────────────── */}
      <Section
        icon={MapPin}
        title="Campus Silent Mode"
        sub="While you're at school or inside contracted hours, your creator tools pause. Your storefront stays live to buyers the whole time — you simply can't transact, message, or edit from campus."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {(['auto', 'manual', 'off'] as const).map(mode => {
            const locked = mode === 'off' && districtActive;
            return (
              <button
                key={mode}
                disabled={locked}
                title={locked ? 'Not available while a verified district persona is active.' : undefined}
                onClick={() => persist({ ...settings, campusSilentMode: mode })}
                style={{ ...chip(settings.campusSilentMode === mode), opacity: locked ? 0.4 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
              >
                {mode === 'auto' ? 'Automatic' : mode === 'manual' ? 'Manual only' : 'Off'}
              </button>
            );
          })}
          {saving && <Loader2 size={14} className="animate-spin" color={T.muted} />}
          {!saving && savedAt && <span style={{ ...badge(T.success), alignSelf: 'center' }}><Check size={11} /> Saved</span>}
        </div>

        {!locationAvailable() && settings.campusSilentMode === 'auto' && (
          <p style={{
            fontSize: 12.5, lineHeight: 1.6, color: T.warning, background: `${T.warning}14`,
            border: `1px solid ${T.warning}40`, borderRadius: 10, padding: '10px 14px', margin: '0 0 16px',
          }}>
            <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
            This device can't provide location. Silent Mode will fall back to your contracted
            hours — set them below, or it has nothing to hold on.
          </p>
        )}

        {/* Geofences */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 12.5 }}>Campus boundaries</strong>
            <button onClick={addGeofenceHere} style={btn('outline', T.cyan)}>
              <Crosshair size={13} /> Add my current location
            </button>
          </div>
          {settings.geofences.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.faint, margin: 0 }}>
              None yet. Stand at your school and tap the button above — 200 m is a good default radius.
            </p>
          ) : settings.geofences.map((g, i) => (
            <div key={g.schoolId} style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 'none',
            }}>
              <input
                value={g.label}
                onChange={e => updateGeofence(i, { label: e.target.value })}
                onBlur={() => persist(settings)}
                style={{ ...input, flex: '1 1 140px' }}
                aria-label="School name"
              />
              <span style={{ fontSize: 11.5, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>
                {g.lat.toFixed(4)}, {g.lng.toFixed(4)}
              </span>
              <label style={{ fontSize: 11.5, color: T.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <input
                  type="number" min={50} max={1000} step={25} value={g.radiusMeters}
                  onChange={e => updateGeofence(i, { radiusMeters: Number(e.target.value) })}
                  onBlur={() => persist(settings)}
                  style={{ ...input, width: 76 }}
                />
                m
              </label>
              <button onClick={() => removeGeofence(i)} style={{ ...btn('ghost', T.danger), padding: 8 }} aria-label={`Remove ${g.label}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Schedule fence */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.scheduleFence.enabled}
              onChange={e => persist({ ...settings, scheduleFence: { ...settings.scheduleFence, enabled: e.target.checked } })}
            />
            <strong style={{ fontSize: 12.5 }}>Also hold during my contracted hours</strong>
          </label>
          <p style={{ fontSize: 12, color: T.faint, lineHeight: 1.6, margin: '0 0 12px' }}>
            <Clock size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
            This is what covers field trips, PD days, and a phone with location switched off. If we
            can't get a fix during these hours, Silent Mode engages anyway.
          </p>
          {settings.scheduleFence.enabled && DAYS.map((label, day) => {
            const entry = settings.scheduleFence.contractHours.find(h => h.day === day);
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                <button onClick={() => toggleDay(day)} style={{ ...chip(!!entry, T.cyan), minWidth: 62 }}>{label}</button>
                {entry && (
                  <>
                    <input type="time" value={entry.start} onChange={e => setDayTime(day, 'start', e.target.value)} onBlur={() => persist(settings)} style={input} aria-label={`${label} start`} />
                    <span style={{ color: T.faint, fontSize: 12 }}>to</span>
                    <input type="time" value={entry.end} onChange={e => setDayTime(day, 'end', e.target.value)} onBlur={() => persist(settings)} style={input} aria-label={`${label} end`} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 3. Rosters ──────────────────────────────────────────────────────── */}
      <RosterSection uid={uid} rosters={rosters} onSubmitted={async () => setRosters(await loadRosterSummaries(uid))} />

      {/* ── 4. Record ───────────────────────────────────────────────────────── */}
      <Section
        icon={FileDown}
        title="Your integrity record"
        sub="Append-only, and yours. Neither Plajah nor you can edit or delete an entry after it's written — which is exactly what makes it worth showing to HR."
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={exportLog} disabled={!events.length} style={{ ...btn('outline', T.cyan), opacity: events.length ? 1 : 0.4 }}>
            <FileDown size={14} /> Export as CSV
          </button>
          <span style={{ alignSelf: 'center', fontSize: 12, color: T.faint }}>
            {events.length ? `${events.length} entries` : 'No entries yet'}
          </span>
        </div>
        {events.slice(0, 25).map((e, i) => (
          <div key={e.id} style={{
            display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
            padding: '8px 0', borderTop: i ? `1px solid ${T.border}` : 'none', fontSize: 12.5,
          }}>
            <span style={{ color: T.faint, fontVariantNumeric: 'tabular-nums', minWidth: 148 }}>
              {new Date(e.at).toLocaleString()}
            </span>
            <span style={{ color: T.ink, fontWeight: 700 }}>{eventLabel(e.kind)}</span>
            {e.trigger && <span style={{ color: T.muted }}>· {e.trigger}</span>}
            {e.note && <span style={{ color: T.faint }}>· {e.note}</span>}
          </div>
        ))}
      </Section>

      {/* Disclosure — only meaningful once there's a district to disclose to. */}
      {districtActive && !settings.disclosureAcknowledged && (
        <DisclosureAssist
          teacherName={teacherName}
          districtName={districtName}
          onAcknowledge={async () => {
            const ok = await acknowledgeDisclosure(uid);
            if (ok) {
              const fresh = await loadIntegrity(uid);
              if (fresh) { setRecord(fresh); setSettings(fresh.integritySettings); }
              setEvents(await loadIntegrityLog(uid));
            }
            return ok;
          }}
        />
      )}

      {error && (
        <p role="alert" style={{
          color: T.danger, fontSize: 12.5, lineHeight: 1.6, background: `${T.danger}14`,
          border: `1px solid ${T.danger}40`, borderRadius: 10, padding: '10px 14px',
        }}>
          {error}
        </p>
      )}
    </div>
  );
};

// ── Roster submission ───────────────────────────────────────────────────────────
// The privacy-critical surface. Student references are hashed with the district's salt IN THIS
// COMPONENT, before anything is written — Plajah receives hashes and never sees a name. That is
// what keeps the FERPA posture clean: no education record in identifiable form is ever ingested.

const RosterSection: React.FC<{
  uid: string;
  rosters: RosterSummary[];
  onSubmitted: () => Promise<void>;
}> = ({ uid, rosters, onSubmitted }) => {
  const [open, setOpen] = useState(false);
  const [termId, setTermId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [salt, setSalt] = useState('');
  const [expires, setExpires] = useState('');
  const [scope, setScope] = useState<BlockScope>('tutoring_only');
  const [refs, setRefs] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const parsed = useMemo(
    () => refs.split(/[\n,]/).map(s => s.trim()).filter(Boolean),
    [refs],
  );

  const canSubmit = termId && districtId && salt.length >= 16 && expires && parsed.length > 0 && !busy;

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const out = await submitRoster(uid, {
      termId: termId.trim(),
      districtId: districtId.trim(),
      schoolId: schoolId.trim(),
      blockScope: scope,
      expiresAt: new Date(`${expires}T23:59:59`).getTime(),
      studentRefs: parsed,
      districtSalt: salt,
    });
    setBusy(false);
    if (out.ok) {
      setResult(`${out.count} references hashed and stored. No names left this device.`);
      setRefs('');
      setSalt('');
      await onSubmitted();
    } else {
      setResult("Couldn't store that roster. Check your connection and try again.");
    }
  };

  return (
    <Section
      icon={Users}
      title="Rosters and the conflict block"
      sub="Paid tutoring is blocked for students you currently grade — and the block expires with the term, because that's when your grading power over them ends."
    >
      {rosters.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {rosters.map((r, i) => (
            <div key={r.termId} style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '8px 0', borderTop: i ? `1px solid ${T.border}` : 'none', fontSize: 12.5,
            }}>
              <strong>{r.termId}</strong>
              <span style={{ color: T.muted }}>{r.count} students</span>
              <span style={badge(r.expired ? T.faint : T.success)}>
                {r.expired ? 'Expired' : `Until ${new Date(r.expiresAt).toLocaleDateString()}`}
              </span>
              <span style={{ color: T.faint }}>
                {BLOCK_SCOPES.find(s => s.id === r.blockScope)?.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} style={btn('outline', T.orange)}>
          <Plus size={14} /> Submit a roster
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{
            fontSize: 12, lineHeight: 1.65, color: T.muted, background: T.cardAlt,
            border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', margin: 0,
          }}>
            <Lock size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
            Names are hashed on this device before anything is sent. Plajah stores only the hashes,
            and the salt that makes them readable is held separately by your district — so a full
            read of our database still can't tell anyone who you teach. Get the salt from your
            district's IT or Plajah administrator; don't invent one, or the block won't match.
          </p>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 4 }}>
              Term ID
              <input value={termId} onChange={e => setTermId(e.target.value)} placeholder="2026-fall" style={input} />
            </label>
            <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 4 }}>
              District ID
              <input value={districtId} onChange={e => setDistrictId(e.target.value)} placeholder="detroit-pscd" style={input} />
            </label>
            <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 4 }}>
              School ID
              <input value={schoolId} onChange={e => setSchoolId(e.target.value)} placeholder="east-high" style={input} />
            </label>
            <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 4 }}>
              Term ends
              <input type="date" value={expires} onChange={e => setExpires(e.target.value)} style={input} />
            </label>
          </div>

          <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 4 }}>
            District salt (never stored on your account)
            <input type="password" value={salt} onChange={e => setSalt(e.target.value)} placeholder="at least 16 characters" style={input} />
          </label>

          <div>
            <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6 }}>How far the block reaches</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {BLOCK_SCOPES.map(s => (
                <button key={s.id} onClick={() => setScope(s.id)} style={chip(scope === s.id)} title={s.note}>{s.label}</button>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: T.faint, margin: '8px 0 0', lineHeight: 1.6 }}>
              {BLOCK_SCOPES.find(s => s.id === scope)?.note}
            </p>
          </div>

          <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 4 }}>
            Student references — one per line (student IDs are better than names)
            <textarea
              value={refs}
              onChange={e => setRefs(e.target.value)}
              rows={6}
              style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace,monospace' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={submit} disabled={!canSubmit} style={{ ...btn('solid', T.orange), opacity: canSubmit ? 1 : 0.45 }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Hash &amp; submit {parsed.length ? `(${parsed.length})` : ''}
            </button>
            <button onClick={() => setOpen(false)} style={btn('ghost', T.muted)}>Cancel</button>
          </div>

          {result && <p style={{ fontSize: 12.5, color: T.success, margin: 0 }}>{result}</p>}
        </div>
      )}
    </Section>
  );
};

export default IntegrityWallPanel;
