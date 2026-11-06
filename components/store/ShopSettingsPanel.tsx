import React, { useEffect, useState } from 'react';
import { Save, Tag, Trash2, Plus } from 'lucide-react';
import { Button, Chip } from '../ui';
import { fetchShopSettings, saveShopSettings, listShopCodes, createShopCode, toggleShopCode, deleteShopCode, fetchShopConnections, connectShopService } from '../../services/businessOpsService';
import EntityPlusCard from './EntityPlusCard';
import { DEFAULT_SHOP_SETTINGS, parseShopSettings, returnPolicyText, shippingPolicyText, type ShopSettings, type ShopCode } from '../../services/storeShopCore';

const toCents = (s: string) => Math.max(0, Math.round((parseFloat(s) || 0) * 100));
const toDollars = (c: number) => (c / 100).toFixed(2);

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="type-label-lg block">{label}</span>
    {children}
    {hint && <span className="type-body-sm block" style={{ color: 'var(--on-surface-variant)' }}>{hint}</span>}
  </label>
);
const Money: React.FC<{ value: number; onChange: (c: number) => void; label: string }> = ({ value, onChange, label }) => {
  const [t, setT] = useState(toDollars(value));
  useEffect(() => setT(toDollars(value)), [value]);
  return <input className="pj-input" inputMode="decimal" aria-label={label} value={t} onChange={e => setT(e.target.value)} onBlur={() => onChange(toCents(t))} />;
};

/** Policies, shipping, contact and discount codes for one shop. Saved through the server (owner, managers, org finance staff). */
const ShopSettingsPanel: React.FC<{ businessUid: string; section: 'settings' | 'codes' }> = ({ businessUid, section }) => {
  const [s, setS] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [codes, setCodes] = useState<ShopCode[]>([]);
  const [draft, setDraft] = useState({ code: '', kind: 'PCT' as ShopCode['kind'], value: '10', min: '', maxUses: '', ends: '' });
  const [countryText, setCountryText] = useState('');
  const [conn, setConn] = useState<{ shippo: boolean; shippoTest: boolean; printful: boolean } | null>(null);
  const [tok, setTok] = useState({ shippo: '', printful: '', storeId: '' });
  const connect = async (provider: 'shippo' | 'printful', disconnect = false) => {
    setBusy(true); setMsg('');
    try {
      const r = await connectShopService(businessUid, provider, disconnect ? '' : tok[provider].trim(), provider === 'printful' ? tok.storeId.trim() : undefined);
      setConn(c => ({ ...(c || { shippo: false, shippoTest: false, printful: false }), [provider]: r.connected, ...(provider === 'shippo' ? { shippoTest: r.label === 'test mode' } : {}) }));
      setTok(t => ({ ...t, [provider]: '' }));
      setMsg(r.connected ? `${provider === 'shippo' ? 'Shippo' : 'Printful'} connected${r.label ? ` (${r.label})` : ''}.` : 'Disconnected.');
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (section === 'settings') fetchShopConnections(businessUid).then(setConn).catch(() => {}); }, [businessUid, section]);

  useEffect(() => {
    let live = true;
    fetchShopSettings(businessUid).then(r => { if (live) { setS(r.settings); setCountryText(r.settings.shipping.countries.join(', ')); setLoaded(true); } }).catch(() => setLoaded(true));
    if (section === 'codes') listShopCodes(businessUid).then(r => live && setCodes(r.codes)).catch(e => live && setMsg(e.message));
    return () => { live = false; };
  }, [businessUid, section]);

  const set = (patch: (x: ShopSettings) => ShopSettings) => setS(x => patch(x));
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const next = parseShopSettings({ ...s, shipping: { ...s.shipping, countries: countryText.split(/[\s,]+/).filter(Boolean) } });
      const r = await saveShopSettings(businessUid, next);
      setS(r.settings); setCountryText(r.settings.shipping.countries.join(', '));
      setMsg('Saved. Buyers see these on your product pages, at checkout and in their order emails.');
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const addCode = async () => {
    setBusy(true); setMsg('');
    try {
      await createShopCode(businessUid, {
        code: draft.code, kind: draft.kind, value: draft.kind === 'PCT' ? Number(draft.value) : draft.kind === 'AMOUNT' ? toCents(draft.value) : 0,
        minSubtotalCents: toCents(draft.min), maxUses: Math.max(0, Math.floor(Number(draft.maxUses) || 0)),
        expiresAt: draft.ends ? new Date(`${draft.ends}T23:59:59`).getTime() : 0,
      });
      setDraft(d => ({ ...d, code: '' }));
      setCodes((await listShopCodes(businessUid)).codes);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  if (!loaded) return <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--pj-glass-1)' }} />;
  const card = { background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' };

  if (section === 'codes') return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p className="type-title-sm font-bold flex items-center gap-2"><Tag size={15} /> New discount code</p>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Code"><input className="pj-input" value={draft.code} onChange={e => setDraft(d => ({ ...d, code: e.target.value.toUpperCase() }))} placeholder="FALL25" maxLength={24} /></Row>
          <Row label="Type">
            <select className="pj-input" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as ShopCode['kind'] }))}>
              <option value="PCT">Percent off</option><option value="AMOUNT">Dollars off</option><option value="FREE_SHIP">Free shipping</option>
            </select>
          </Row>
          {draft.kind !== 'FREE_SHIP' && <Row label={draft.kind === 'PCT' ? 'Percent' : 'Amount ($)'}><input className="pj-input" inputMode="decimal" value={draft.value} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))} /></Row>}
          <Row label="Minimum order ($)"><input className="pj-input" inputMode="decimal" value={draft.min} onChange={e => setDraft(d => ({ ...d, min: e.target.value }))} placeholder="None" /></Row>
          <Row label="Total uses"><input className="pj-input" inputMode="numeric" value={draft.maxUses} onChange={e => setDraft(d => ({ ...d, maxUses: e.target.value }))} placeholder="Unlimited" /></Row>
          <Row label="Last day"><input className="pj-input" type="date" value={draft.ends} onChange={e => setDraft(d => ({ ...d, ends: e.target.value }))} /></Row>
        </div>
        <Button variant="primary" size="md" icon={<Plus />} loading={busy} disabled={draft.code.trim().length < 3} onClick={addCode}>Create code</Button>
      </div>
      {msg && <p role="status" className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{msg}</p>}
      {codes.length === 0 ? <p className="type-body-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>No codes yet. Buyers type a code in their cart before they pay.</p> : codes.map(c => (
        <div key={c.code} className="rounded-2xl p-3 flex items-center gap-3" style={card}>
          <div className="flex-1 min-w-0">
            <p className="type-label-lg font-bold">{c.code} <span className="type-body-sm font-normal" style={{ color: 'var(--on-surface-variant)' }}>· {c.kind === 'PCT' ? `${c.value}% off` : c.kind === 'AMOUNT' ? `$${toDollars(c.value)} off` : 'Free shipping'}</span></p>
            <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
              Used {c.uses || 0}{c.maxUses ? ` of ${c.maxUses}` : ''}{c.minSubtotalCents ? ` · min $${toDollars(c.minSubtotalCents)}` : ''}{c.expiresAt ? ` · ends ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
            </p>
          </div>
          <Chip interactive selected={c.active} onClick={async () => { await toggleShopCode(businessUid, c.code, !c.active).catch(e => setMsg(e.message)); setCodes(cs => cs.map(x => (x.code === c.code ? { ...x, active: !c.active } : x))); }}>{c.active ? 'On' : 'Off'}</Chip>
          <Button variant="danger-quiet" size="sm" iconOnly aria-label={`Delete ${c.code}`} onClick={async () => { if (!confirm(`Delete code ${c.code}?`)) return; await deleteShopCode(businessUid, c.code).catch(e => setMsg(e.message)); setCodes(cs => cs.filter(x => x.code !== c.code)); }}><Trash2 /></Button>
        </div>
      ))}
    </div>
  );

  const sh = s.shipping, rt = s.returns;
  return (
    <div className="space-y-3">
      <EntityPlusCard shopId={businessUid} />
      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p className="type-title-sm font-bold">Returns &amp; refunds</p>
        <label className="type-body-md flex items-center gap-2"><input type="checkbox" checked={rt.accepts} onChange={e => set(x => ({ ...x, returns: { ...x.returns, accepts: e.target.checked } }))} /> I accept returns</label>
        {rt.accepts && <div className="grid grid-cols-2 gap-2">
          <Row label="Days to return"><input className="pj-input" inputMode="numeric" value={rt.windowDays} onChange={e => set(x => ({ ...x, returns: { ...x.returns, windowDays: Number(e.target.value) || 0 } }))} /></Row>
          <Row label="Restocking fee (%)"><input className="pj-input" inputMode="numeric" value={rt.restockingFeePct} onChange={e => set(x => ({ ...x, returns: { ...x.returns, restockingFeePct: Number(e.target.value) || 0 } }))} /></Row>
          <Row label="Return shipping paid by">
            <select className="pj-input" value={rt.buyerPaysReturnShipping ? 'buyer' : 'shop'} onChange={e => set(x => ({ ...x, returns: { ...x.returns, buyerPaysReturnShipping: e.target.value === 'buyer' } }))}><option value="buyer">The buyer</option><option value="shop">My shop</option></select>
          </Row>
        </div>}
        <Row label="Conditions (optional)" hint='For example: "Unworn with tags on. Sale items and custom orders are final."'>
          <textarea className="pj-input" rows={2} value={rt.notes} maxLength={600} onChange={e => set(x => ({ ...x, returns: { ...x.returns, notes: e.target.value } }))} />
        </Row>
        <p className="type-body-sm rounded-xl p-2.5" style={{ background: 'var(--pj-glass-2)' }}>{returnPolicyText(rt)}</p>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p className="type-title-sm font-bold">Shipping</p>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Ships in (min days)"><input className="pj-input" inputMode="numeric" value={sh.processingDaysMin} onChange={e => set(x => ({ ...x, shipping: { ...x.shipping, processingDaysMin: Number(e.target.value) || 0 } }))} /></Row>
          <Row label="Ships in (max days)" hint="The law expects you to ship in the time you state."><input className="pj-input" inputMode="numeric" value={sh.processingDaysMax} onChange={e => set(x => ({ ...x, shipping: { ...x.shipping, processingDaysMax: Number(e.target.value) || 0 } }))} /></Row>
          <Row label={`Standard rate (${sh.domesticCountry})`}><Money label="Standard rate" value={sh.standardCents} onChange={c => set(x => ({ ...x, shipping: { ...x.shipping, standardCents: c } }))} /></Row>
          <Row label="Each extra item"><Money label="Each extra item" value={sh.additionalItemCents} onChange={c => set(x => ({ ...x, shipping: { ...x.shipping, additionalItemCents: c } }))} /></Row>
          <Row label="Free shipping from" hint="0 = never free"><Money label="Free shipping from" value={sh.freeOverCents} onChange={c => set(x => ({ ...x, shipping: { ...x.shipping, freeOverCents: c } }))} /></Row>
          <Row label="Express rate" hint="0 = no express option"><Money label="Express rate" value={sh.expressCents} onChange={c => set(x => ({ ...x, shipping: { ...x.shipping, expressCents: c } }))} /></Row>
        </div>
        <label className="type-body-md flex items-center gap-2"><input type="checkbox" checked={sh.international} onChange={e => set(x => ({ ...x, shipping: { ...x.shipping, international: e.target.checked } }))} /> Ship to other countries</label>
        {sh.international && <div className="grid grid-cols-2 gap-2">
          <Row label="Countries" hint="Two-letter codes, e.g. CA, GB, MX"><input className="pj-input" value={countryText} onChange={e => setCountryText(e.target.value.toUpperCase())} /></Row>
          <Row label="International rate"><Money label="International rate" value={sh.internationalCents} onChange={c => set(x => ({ ...x, shipping: { ...x.shipping, internationalCents: c } }))} /></Row>
          <Row label="Each extra item (intl)"><Money label="Each extra international item" value={sh.internationalAdditionalCents} onChange={c => set(x => ({ ...x, shipping: { ...x.shipping, internationalAdditionalCents: c } }))} /></Row>
        </div>}
        <label className="type-body-md flex items-center gap-2"><input type="checkbox" checked={sh.pickup} onChange={e => set(x => ({ ...x, shipping: { ...x.shipping, pickup: e.target.checked } }))} /> Offer local pickup</label>
        {sh.pickup && <Row label="Pickup details"><input className="pj-input" value={sh.pickupNote} maxLength={300} placeholder="Where and when to pick up" onChange={e => set(x => ({ ...x, shipping: { ...x.shipping, pickupNote: e.target.value } }))} /></Row>}
        <label className="type-body-md flex items-center gap-2"><input type="checkbox" checked={sh.taxShipping} onChange={e => set(x => ({ ...x, shipping: { ...x.shipping, taxShipping: e.target.checked } }))} /> Charge sales tax on shipping</label>
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Sales tax uses the rates in your register settings. Rules differ by state; check with a tax professional.</p>
        <p className="type-body-sm rounded-xl p-2.5" style={{ background: 'var(--pj-glass-2)' }}>{shippingPolicyText(parseShopSettings({ ...s, shipping: { ...sh, countries: countryText.split(/[\s,]+/).filter(Boolean) } }).shipping)}</p>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p className="type-title-sm font-bold">Shipping labels</p>
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Buy labels right from an order. Labels are billed to your own Shippo account; Plajah never pays for them or marks them up.</p>
        {conn?.shippo ? (
          <div className="flex items-center gap-2 flex-wrap"><Chip selected>Shippo connected{conn.shippoTest ? ' · test mode' : ''}</Chip><Button variant="ghost" size="sm" onClick={() => connect('shippo', true)}>Disconnect</Button></div>
        ) : (
          <div className="flex gap-2"><input className="pj-input flex-1 min-w-0" type="password" autoComplete="off" value={tok.shippo} onChange={e => setTok(t => ({ ...t, shippo: e.target.value }))} placeholder="Shippo API token (Settings → API in Shippo)" aria-label="Shippo API token" /><Button variant="secondary" size="md" loading={busy} disabled={!tok.shippo.trim()} onClick={() => connect('shippo')}>Connect</Button></div>
        )}
        <p className="type-label-lg">Return address (printed on labels, never shown to buyers)</p>
        <div className="grid grid-cols-2 gap-2">
          {([['name', 'Name or shop name'], ['street1', 'Street'], ['street2', 'Apt / suite'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['phone', 'Phone'], ['email', 'Email']] as const).map(([k, label]) => (
            <input key={k} className="pj-input" aria-label={label} placeholder={label} value={(s.shipFrom as any)[k]} onChange={e => set(x => ({ ...x, shipFrom: { ...x.shipFrom, [k]: e.target.value } }))} />
          ))}
        </div>
        <p className="type-label-lg">Your usual box</p>
        <div className="grid grid-cols-5 gap-2">
          {([['lengthIn', 'Length (in)'], ['widthIn', 'Width (in)'], ['heightIn', 'Height (in)'], ['packagingOz', 'Box + packing (oz)'], ['defaultItemOz', 'Item if no weight (oz)']] as const).map(([k, label]) => (
            <Row key={k} label={label}><input className="pj-input" inputMode="numeric" value={(s.parcel as any)[k]} onChange={e => set(x => ({ ...x, parcel: { ...x.parcel, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 } }))} /></Row>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p className="type-title-sm font-bold">Print on demand</p>
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Paid orders for products set to Printful go to your own Printful account, which charges you for production and shipping. Price your products and shipping to cover it.</p>
        {conn?.printful ? (
          <div className="flex items-center gap-2 flex-wrap"><Chip selected>Printful connected</Chip><Button variant="ghost" size="sm" onClick={() => connect('printful', true)}>Disconnect</Button></div>
        ) : (
          <div className="grid grid-cols-[1fr_8rem_auto] gap-2">
            <input className="pj-input min-w-0" type="password" autoComplete="off" value={tok.printful} onChange={e => setTok(t => ({ ...t, printful: e.target.value }))} placeholder="Printful private token" aria-label="Printful private token" />
            <input className="pj-input" value={tok.storeId} onChange={e => setTok(t => ({ ...t, storeId: e.target.value }))} placeholder="Store id (if asked)" aria-label="Printful store id" />
            <Button variant="secondary" size="md" loading={busy} disabled={!tok.printful.trim()} onClick={() => connect('printful')}>Connect</Button>
          </div>
        )}
        <label className="type-body-md flex items-center gap-2"><input type="checkbox" checked={s.printfulAutoSubmit} onChange={e => set(x => ({ ...x, printfulAutoSubmit: e.target.checked }))} /> Send paid orders straight to production</label>
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Off: each order waits as a draft in Printful for you to check and confirm.</p>
      </div>

      <div className="rounded-2xl p-4 space-y-2" style={card}>
        <p className="type-title-sm font-bold">Chargebacks</p>
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>If a buyer’s bank disputes a payment, your share of it and the bank’s dispute fee are taken back from your Stripe balance while it’s decided. If you win, the disputed amount comes back to you. Clear photos, tracking numbers and a visible return policy are what win disputes.</p>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <p className="type-title-sm font-bold">Contact</p>
        <Row label="Shop email" hint="Shown to buyers on product pages, order emails and packing slips. New-order emails come here too.">
          <input className="pj-input" type="email" value={s.contactEmail} onChange={e => set(x => ({ ...x, contactEmail: e.target.value }))} placeholder="shop@example.com" />
        </Row>
      </div>
      {msg && <p role="status" className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{msg}</p>}
      <Button variant="primary" size="md" fullWidth icon={<Save />} loading={busy} onClick={save}>Save shop settings</Button>
    </div>
  );
};

export default ShopSettingsPanel;
