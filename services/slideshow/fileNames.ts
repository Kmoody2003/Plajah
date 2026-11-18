// Is a file name a description someone wrote ("Grandma at the lake 1987.jpg"), or just what
// a camera, phone, app or download called it ("IMG_4021.JPG", "PXL_20230704_183512345.jpg",
// "WhatsApp Image 2023-05-01 at 10.12.33.jpeg", "f3a9c1e2-7b4d….jpg")?
//
// describeFileName() returns a clean, readable description for the first kind and null for
// the second. It is deliberately strict: a wrong caption on a memorial photo is worse than none.

/** Whole names cameras, phones, apps and scanners produce. Matched against the bare name. */
const MACHINE_PATTERNS: RegExp[] = [
  /^(img|image|dsc|dscn|dscf|dsc_|_mg|mvimg|pxl|cimg|sam|gopr|gp|dji|p\d{3}|imgp|pict|pic|photo|picture|scan|scanned|snapchat|signal|telegram|wp|fb|insta|vid|mov|hdr|burst|portrait|panorama|pano|screenshot|screen ?shot|screen ?recording|untitled|download|unnamed|file|export|edited|copy)[\s_\-.]*(\(?\d+\)?|[a-f0-9]{6,})?$/i,
  /^(img|dsc|dscn|dscf|pxl|mvimg|cimg|sam|gopr|dji|imgp|pict|_mg|img_e)[\s_\-]*[a-z]?\d+([\s_\-]+(copy|edited|edit|final|\(\d+\)|\d+))*$/i, // IMG_1234 copy, DSC01234-2 (but not "DSC_0045 grandma garden")
  /^(img|vid|pxl|mvimg|signal|photo|image)[\s_\-]*\d{8}/i,                            // IMG_20230704_…
  /^whats ?app (image|video)/i,
  /^(screenshot|screen shot|captura|bildschirmfoto|capture d'écran)/i,
  /^(photo|image|pic|picture)[\s_\-]*\(?\d+\)?$/i,                                     // photo (3), image-12
  /^\d{8}[\s_\-]?\d{6}/,                                                                // 20230704_183512
  /^\d{4}[\-_.]\d{2}[\-_.]\d{2}([\s_\-T.]\d{2}[\-_.:]?\d{2}([\-_.:]?\d{2})?)?$/,       // 2023-07-04 18.35.12
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,                  // UUID
  /^[a-z0-9]{20,}$/i,                                                                   // long hash / id
  /^[\d\s_\-.()]+$/,                                                                    // digits only
];

/** Words that carry no description on their own. */
const NOISE = new Set([
  'img', 'image', 'images', 'dsc', 'dscn', 'dscf', 'pxl', 'mvimg', 'photo', 'photos', 'pic', 'pics', 'picture', 'pictures',
  'copy', 'edit', 'edited', 'final', 'scan', 'scanned', 'untitled', 'download', 'downloaded', 'file', 'new', 'export', 'exported',
  'resized', 'large', 'small', 'medium', 'thumb', 'thumbnail', 'hdr', 'burst', 'cover', 'whatsapp', 'snapchat', 'signal', 'telegram',
  'screenshot', 'screen', 'shot', 'jpg', 'jpeg', 'png', 'heic', 'raw', 'version', 'v', 'ver', 'original', 'orig', 'web', 'hq', 'lq',
  'fb', 'ig', 'insta', 'instagram', 'facebook', 'wp', 'gopro', 'dji', 'iphone', 'android', 'samsung', 'pixel', 'camera', 'cam',
  'portrait', 'mode', 'live', 'effect', 'effects', 'filter', 'pano', 'panorama', 'am', 'pm',
]);

/** Small words that may sit inside a description but never make one by themselves. */
const GLUE = new Set(['a', 'an', 'the', 'and', 'with', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'of', 'our', 'my', 'his', 'her', 'their', 'me', 'us', 'we', 'is', 'was', '&']);

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A token that looks like a real word: letters, a vowel (or y), no long consonant runs. */
function wordLike(t: string) {
  const w = t.toLowerCase();
  if (!/^[a-zà-ÿ']+$/i.test(w)) return false;
  if (w.length === 1) return w === 'a' || w === 'i';
  if (!/[aeiouyà-ÿ]/.test(w)) return false;
  if (/[^aeiouyà-ÿ']{5,}/.test(w)) return false;                 // "xkcdq"
  const vowels = (w.match(/[aeiouyà-ÿ]/g) || []).length;
  return vowels / w.length >= 0.2 && w.length <= 18;
}

function tidy(base: string) {
  return base
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')                            // camelCase → words
    .replace(/[_+]+/g, ' ')
    .replace(/-/g, ' ')                                             // kebab-case → words
    .replace(/\s*\(\d+\)\s*$/, '')                                  // "name (2)"
    .replace(/\s+(copy|final|edited|edit|v\d+|\d{1,2})$/i, '')      // trailing version noise
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A readable description from a descriptive file name, or null for camera/app/random names.
 * "grandma_at_the_lake_1987.jpg" → "Grandma at the lake, 1987"
 * "Dad'sRetirementParty.jpeg"    → "Dad's retirement party"
 * "IMG_4021.JPG", "PXL_20230704_183512345.jpg", "a8f3kz91.png" → null
 */
export function describeFileName(name: string | undefined | null): string | null {
  if (!name) return null;
  const raw = name.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  if (!raw) return null;
  if (MACHINE_PATTERNS.some((re) => re.test(raw))) return null;
  const text = tidy(raw);
  const tokens = text.split(/[\s,.;:]+/).filter(Boolean);
  if (!tokens.length) return null;

  const years: string[] = [];
  const words: string[] = [];
  let junk = 0;
  for (const t of tokens) {
    if (/^(19|20)\d{2}$/.test(t)) { years.push(t); continue; }
    if (/^\d+$/.test(t)) { junk++; continue; }                     // counters, dates parts
    if (/\d/.test(t)) { junk++; continue; }                        // mixed letters + digits (ids)
    const lw = t.toLowerCase();
    if (NOISE.has(lw)) { junk++; continue; }
    if (/^[A-Z]{2,4}$/.test(t) && tokens.length > 1) { words.push(t); continue; }   // BBQ, USA, NYC
    if (!wordLike(t)) { junk++; continue; }
    words.push(t);
  }
  const content = words.filter((w) => !GLUE.has(w.toLowerCase()) && !MONTHS.includes(w.toLowerCase()));
  // A description needs real words: at least two that aren't glue, or one long proper word
  // alongside a year ("Christmas 1985"), and more words than noise.
  const enough = content.length >= 2 || (content.length === 1 && content[0].length >= 4 && (years.length > 0 || words.length >= 2));
  if (!enough || words.length < junk) return null;

  let out = words.join(' ');
  out = out.charAt(0).toUpperCase() + out.slice(1);
  // keep proper-looking capitals, soften ALL CAPS
  if (out === out.toUpperCase()) out = out.charAt(0) + out.slice(1).toLowerCase();
  if (years.length) out += `, ${years.join('–')}`;
  return out.slice(0, 90);
}

/** Text a shot actually shows: only when its description is switched on. */
export function shownCaption(p: { caption?: string; showCaption?: boolean }): string {
  return p.showCaption && p.caption?.trim() ? p.caption.trim() : '';
}
