/**
 * Parcel Survey panel — sides, bearings, angles, the legal description run as
 * a traverse, and the cross-checks against the city map and the adjoiners.
 * Engine: services/terra/survey/parcelSurvey.ts.
 */

import React, { useMemo, useState } from 'react';
import { X, Ruler, FileText, ListChecks, Download, CheckCircle2, AlertTriangle, XCircle, Info, Building2 } from 'lucide-react';
import type { TerraParcel } from '../../services/terra/terraTypes';
import type { ParcelSurvey } from '../../services/terra/survey/parcelSurvey';
import { formatBearing, formatDms, bearingToAzimuth, type Pt } from '../../services/terra/survey/cogo';
import type { SurveyCall } from '../../services/terra/survey/legalDescription';
import type { SiteContext } from '../../services/terra/survey/siteContext';
import { INFRA_BY_ID, type InfraKind } from '../../services/terra/infraLayers';

const ACCENT = '#FF8C00';
const MEASURE = '#4FC3D6';
const RECORD = '#C9A6FF';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';
const th = 'px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-white/35 whitespace-nowrap';
const td = 'px-2 py-1.5 text-[11px] text-white/80 tabular-nums whitespace-nowrap';

const ft = (n: number, d = 2) => `${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}′`;
const sqft = (n: number) => `${Math.round(n).toLocaleString('en-US')} sq ft`;

const STATUS = {
  ok:   { icon: <CheckCircle2 size={12} />, color: '#3DD68C' },
  warn: { icon: <AlertTriangle size={12} />, color: '#E8B33D' },
  bad:  { icon: <XCircle size={12} />, color: '#FF5470' },
  info: { icon: <Info size={12} />, color: MEASURE },
};

// ─── DXF export (R12, feet) ──────────────────────────────────────────────────

function dxfPolyline(pts: Pt[], layer: string): string {
  let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n1\n`;
  for (const p of pts) s += `0\nVERTEX\n8\n${layer}\n10\n${p.x.toFixed(4)}\n20\n${p.y.toFixed(4)}\n30\n0\n`;
  return s + '0\nSEQEND\n';
}
function dxfText(p: Pt, h: number, text: string, layer: string, rotDeg = 0): string {
  return `0\nTEXT\n8\n${layer}\n10\n${p.x.toFixed(4)}\n20\n${p.y.toFixed(4)}\n30\n0\n40\n${h}\n1\n${text.replace(/\n/g, ' ')}\n50\n${rotDeg.toFixed(3)}\n72\n1\n11\n${p.x.toFixed(4)}\n21\n${p.y.toFixed(4)}\n31\n0\n`;
}

export function buildSurveyDxf(parcel: TerraParcel, s: ParcelSurvey): string {
  let ents = '';
  const m = s.mapped;
  if (m) {
    ents += dxfPolyline(m.vertices, 'PARCEL_MAPPED');
    for (const sd of m.sides) {
      const mid = { x: (sd.from.x + sd.to.x) / 2, y: (sd.from.y + sd.to.y) / 2 };
      // Text reads along the side; DXF rotation is CCW from +X.
      let rot = 90 - sd.azimuth;
      if (rot < -90) rot += 180; if (rot > 90) rot -= 180;
      ents += dxfText(mid, 1.5, `${formatBearing(sd.azimuth)}  ${sd.length.toFixed(2)}'`, 'DIMENSIONS', rot);
    }
  }
  if (s.fit) ents += dxfPolyline(s.fit.placed, 'PARCEL_RECORD');
  const [lng, lat] = s.toLngLat({ x: 0, y: 0 });
  ents += dxfText({ x: 0, y: -10 }, 2, `${parcel.address ?? ''} PIN ${parcel.parcelNumber} - origin ${lat.toFixed(7)}, ${lng.toFixed(7)} (WGS84), grid north, intl feet`, 'NOTES');
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n2\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ents}0\nENDSEC\n0\nEOF\n`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function callText(c: SurveyCall): string {
  if (c.kind === 'line') return '';
  const bits: string[] = [];
  if (c.radius) bits.push(`R ${c.radius}`);
  if (c.arc) bits.push(`L ${c.arc}`);
  if (c.delta) bits.push(`Δ ${formatDms(c.delta)}`);
  return bits.join(' · ');
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export const ParcelSurveyPanel: React.FC<{
  parcel: TerraParcel;
  survey: ParcelSurvey;
  /** Public infrastructure around the lot — null while loading. */
  site?: SiteContext | null;
  onClose: () => void;
  onSelectParcel?: (id: string) => void;
}> = ({ parcel, survey, site, onClose, onSelectParcel }) => {
  const rec = survey.record;
  const [tab, setTab] = useState<'dims' | 'legal' | 'site' | 'checks'>(rec ? 'legal' : 'dims');
  const m = survey.mapped;
  const legal = survey.legal;

  const csv = useMemo(() => {
    const rows = [['source', 'side', 'bearing', 'length_ft', 'interior_angle', 'adjoins', 'across_ft']];
    m?.sides.forEach(s => rows.push(['map', String(s.index + 1), formatBearing(s.azimuth), s.length.toFixed(2), formatDms(s.interiorAngle),
      s.adjoiners.map(a => a.address ?? a.parcelId).join('; '), s.across ? s.across.distanceFt.toFixed(1) : '']));
    rec?.courses.forEach((c, i) => rows.push(['record', String(i + 1), formatBearing(c.azimuth), c.length.toFixed(2), formatDms(c.interiorAngle ?? 0), '', '']));
    return rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  }, [m, rec]);

  const tabs = [
    { id: 'dims' as const, label: 'Dimensions', icon: <Ruler size={11} /> },
    { id: 'legal' as const, label: 'Legal description', icon: <FileText size={11} /> },
    { id: 'site' as const, label: 'Site', icon: <Building2 size={11} /> },
    { id: 'checks' as const, label: `Checks · ${survey.checks.filter(c => c.status === 'warn' || c.status === 'bad').length}`, icon: <ListChecks size={11} /> },
  ];

  return (
    <div className="absolute top-3 right-3 bottom-8 z-[600] w-[min(600px,calc(100%-24px))] flex flex-col rounded-2xl bg-[#0b0c10]/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="min-w-0 flex-1">
          <p className={label}>Parcel survey</p>
          <p className="text-sm font-black text-white leading-tight truncate">{parcel.address || 'Unaddressed parcel'}</p>
          <p className="text-[10px] text-white/40 font-mono">PIN {parcel.parcelNumber}</p>
        </div>
        <button onClick={() => download(`parcel-${parcel.parcelNumber}.dxf`, buildSurveyDxf(parcel, survey), 'application/dxf')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest"
          title="CAD drawing: mapped boundary, record boundary, bearings & distances (feet)">
          <Download size={11} /> DXF
        </button>
        <button onClick={() => download(`parcel-${parcel.parcelNumber}.csv`, csv, 'text/csv')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest">
          <Download size={11} /> CSV
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5" aria-label="Close survey">
          <X size={14} />
        </button>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-4 gap-px bg-white/[0.06] border-b border-white/[0.06]">
        {[
          ['Map area', m ? sqft(m.areaSqFt) : '—'],
          ['Acres', m ? (m.areaSqFt / 43560).toFixed(3) : '—'],
          ['Perimeter', m ? ft(m.perimeter, 1) : '—'],
          ['Record closes', rec ? (rec.misclosure < 0.005 ? 'exact' : `1:${Math.round(rec.precision).toLocaleString()}`) : 'n/a'],
        ].map(([k, v]) => (
          <div key={k} className="bg-[#0b0c10] px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{k}</p>
            <p className="text-[12px] font-bold text-white tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 px-3 pt-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${tab === t.id ? 'text-black' : 'text-white/45 hover:text-white/80'}`}
            style={tab === t.id ? { background: ACCENT } : {}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {tab === 'dims' && (
          m ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full">
                  <thead className="bg-white/[0.03]"><tr>
                    <th className={th}>Side</th><th className={th}>Bearing</th><th className={th}>Length</th><th className={th}>Angle at start</th><th className={th}>Beyond this side</th>
                  </tr></thead>
                  <tbody>
                    {m.sides.map(s => (
                      <tr key={s.index} className="border-t border-white/[0.05] align-top">
                        <td className={td}><span className="font-black" style={{ color: ACCENT }}>{s.index + 1}</span></td>
                        <td className={`${td} font-mono`}>{formatBearing(s.azimuth)}</td>
                        <td className={td}>{ft(s.length)}</td>
                        <td className={`${td} font-mono`}>{formatDms(s.interiorAngle)}</td>
                        <td className={`${td} whitespace-normal`}>
                          {s.adjoiners.map(a => (
                            <button key={a.parcelId} onClick={() => onSelectParcel?.(a.parcelId)}
                              className="block text-left hover:underline"
                              style={{ color: a.kind === 'flush' ? '#3DD68C' : '#E8B33D' }}>
                              {a.address || a.parcelId} · {ft(a.sharedFt, 1)}
                              {a.kind !== 'flush' && <span className="text-white/50"> · {a.kind} {ft(a.offsetFt)}</span>}
                            </button>
                          ))}
                          {s.openFt > 1 && (
                            <span className="block text-white/45">
                              {ft(s.openFt, 1)} open{s.across ? ` · ${ft(s.across.distanceFt, 1)} across to ${s.across.address || 'parcel'}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-white/35 leading-relaxed">
                Sides run clockwise from the first corner. Bearings are referenced to grid north on the city's GIS layer, distances in feet,
                angles are interior. Angle sum error {m.angleSumError.toFixed(4)}° (Σ = (n−2)·180°).
                {m.isRectangular ? ' Lot is rectangular within 1° at every corner.' : ''} “Across” is the mapped width of the street or alley
                to the next parcel line, not a surveyed right-of-way.
              </p>
            </>
          ) : <p className="text-[11px] text-white/40">This parcel has no polygon on the city map.</p>
        )}

        {tab === 'legal' && (
          <>
            <div className="rounded-xl border border-white/[0.06] p-3 bg-white/[0.02]">
              <p className={`${label} mb-1.5`}>As recorded on the assessor roll</p>
              <p className="text-[11px] text-white/70 leading-relaxed font-mono whitespace-pre-wrap break-words">{legal.raw.trim() || 'No legal description on file.'}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {legal.plat?.subdivision && <Chip>{legal.plat.subdivision}</Chip>}
                {legal.plat?.lots && <Chip>Lot {legal.plat.lots}</Chip>}
                {legal.plat?.liber && <Chip>Plat Liber {legal.plat.liber} Page {legal.plat.page}</Chip>}
                {legal.plss && <Chip>{[legal.plss.quarter, `Sec ${legal.plss.section}`, `T${legal.plss.township}`, `R${legal.plss.range}`].filter(Boolean).join(' ')}</Chip>}
                {legal.lotDims && <Chip>{legal.lotDims.frontage}{legal.lotDims.depth ? ` × ${legal.lotDims.depth}` : ''} ft{legal.lotDims.irregular ? ' irreg.' : ''}</Chip>}
                {legal.recordAreaSqFt && <Chip>{sqft(legal.recordAreaSqFt)} written</Chip>}
              </div>
            </div>

            {rec ? (
              <>
                {legal.ties.length > 0 && (
                  <p className="text-[10px] text-white/40">
                    {legal.ties.length} tie call{legal.ties.length > 1 ? 's' : ''} to the point of beginning (not part of the boundary):{' '}
                    <span className="font-mono text-white/55">{legal.ties.map(t => t.kind === 'line' ? `${formatBearing(bearingToAzimuth(t.bearing))} ${t.distance}′` : 'curve').join('; ')}</span>
                  </p>
                )}
                <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full">
                    <thead className="bg-white/[0.03]"><tr>
                      <th className={th}>#</th><th className={th}>Bearing</th><th className={th}>Distance</th><th className={th}>Latitude</th><th className={th}>Departure</th><th className={th}>Int. angle</th><th className={th}>Deflection</th>
                    </tr></thead>
                    <tbody>
                      {rec.courses.map((c, i) => (
                        <React.Fragment key={i}>
                          <tr className="border-t border-white/[0.05]">
                            <td className={td}><span className="font-black" style={{ color: RECORD }}>{i + 1}</span></td>
                            <td className={`${td} font-mono`}>{c.curve ? <span title="chord bearing">⌒ {formatBearing(c.azimuth)}</span> : formatBearing(c.azimuth)}</td>
                            <td className={td}>{ft(c.length)}</td>
                            <td className={td}>{c.lat >= 0 ? 'N' : 'S'} {Math.abs(c.lat).toFixed(2)}</td>
                            <td className={td}>{c.dep >= 0 ? 'E' : 'W'} {Math.abs(c.dep).toFixed(2)}</td>
                            <td className={`${td} font-mono`}>{c.interiorAngle !== undefined ? formatDms(c.interiorAngle) : '—'}</td>
                            <td className={`${td} font-mono`}>{c.deflection !== undefined ? `${formatDms(Math.abs(c.deflection))} ${c.deflection >= 0 ? 'R' : 'L'}` : '—'}</td>
                          </tr>
                          {c.curve && (
                            <tr><td />
                              <td colSpan={6} className="px-2 pb-1.5 text-[10px] text-white/50 font-mono">
                                Curve {c.curve.turn} · R {c.curve.radius.toFixed(2)} · Δ {formatDms(c.curve.delta)} · L {c.curve.arc.toFixed(2)} · Chord {c.curve.chord.toFixed(2)} · T {c.curve.tangent.toFixed(2)} · segment {c.curve.segmentArea.toFixed(1)} sq ft {callText(c.call) && <span className="text-white/30">({callText(c.call)} recorded)</span>}
                              </td>
                            </tr>
                          )}
                          {c.neighbourAgreement && (
                            <tr><td />
                              <td colSpan={6} className="px-2 pb-1.5 text-[10px]" style={{ color: '#3DD68C' }}>
                                ✓ Same line in the deed of {c.neighbourAgreement.address || c.neighbourAgreement.parcelId} (Δbrg {c.neighbourAgreement.dAzSec.toFixed(0)}″, Δdist {c.neighbourAgreement.dLenFt.toFixed(2)}′)
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat k="Σ latitudes (misclosure)" v={`${rec.misclosureLat >= 0 ? 'N' : 'S'} ${Math.abs(rec.misclosureLat).toFixed(3)}′`} />
                  <Stat k="Σ departures (misclosure)" v={`${rec.misclosureDep >= 0 ? 'E' : 'W'} ${Math.abs(rec.misclosureDep).toFixed(3)}′`} />
                  <Stat k="Linear misclosure" v={rec.misclosure < 0.005 ? '0.000′' : `${rec.misclosure.toFixed(3)}′ @ ${formatBearing(rec.misclosureBearing)}`} />
                  <Stat k="Precision" v={rec.misclosure < 0.005 ? 'closes exactly' : `1 : ${Math.round(rec.precision).toLocaleString()}`} tone={rec.closes ? 'ok' : 'bad'} />
                  <Stat k="Area (coordinates, adjusted)" v={sqft(rec.areaSqFt)} />
                  <Stat k="Perimeter (arc lengths)" v={ft(rec.perimeter)} />
                  {survey.fit && <Stat k="Fit to city map" v={`max ${survey.fit.max.toFixed(1)}′ · RMS ${survey.fit.rms.toFixed(1)}′`} tone={survey.fit.verdict === 'agrees' ? 'ok' : survey.fit.verdict === 'roughly' ? 'warn' : 'bad'} />}
                  {survey.fit && <Stat k="Basis of bearings → grid" v={`${survey.fit.rotationDeg >= 0 ? '+' : '−'}${formatDms(Math.abs(survey.fit.rotationDeg))}`} />}
                </div>
                <p className="text-[10px] text-white/35 leading-relaxed">
                  Latitude = L·cos(Az), departure = L·sin(Az); curves are run on their chord (C = 2R·sin Δ/2) and the
                  segment area R²/2·(Δ − sin Δ) is added or removed by which side the arc bulges. Misclosure is distributed by the
                  Compass (Bowditch) rule before area. The record boundary is drawn on the map in violet, rotated to the city grid by
                  a best fit — deeds carry their own basis of bearings.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-white/45 leading-relaxed">
                {legal.courses.length
                  ? 'Calls were found but they do not form a closed boundary that can be run as a traverse.'
                  : 'This description has no metes-and-bounds calls. For a platted lot the bearings and distances are on the recorded plat; the Dimensions tab measures the lot from the city map instead.'}
              </p>
            )}
          </>
        )}

        {tab === 'site' && (
          !site ? (
            <p className="text-[11px] text-white/40">Reading the city's utility, right-of-way and building layers around this lot…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat k="Nearest fire hydrant" v={site.nearestHydrant ? `${site.nearestHydrant.distanceFt < 1 ? 'at lot line' : ft(site.nearestHydrant.distanceFt, 0)} · ${site.nearestHydrant.label}` : 'none on this block'} />
                <Stat k="Lot coverage (footprints)" v={site.lotCoveragePct !== undefined ? `${site.lotCoveragePct.toFixed(1)}%` : 'no building mapped'} />
                {(['MANHOLE', 'CATCH_BASIN', 'STREETLIGHT', 'GSI'] as InfraKind[]).map(k => (
                  <Stat key={k} k={`${INFRA_BY_ID[k].label} within ${site.radiusFt}′`} v={String(site.near[k] ?? 0)} />
                ))}
              </div>

              <div>
                <p className={`${label} mb-1.5`}>Buildings on the lot</p>
                {site.buildings.length === 0 ? (
                  <p className="text-[11px] text-white/40">No building footprint mapped on this parcel.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                    <table className="w-full">
                      <thead className="bg-white/[0.03]"><tr>
                        <th className={th}>Building</th><th className={th}>Footprint</th><th className={th}>Stories / height</th>
                        {survey.mapped?.sides.map(sd => <th key={sd.index} className={th} title={formatBearing(sd.azimuth)}>Setback {sd.index + 1}</th>)}
                      </tr></thead>
                      <tbody>
                        {site.buildings.map(b => (
                          <tr key={b.id} className="border-t border-white/[0.05]">
                            <td className={td}>{b.name ?? 'Building'}{b.yearBuilt ? <span className="text-white/40"> · {b.yearBuilt}</span> : null}</td>
                            <td className={td}>{sqft(b.footprintSqFt)}</td>
                            <td className={td}>{b.stories ?? '—'}{b.heightFt ? ` · ~${b.heightFt}′` : ''}</td>
                            {b.setbacks.map((d, i) => <td key={i} className={td}>{d < 0.5 ? <span style={{ color: '#E8B33D' }}>on line</span> : ft(d, 1)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[10px] text-white/35 leading-relaxed mt-1.5">
                  Setback = closest point of the footprint to each numbered side (Dimensions tab). Footprints are roof outlines from imagery,
                  so eaves and overhangs read as building — confirm against the zoning setbacks before design.
                </p>
              </div>

              <div>
                <p className={`${label} mb-1.5`}>Street & alley records touching this lot</p>
                {site.rowRecords.length === 0 ? (
                  <p className="text-[11px] text-white/40">No recorded vacation or opening within 10 ft.</p>
                ) : site.rowRecords.map((r, i) => {
                  const sum = INFRA_BY_ID[r.kind].summarize(r.props);
                  return (
                    <div key={i} className="rounded-xl border border-white/[0.06] p-2.5 bg-white/[0.02] mb-1.5">
                      <p className="text-[11px] font-bold" style={{ color: INFRA_BY_ID[r.kind].color }}>{sum.title}</p>
                      {sum.lines.map((l, j) => <p key={j} className="text-[11px] text-white/55">{l}</p>)}
                      <p className="text-[10px] text-white/35">{r.distanceFt < 0.5 ? 'Adjoins / overlaps the lot' : `${ft(r.distanceFt, 1)} from the lot`}</p>
                      {sum.link && /^https:\/\//.test(sum.link) && (
                        <a href={sum.link} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold" style={{ color: MEASURE }}>Council record (PDF)</a>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-white/30 leading-relaxed">
                Water mains, sewer mains, service lines, gas and electric are not public records. Manholes, catch basins and hydrants
                show where the networks surface. Manholes and catch basins are machine-detected from street imagery, so treat them as
                approximate. Before any excavation, Michigan law requires a MISS DIG 811 ticket. For pipe sizes and depths, request
                record drawings from DWSD and DTE.
              </p>
            </>
          )
        )}

        {tab === 'checks' && (
          <div className="space-y-2">
            {survey.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] p-2.5 bg-white/[0.02]">
                <span className="mt-0.5 shrink-0" style={{ color: STATUS[c.status].color }}>{STATUS[c.status].icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white/85">{c.label}</p>
                  <p className="text-[11px] text-white/55 leading-relaxed">{c.detail}</p>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-white/30 leading-relaxed pt-1">
              Computed from public records: the assessor's legal description and the City of Detroit parcel layer, which is compiled
              from plats and typically good to a few feet. This is not a boundary survey — only a licensed professional surveyor's
              field work establishes corners.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 text-white/55 bg-white/[0.03]">{children}</span>
);

const Stat: React.FC<{ k: string; v: string; tone?: 'ok' | 'warn' | 'bad' }> = ({ k, v, tone }) => (
  <div className="rounded-xl border border-white/[0.06] px-3 py-2 bg-white/[0.02]">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{k}</p>
    <p className="text-[11px] font-bold tabular-nums font-mono" style={{ color: tone ? STATUS[tone].color : 'rgba(255,255,255,0.85)' }}>{v}</p>
  </div>
);

export default ParcelSurveyPanel;
