/**
 * csamCaseCore — PURE pieces of the CSAM case flow (no I/O), unit tested in tests/safetyPolicy.test.ts.
 *
 *   - preservation date (REPORT Act, 18 USC 2258A(h): providers preserve report contents for 1 year)
 *   - deterministic case ids
 *   - the NCMEC CyberTipline report XML draft
 *   - the public-safe metadata view admins are allowed to see (never the media)
 *
 * The XML follows the CyberTipline Reporting API (ESP "ispws" web service). The schema is published to
 * registered ESPs at https://report.cybertip.org/ispws/xsd — VALIDATE against it in the exttest
 * environment before enabling live submission; NCMEC revises fields over time.
 */

export const PRESERVE_DAYS = 365;
const DAY_MS = 86_400_000;

export function preserveUntilMs(nowMs: number): number {
  return nowMs + PRESERVE_DAYS * DAY_MS;
}

/** Stable id per (storage object | url) so a re-scan never opens a second case for the same file. */
export function csamCaseId(key: string, hash32: (s: string) => string): string {
  return `case_${hash32(key).slice(0, 24)}`;
}

export type CsamCaseStatus =
  | 'pending_report'      // detected, quarantined, report not yet sent
  | 'report_drafted'      // XML built, waiting for a human to submit manually (default)
  | 'reported'            // CyberTip accepted (reportId recorded)
  | 'report_failed'       // automated submission failed — a human must submit
  | 'false_positive';     // reviewer (trained, metadata-only) closed it — still preserved

export interface CsamCase {
  id: string;
  status: CsamCaseStatus;
  detectedAt: number;
  preserveUntil: number;
  detection: { source: string; reason: string };
  uploaderUid: string | null;
  uploaderIp: string | null;
  surface: string;
  target: { collection: string; id: string } | null;
  original: { storagePath: string | null; url: string | null; contentType: string | null; size: number | null };
  quarantine: { storagePath: string | null; state: 'moved' | 'locked_in_place' | 'mux_playback_removed' | 'failed' | 'external_not_controlled'; note: string };
  hashes: { md5: string | null; sha256: string | null; photodnaTrackingId: string | null };
  ncmec: { env: 'test' | 'prod' | 'manual'; reportId: string | null; submittedAt: number | null; lastError: string | null };
}

/** What a platform-admin UI may see. No URL, no storage path, no hashes that could locate the file. */
export function caseMetadataView(c: CsamCase): Record<string, unknown> {
  return {
    id: c.id,
    status: c.status,
    detectedAt: c.detectedAt,
    preserveUntil: c.preserveUntil,
    detectionSource: c.detection.source,
    surface: c.surface,
    uploaderUid: c.uploaderUid,
    target: c.target,
    quarantineState: c.quarantine.state,
    ncmecEnv: c.ncmec.env,
    ncmecReportId: c.ncmec.reportId,
    ncmecLastError: c.ncmec.lastError,
  };
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const tag = (name: string, value: string | null | undefined) =>
  value == null || value === '' ? '' : `<${name}>${xmlEscape(value)}</${name}>`;

export interface NcmecReporterInfo {
  firstName?: string;
  lastName?: string;
  email: string;
  companyTemplate?: string;
}

/** Build the `/submit` body. Incident type string is the one NCMEC uses for apparent CSAM. */
export function buildCyberTipXml(c: CsamCase, reporter: NcmecReporterInfo, opts: { publicUrl?: string | null; espService?: string } = {}): string {
  const when = new Date(c.detectedAt).toISOString();
  const ip = c.uploaderIp
    ? `<ipCaptureEvent>${tag('ipAddress', c.uploaderIp)}${tag('eventName', 'Upload')}${tag('dateTime', when)}</ipCaptureEvent>`
    : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://report.cybertip.org/ispws/xsd">',
    '<incidentSummary>',
    tag('incidentType', 'Child Pornography (possession, manufacture, and distribution)'),
    tag('incidentDateTime', when),
    '</incidentSummary>',
    opts.publicUrl ? `<internetDetails><webPageIncident>${tag('url', opts.publicUrl)}</webPageIncident></internetDetails>` : '',
    '<reporter><reportingPerson>',
    tag('firstName', reporter.firstName), tag('lastName', reporter.lastName), tag('email', reporter.email),
    '</reportingPerson>',
    tag('companyTemplate', reporter.companyTemplate),
    '</reporter>',
    '<personOrUserReported>',
    tag('espIdentifier', c.uploaderUid),
    tag('espService', opts.espService ?? 'Plajah'),
    ip,
    '</personOrUserReported>',
    '</report>',
  ].join('');
}

/** `/fileinfo` body for one uploaded file. The ESP did NOT view the file (automated detection). */
export function buildFileInfoXml(reportId: string, fileId: string, c: CsamCase, fileName: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<fileDetails xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://report.cybertip.org/ispws/xsd">',
    tag('reportId', reportId),
    tag('fileId', fileId),
    tag('originalFileName', fileName),
    '<fileViewedByEsp>false</fileViewedByEsp>',
    '<publiclyAvailable>false</publiclyAvailable>',
    c.hashes.md5 ? `<originalFileHash hashType="MD5">${xmlEscape(c.hashes.md5)}</originalFileHash>` : '',
    tag('additionalInfo', `Detected by ${c.detection.source}. ${c.detection.reason}`.slice(0, 900)),
    '</fileDetails>',
  ].join('');
}

/** Pull `<reportId>` / `<fileId>` / `<responseCode>` out of a CyberTipline XML response. */
export function parseCyberTipResponse(xml: string): { responseCode: number | null; reportId: string | null; fileId: string | null; description: string | null } {
  const grab = (n: string) => { const m = new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml); return m ? m[1].trim() : null; };
  const code = grab('responseCode');
  return { responseCode: code == null ? null : Number(code), reportId: grab('reportId'), fileId: grab('fileId'), description: grab('responseDescription') };
}
