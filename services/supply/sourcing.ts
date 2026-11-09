// BOM sourcing: turn schematic parts into distributor search terms, and normalise DigiKey / Mouser
// search replies into one offer shape. The server makes the calls (keys stay server-side).

import type { Circuit, CPart } from '../elec/circuit';
import { compByKind, ledColor } from '../elec/components';
import { MODULES } from '../elec/modules';

export interface SourceLine { refs: string[]; qty: number; part: string; query: string; note?: string; authorised?: boolean }
export interface Offer { supplier: 'digikey' | 'mouser'; mpn: string; maker: string; description: string; stock: number; price: number | null; currency: string; url: string; datasheet?: string; rohs?: string; lifecycle?: string }

const q1 = (p: CPart): { query: string; note?: string; authorised?: boolean } => {
  const v = (k: string) => String(p.params[k] ?? '');
  switch (p.kind) {
    case 'resistor': return { query: `${v('R')} ohm ${Number(v('P')) >= 1 ? '1W' : '1/4W'} metal film resistor through hole` };
    case 'potentiometer': return { query: `${v('R')} potentiometer 16mm 6mm shaft` };
    case 'capacitor': return { query: `${v('C')}F ceramic capacitor 50V` };
    case 'electrolytic': return { query: `${v('C')}F electrolytic capacitor 25V` };
    case 'led': return { query: `5mm ${String(p.params.color ?? 'red')} LED ${ledColor(String(p.params.color)).vf}V` };
    case 'diode': return { query: p.params.type === 'rectifier' ? '1N4007' : '1N4148' };
    case 'npn': return { query: '2N3904' }; case 'nmos': return { query: 'IRLZ44N logic level MOSFET' };
    case 'ne555': return { query: 'NE555P' }; case 'reg7805': return { query: 'L7805CV' };
    case 'speaker': return { query: `${v('R')} ohm speaker ${v('P')}W` };
    case 'switch': return { query: p.params.state === 'open' ? '12mm tactile push button' : 'rocker switch SPST' };
    case 'fuse': return { query: `${v('I')}A slow blow fuse 5x20mm with holder` };
    case 'coincell': return { query: 'CR2032 holder screw cover', note: "Pick a holder with a screw-secured cover (Reese's Law)." };
    case 'battery': return { query: Number(v('V')) > 8 ? '9V battery snap' : '3xAA battery holder with cover switch' };
    case 'usb5v': return { query: 'USB-C receptacle power only' };
    case 'dcsupply': return { query: `${v('V')}V ${v('Imax')}A power adapter UL listed`, note: 'Buy a listed adapter from an authorised seller.', authorised: true };
    case 'acdc': return { query: `IRM-${Math.ceil(Number(v('V')) * Number(v('I')) / 5) * 5}-${v('V')}`, note: 'Certified module only; check the certificate number on the certifier\'s database.', authorised: true };
    case 'pico': return { query: `Raspberry Pi ${String(p.params.variant ?? 'Pico')}`, authorised: true };
    case 'esp32': return { query: 'ESP32-DevKitC-32E', authorised: true }; case 'nano': return { query: 'Arduino Nano A000005', authorised: true };
    case 'rpi': return { query: `Raspberry Pi ${String(p.params.model ?? 'Pi 5').replace('Pi ', '')}`, note: 'Buy from an approved reseller.', authorised: true };
    case 'amp': return { query: 'PAM8302 class D amplifier breakout' }; case 'sensor': return { query: 'BME280 breakout I2C' };
    case 'pickup': return { query: `${p.params.type === 'single' ? 'single coil' : 'humbucker'} guitar pickup` }; case 'jack': return { query: '1/4 inch mono guitar output jack' };
    case 'usbload': return { query: 'USB-A receptacle through hole' }; case 'ledstrip': return { query: `${v('V')}V LED strip` };
    case 'signal': return { query: '3.5mm audio jack panel mount' };
    case 'mains': return { query: 'IEC C14 inlet fused', note: 'Panel-mount, certified inlet.', authorised: true };
    default: return MODULES[p.kind]?.query(p.params) ?? { query: compByKind(p.kind)?.name ?? p.kind };
  }
};

/** Group identical parts into buy lines with search terms. */
export function sourceLines(c: Circuit): SourceLine[] {
  const m = new Map<string, SourceLine>();
  for (const p of c.parts) { if (p.kind === 'ground') continue; const { query, note, authorised } = q1(p); const key = `${p.kind}|${query}`; const l = m.get(key) ?? { refs: [], qty: 0, part: compByKind(p.kind)?.name ?? p.kind, query, note, authorised }; l.refs.push(p.ref); l.qty++; m.set(key, l); }
  return [...m.values()].sort((a, b) => a.refs[0].localeCompare(b.refs[0], undefined, { numeric: true }));
}

/** DigiKey Product Information v4 keyword search body. */
export const digikeyBody = (keywords: string, limit = 5) => ({ Keywords: keywords, Limit: limit, Offset: 0, FilterOptionsRequest: { MinimumQuantityAvailable: 1 } });
export function digikeyOffers(json: any): Offer[] {
  return (json?.Products ?? []).map((p: any) => ({ supplier: 'digikey' as const, mpn: String(p.ManufacturerProductNumber ?? ''), maker: String(p.Manufacturer?.Name ?? ''), description: String(p.Description?.ProductDescription ?? ''),
    stock: Number(p.QuantityAvailable ?? 0), price: p.UnitPrice != null ? Number(p.UnitPrice) : null, currency: 'USD', url: String(p.ProductUrl ?? ''), datasheet: p.DatasheetUrl ? String(p.DatasheetUrl) : undefined,
    rohs: p.Classifications?.RohsStatus ? String(p.Classifications.RohsStatus) : undefined, lifecycle: p.ProductStatus?.Status ? String(p.ProductStatus.Status) : undefined }));
}
/** Mouser Search API v1 keyword body. */
export const mouserBody = (keyword: string, records = 5) => ({ SearchByKeywordRequest: { keyword, records, startingRecord: 0, searchOptions: 'InStock', searchWithYourSignUpLanguage: 'false' } });
export function mouserOffers(json: any): Offer[] {
  return (json?.SearchResults?.Parts ?? []).map((p: any) => {
    const br = (p.PriceBreaks ?? [])[0]; const price = br ? parseFloat(String(br.Price).replace(/[^\d.]/g, '')) : NaN;
    return { supplier: 'mouser' as const, mpn: String(p.ManufacturerPartNumber ?? ''), maker: String(p.Manufacturer ?? ''), description: String(p.Description ?? ''), stock: parseInt(String(p.AvailabilityInStock ?? p.Availability ?? '0').replace(/\D/g, '') || '0', 10),
      price: Number.isFinite(price) ? price : null, currency: String(br?.Currency ?? 'USD'), url: String(p.ProductDetailUrl ?? ''), datasheet: p.DataSheetUrl ? String(p.DataSheetUrl) : undefined, rohs: p.ROHSStatus ? String(p.ROHSStatus) : undefined, lifecycle: p.LifecycleStatus ? String(p.LifecycleStatus) : undefined };
  });
}
/** Flag offers that matter for safety: obsolete parts and non-RoHS for EU sale. */
export function offerWarnings(o: Offer): string[] {
  const w: string[] = [];
  if (o.lifecycle && /obsolete|end of life|eol|not recommended|nrnd|discontinued/i.test(o.lifecycle)) w.push(`${o.lifecycle}: pick a current part.`);
  if (o.rohs && /non|not compliant/i.test(o.rohs)) w.push('Not RoHS compliant: cannot be sold in the EU.');
  return w;
}
