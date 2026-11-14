// Document look — who decides how lessons LOOK when they are handed out.
//   Org admins set the organization's default, and a default per department.
//   Every teacher sets their own look; their assignments wear it instead.
// The words, the answer key and who may open a lesson are the same whatever it wears, so two
// teachers can hand out the same material each in their own style. Order: services/edu/documentLook.
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchOrganization } from '../../../services/organizationService';
import { getLivingTemplateById } from '../../../services/council/livingDocumentTemplates';
import { getOrgLooks, getTeacherLook, lookChoices, lookName, setOrgLooks, setTeacherLook, type EduLook, type OrgLooks } from '../../../services/edu/documentLook';

const CSS = `
.dls-scrim{position:fixed;inset:0;z-index:230;background:rgba(0,0,0,.66)}
.dls{position:fixed;z-index:231;top:50%;left:50%;transform:translate(-50%,-50%);width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:#14101c;border:1px solid rgba(255,255,255,.14);border-radius:18px;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.dls-h{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
.dls-h h3{font:900 1.05rem/1.2 system-ui;flex:1;margin:0}
.dls-b{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;display:grid;gap:16px}
.dls-sec{display:grid;gap:8px}
.dls-sec h4{font:800 .82rem/1.2 system-ui;margin:0}
.dls-sec p{font-size:.78rem;line-height:1.5;color:rgba(255,255,255,.62);margin:0}
.dls-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.dls-pick{display:grid;gap:4px;font-size:.72rem;color:rgba(255,255,255,.6)}
.dls-pick span.sw{display:flex;gap:6px;align-items:center}
.dls-pick i{width:14px;height:14px;border-radius:4px;border:1px solid rgba(255,255,255,.25);display:inline-block}
.dls-pick select{width:100%;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:8px 10px;color:#fff;font-size:.84rem;min-height:38px}
.dls-dept{display:grid;gap:6px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:12px}
.dls-dept strong{font-size:.82rem}
.dls-x{appearance:none;border:0;background:transparent;color:rgba(255,255,255,.7);cursor:pointer;padding:4px}
.dls-st{font-size:.76rem;color:#9ff0c4}
.dls-st.warn{color:#ffd28a}
@media(max-width:560px){.dls-row{grid-template-columns:1fr}.dls{top:0;left:0;transform:none;width:100vw;max-height:100vh;height:100vh;border-radius:0}}
`;

function Pick({ label, test, value, inherit, onChange, disabled }: { label: string; test: boolean; value: string | undefined; inherit: string; onChange: (id: string | undefined) => void; disabled?: boolean }) {
  const tpl = value ? getLivingTemplateById(value) : null;
  return (
    <label className="dls-pick">
      <span className="sw">{label}{tpl && <><i style={{ background: tpl.paperBg }} /><i style={{ background: tpl.primaryAccent }} /><i style={{ background: tpl.inkColor }} /></>}</span>
      <select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || undefined)}>
        <option value="">{inherit}</option>
        {lookChoices(test).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}

export default function DocumentLookSheet({ orgId, orgName, isAdmin, viewerUid, onClose }: {
  orgId: string; orgName: string;
  /** Org owner / admins: may set the organization's and the departments' defaults. */
  isAdmin: boolean;
  viewerUid: string;
  onClose: () => void;
}) {
  const [looks, setLooks] = useState<OrgLooks | null>(null);
  const [mine, setMine] = useState<EduLook | null>(null);
  const [depts, setDepts] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    void getOrgLooks(orgId).then(l => { if (live) setLooks(l); });
    void getTeacherLook(orgId, viewerUid).then(l => { if (live) setMine(l); });
    void fetchOrganization(orgId).then(o => { if (live) setDepts((o?.ministries || []).map(m => ({ id: m.id, name: m.name }))); }).catch(() => {});
    return () => { live = false; };
  }, [orgId, viewerUid]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveMine = async (next: EduLook) => {
    setMine(next);
    const r = await setTeacherLook(orgId, viewerUid, next);
    setStatus(r.synced ? { ok: true, text: 'Your look is saved. New assignments you hand out will wear it.' } : { ok: false, text: 'Saved on this device. It will reach your other devices when you’re back online.' });
  };
  const saveOrg = async (next: OrgLooks) => {
    const before = looks;
    setLooks(next);
    const r = await setOrgLooks(orgId, next);
    if (r.synced) setStatus({ ok: true, text: `Saved for ${orgName}. It applies to work handed out from now on; work already on desks keeps the look it has.` });
    else { setLooks(before); setStatus({ ok: false, text: 'That didn’t save. Only the organization’s admins can change its default look.' }); }
  };

  const orgWs = lookName(looks?.org.worksheet), orgTest = lookName(looks?.org.test);
  return (
    <>
      <style>{CSS}</style>
      <div className="dls-scrim" onClick={onClose} />
      <div className="dls" role="dialog" aria-modal="true" aria-label="Document look">
        <div className="dls-h">
          <h3>Document look</h3>
          <button type="button" className="dls-x" aria-label="Close" onClick={onClose} autoFocus><X size={18} /></button>
        </div>
        <div className="dls-b">
          <div className="dls-sec">
            <h4>Your look</h4>
            <p>Work you hand out wears your look. The lesson itself, its answer key and who can open it are the same for every teacher: only the design is yours. You can still pick a different look for one assignment when you schedule it.</p>
            <div className="dls-row">
              <Pick label="Lessons & worksheets" test={false} value={mine?.worksheet} inherit={`Use ${orgName}’s${orgWs ? ` (${orgWs})` : ''}`} disabled={!mine} onChange={id => void saveMine({ ...mine, worksheet: id })} />
              <Pick label="Tests & quizzes" test value={mine?.test} inherit={`Use ${orgName}’s${orgTest ? ` (${orgTest})` : ''}`} disabled={!mine} onChange={id => void saveMine({ ...mine, test: id })} />
            </div>
          </div>

          <div className="dls-sec">
            <h4>{orgName}’s default</h4>
            <p>{isAdmin ? 'What every lesson wears unless a department or a teacher has chosen their own.' : 'Set by your organization’s admins. It is what lessons wear unless your department or you choose otherwise.'}</p>
            <div className="dls-row">
              <Pick label="Lessons & worksheets" test={false} value={looks?.org.worksheet} inherit="Each lesson’s own look" disabled={!isAdmin || !looks} onChange={id => looks && void saveOrg({ ...looks, org: { ...looks.org, worksheet: id } })} />
              <Pick label="Tests & quizzes" test value={looks?.org.test} inherit="Each lesson’s own look" disabled={!isAdmin || !looks} onChange={id => looks && void saveOrg({ ...looks, org: { ...looks.org, test: id } })} />
            </div>
          </div>

          {(isAdmin || depts.some(d => looks?.departments[d.id])) && depts.length > 0 && (
            <div className="dls-sec">
              <h4>Departments</h4>
              <p>A department’s default is used for its classes instead of the organization’s.</p>
              {depts.filter(d => isAdmin || looks?.departments[d.id]).map(d => {
                const cur = looks?.departments[d.id] || {};
                const set = (patch: EduLook) => looks && void saveOrg({ ...looks, departments: { ...looks.departments, [d.id]: { ...cur, ...patch } } });
                return (
                  <div key={d.id} className="dls-dept">
                    <strong>{d.name}</strong>
                    <div className="dls-row">
                      <Pick label="Lessons & worksheets" test={false} value={cur.worksheet} inherit="Same as the organization" disabled={!isAdmin || !looks} onChange={id => set({ worksheet: id })} />
                      <Pick label="Tests & quizzes" test value={cur.test} inherit="Same as the organization" disabled={!isAdmin || !looks} onChange={id => set({ test: id })} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="dls-sec">
            <h4>Changing the words is different</h4>
            <p>A look never changes a lesson. If you edit what an organization lesson says, Plajah makes your own custom version and files it under My custom lessons in {orgName}; the original stays as it was for everyone else.</p>
          </div>
          {status && <div role="status" className={`dls-st${status.ok ? '' : ' warn'}`}>{status.text}</div>}
        </div>
      </div>
    </>
  );
}
