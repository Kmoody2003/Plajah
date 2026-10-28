// Session Band portraits — one photographic portrait per player on Gemini Omni, written from each
// player's bio (roster.ts). Same shoot for all thirteen (studio, warm key light, their colour as a
// rim light) so the faculty reads as one band. Fictional people: never ask for a likeness of anyone real.
//
//   node scripts/band/generateBandPortraits.mjs            # all missing
//   node scripts/band/generateBandPortraits.mjs marcus rosa --force
//
// Key: GOOGLE_AI_API_KEY / GEMINI_API_KEY (.env.local). Writes public/band/<id>.webp (+ _full.png kept
// in scratch/band-portraits for re-crops). Model override: BAND_PORTRAIT_MODEL.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MODEL = process.env.BAND_PORTRAIT_MODEL || 'gemini-omni-1.1-flash';
const OUT = path.resolve('public/band');
const RAW = path.resolve('scratch/band-portraits');

function key() {
  if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/^(?:GOOGLE_AI_API_KEY|GEMINI_API_KEY|VITE_GOOGLE_AI_API_KEY)=(.*)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('No Gemini key (GOOGLE_AI_API_KEY / GEMINI_API_KEY)');
}

/** How each player looks — written from their bio, colour and instrument in roster.ts. */
const LOOKS = {
  marcus: { color: 'warm orange', look: 'a Black American man in his early fifties from Memphis, shaved head, neatly trimmed salt-and-pepper beard, broad shoulders, kind crinkled eyes and an easy grin; charcoal henley with sleeves pushed up', with: 'sitting behind a vintage drum kit, a pair of hickory drumsticks resting in one hand, a ride cymbal catching the light' },
  amara: { color: 'burnt terracotta', look: 'a Nigerian woman in her late thirties, dark skin, long braids gathered up under a patterned indigo-and-gold headwrap, small gold hoop earrings, a calm focused gaze; loose cream linen shirt', with: 'her hands resting on the heads of two tall wooden congas, a talking drum hanging from her shoulder' },
  dwayne: { color: 'red-orange', look: 'a Black American man in his mid-forties from Detroit, close-cropped hair with a little grey at the temples, thin mustache, relaxed knowing half-smile; tweed flat cap, dark button-up shirt', with: 'holding a worn sunburst four-string electric bass, an upright double bass leaning in the background' },
  rosa: { color: 'turquoise', look: 'a Mexican-American woman in her early thirties from San Antonio, long dark wavy hair over one shoulder, warm brown skin, silver and turquoise rings, confident amused expression; faded denim jacket over a black tee', with: 'holding a well-played butterscotch electric guitar with a worn finish, a nylon-string guitar on a stand behind her' },
  theo: { color: 'deep gold', look: 'a Creole man from New Orleans in his late thirties, light brown skin, short curly black hair, round tortoiseshell glasses, clean-shaven, thoughtful expression; open-collar white shirt under a dark navy blazer', with: 'seated at a black grand piano, one hand resting on the keys, sheet music on the stand' },
  hez: { color: 'royal purple', look: 'a Black American man in his sixties from Birmingham, Alabama, silver hair cut short, full grey beard, gentle wise smile; burgundy vest over a crisp white shirt, a small cross lapel pin', with: 'seated at a wooden Hammond-style tonewheel organ with drawbars, a rotating-speaker cabinet beside him' },
  nova: { color: 'electric cyan', look: 'a Korean woman in her late twenties living in Berlin, sleek black bob with a blunt fringe, small silver ear cuffs, cool focused expression; oversized black technical jacket', with: 'standing at a modular synthesizer rack with patch cables, a vintage polyphonic synth keyboard in front of her' },
  ingrid: { color: 'icy blue', look: 'a Norwegian woman in her forties from Bergen, fair skin with light freckles, long straight ash-blonde hair, serene expression, pale grey eyes; dark green knit sweater', with: 'seated holding a rich amber-varnished cello between her knees, bow resting on the strings' },
  priya: { color: 'magenta rose', look: 'a South Indian woman in her early thirties from Chennai now in Nashville, warm brown skin, long dark hair in a loose braid, small nose stud, bright lively smile; rust-coloured kurta-style top with a denim jacket', with: 'holding a violin under her arm with the bow in her other hand' },
  corny: { color: 'brass yellow', look: 'a Black American man in his late twenties from New Orleans, short twists, wide joyful grin, a little moustache; sharp mustard-yellow suit jacket over a black shirt, porkpie hat', with: 'holding a polished brass trumpet up near his chest, a cup mute in his jacket pocket' },
  lena: { color: 'smoky amber', look: 'an Italian-American woman in her mid-forties from Chicago, olive skin, shoulder-length dark curly hair streaked with silver, red lipstick, wry knowing look; black turtleneck and a vintage leather jacket', with: 'holding a gold tenor saxophone on its neck strap' },
  felix: { color: 'forest green', look: 'an Irish man in his late thirties from Dublin, pale skin, ginger hair and a short ginger beard, lively blue eyes, a friendly crooked smile; grey wool waistcoat over a rolled-sleeve shirt', with: 'holding a silver flute, a clarinet and a tin whistle on the table beside him' },
  elena: { color: 'crimson', look: 'a Mexican woman in her early fifties from Mexico City, tan skin, dark hair with a dramatic silver streak swept into a low chignon, strong composed expression, small pearl earrings; tailored black conductor jacket', with: 'holding a conductor\'s baton, a blurred orchestra of music stands and string players behind her' },
};

const SHOOT = (l) => [
  `Photorealistic editorial portrait photograph of ${l.look}, ${l.with}.`,
  'A real session musician in a recording studio: candid but posed, chest-up, looking toward the camera, natural skin texture, real fabric and wood and metal detail.',
  `Lighting: soft warm key light from the left, dark moody studio background with acoustic panels softly out of focus, a subtle ${l.color} rim light outlining the shoulders.`,
  'Shot on a full-frame camera, 85mm lens, shallow depth of field, square 1:1 framing with the face in the upper third.',
  'Correct anatomy and hands, the instrument accurate and correctly held. No text, no logos, no watermark. A fictional person, not a likeness of any real individual.',
].join(' ');

async function generate(id, look) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: SHOOT(look) }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: '1:1' } },
  };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if ([429, 500, 503].includes(res.status)) { await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
    const j = await res.json();
    if (!res.ok) throw new Error(`${id}: ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) throw new Error(`${id}: no image (${JSON.stringify(j).slice(0, 300)})`);
    return Buffer.from(part.inlineData.data, 'base64');
  }
  throw new Error(`${id}: still busy after retries`);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const ids = args.filter((a) => !a.startsWith('--'));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
for (const [id, look] of Object.entries(LOOKS)) {
  if (ids.length && !ids.includes(id)) continue;
  const dest = path.join(OUT, `${id}.webp`);
  if (fs.existsSync(dest) && !force) { console.log(`${id}: exists`); continue; }
  const t = Date.now();
  const img = await generate(id, look);
  fs.writeFileSync(path.join(RAW, `${id}_full.png`), img);
  await sharp(img).resize(768, 768, { fit: 'cover', position: 'attention' }).webp({ quality: 84 }).toFile(dest);
  console.log(`${id}: ${((Date.now() - t) / 1000).toFixed(1)}s → ${path.relative(process.cwd(), dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
}
