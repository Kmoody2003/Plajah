/**
 * Art Council & Game Council Multimodal Sheet, Plate & PBR Texture Generator
 *
 * Uses GEMINI_API_KEY (@google/genai `gemini-2.5-flash-image` / `imagen-3.0-generate-002`)
 * and MAGNIFIC_API_KEY (`flux-2-klein` with `input_image` reference grounding)
 * grounded directly on the actual Pumpkin Patch movie stills:
 *   - public/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg (Pumpkin Patch / Melvin Lester)
 *   - public/generated/comics/pumpkin_patch_v4/char_2_portrait.jpg (Agent Katrina Van Tassel)
 *   - public/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg (Wicked Witch Miriam)
 *   - public/generated/comics/pumpkin_patch_v4/char_4_portrait.jpg (Stitch the Scarecrow)
 *   - public/generated/comics/pumpkin_patch_v4/char_5_portrait.jpg (Commander Crane / Robo-Bones)
 *   - public/generated/comics/pumpkin_patch_v4/char_8_portrait.jpg (Director Jack / Ichabod Crane)
 *   - public/generated/comics/pumpkin_patch_v4/panel_165.jpg & panel_195.jpg (Armored Tank)
 *   - public/generated/comics/pumpkin_patch_v4/panel_225.jpg (Pumpkin Patch Action Frame)
 */

import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

function readEnvKey(name) {
  if (process.env[name]) return process.env[name];
  if (!fs.existsSync('.env.local')) return '';
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
}

const GEMINI_API_KEY = readEnvKey('GEMINI_API_KEY');
const MAGNIFIC_API_KEY = readEnvKey('MAGNIFIC_API_KEY');

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const SHEETS_DIR = path.resolve('public/models/halloween/sheets');
const PLATES_DIR = path.resolve('public/models/halloween/plates');
const TEXTURES_DIR = path.resolve('public/models/halloween/textures');
const STILLS_DIR = path.resolve('public/generated/comics/pumpkin_patch_v4');

fs.mkdirSync(SHEETS_DIR, { recursive: true });
fs.mkdirSync(PLATES_DIR, { recursive: true });
fs.mkdirSync(TEXTURES_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateWithGeminiImage(prompt, refImagePaths = [], aspectRatio = '1:1') {
  if (!ai) throw new Error('No GEMINI_API_KEY');

  // 1. Try gemini-2.5-flash-image (supports multimodal image input + image output)
  const geminiModels = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];
  for (const modelName of geminiModels) {
    try {
      const parts = [];
      for (const p of refImagePaths) {
        if (fs.existsSync(p)) {
          const b64 = fs.readFileSync(p).toString('base64');
          parts.push({
            inlineData: {
              data: b64,
              mimeType: p.endsWith('.png') ? 'image/png' : 'image/jpeg',
            },
          });
        }
      }
      parts.push({ text: prompt });

      const resp = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      const candidateParts = resp?.candidates?.[0]?.content?.parts || [];
      for (const part of candidateParts) {
        if (part.inlineData?.data) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
    } catch (err) {
      console.warn(`  [${modelName}] fallback: ${String(err?.message || err).slice(0, 120)}`);
    }
  }

  // 2. Try imagen-3.0-generate-002
  try {
    const resp = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio,
      },
    });
    const b64 = resp?.generatedImages?.[0]?.image?.imageBytes;
    if (b64) return Buffer.from(b64, 'base64');
  } catch (err) {
    console.warn(`  [imagen-3.0] fallback: ${String(err?.message || err).slice(0, 120)}`);
  }

  throw new Error('Gemini image models did not return an image');
}

async function generateWithMagnific(prompt, refImagePaths = [], aspect = '1:1') {
  if (!MAGNIFIC_API_KEY) throw new Error('No MAGNIFIC_API_KEY');
  const ASPECT_MAP = {
    '1:1': 'square_1_1',
    '16:9': 'widescreen_16_9',
    '4:3': 'classic_4_3',
  };
  const body = {
    prompt,
    aspect_ratio: ASPECT_MAP[aspect] || 'square_1_1',
    resolution: '1k',
    output_format: 'png',
  };
  const validRefs = refImagePaths.filter((p) => fs.existsSync(p)).slice(0, 4);
  for (let i = 0; i < validRefs.length; i++) {
    const key = i === 0 ? 'input_image' : `input_image_${i + 1}`;
    body[key] = fs.readFileSync(validRefs[i]).toString('base64');
  }

  const headers = {
    'x-magnific-api-key': MAGNIFIC_API_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const create = await fetch('https://api.magnific.com/v1/ai/text-to-image/flux-2-klein', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const created = await create.json().catch(() => ({}));
  const taskId = created?.data?.task_id;
  if (!create.ok || !taskId) {
    throw new Error(`Magnific create failed ${create.status}: ${JSON.stringify(created).slice(0, 200)}`);
  }
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await sleep(2500);
    const st = await fetch(`https://api.magnific.com/v1/ai/text-to-image/flux-2-klein/${taskId}`, { headers });
    const j = await st.json().catch(() => ({}));
    const status = j?.data?.status;
    if (status === 'COMPLETED' && j.data.generated?.[0]) {
      const imgRes = await fetch(j.data.generated[0]);
      if (!imgRes.ok) throw new Error(`Download failed ${imgRes.status}`);
      return Buffer.from(await imgRes.arrayBuffer());
    }
    if (status === 'FAILED') throw new Error(`Magnific task ${taskId} failed`);
  }
  throw new Error(`Magnific task ${taskId} timed out`);
}

async function generateAsset(item) {
  const outPath = item.outPath;
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 15_000 && !process.argv.includes('--force')) {
    console.log(`✓ Skip existing ${path.relative(process.cwd(), outPath)} (${fs.statSync(outPath).size} bytes)`);
    return true;
  }
  console.log(`▶ Generating ${item.id} -> ${path.relative(process.cwd(), outPath)} ...`);
  try {
    const buf = await generateWithGeminiImage(item.prompt, item.refs || [], item.aspect || '1:1');
    fs.writeFileSync(outPath, buf);
    console.log(`  ★ Saved via Gemini Image Model: ${path.basename(outPath)} (${buf.length} bytes)`);
    return true;
  } catch (e1) {
    try {
      const buf = await generateWithMagnific(item.prompt, item.refs || [], item.aspect || '1:1');
      fs.writeFileSync(outPath, buf);
      console.log(`  ★ Saved via Magnific Flux-2-Klein: ${path.basename(outPath)} (${buf.length} bytes)`);
      return true;
    } catch (e2) {
      console.error(`  ✗ Failed ${item.id}: Gemini=(${e1.message}) Magnific=(${e2.message})`);
      return false;
    }
  }
}

const ASSETS = [
  // 1. MASTER SCENE 1:1 CONCEPT PLATE
  {
    id: 'haunted_crossroads_master_plate',
    outPath: path.join(PLATES_DIR, 'haunted_crossroads_master_plate.jpg'),
    aspect: '16:9',
    refs: [path.join(STILLS_DIR, 'panel_165.jpg'), path.join(STILLS_DIR, 'panel_225.jpg')],
    prompt:
      'AAA dark fantasy Grindhouse 3D game environment master concept plate, 16:9 widescreen. Dead-center is a lonely midnight 4-way cracked wet asphalt road intersection ("The Lonesome Crossroads") with a weathered wooden directional signpost in the center. Flanking the roads are dilapidated weathered wooden roadside movie billboards illuminated from below by warm amber ground floodlights so the posters are readable against the dark night. Straight ahead on a jagged northern rocky crag stands a towering Gothic Haunted Castle fortress with gargoyle spires, glowing crimson stained-glass windows, and an iron portcullis gate. Above the castle hangs a colossal blood-amber Harvest Moon and an emerald-cyan dimensional rift in swirling storm clouds. Photorealistic Unreal Engine 5 chiaroscuro lighting, volumetric ground fog, no text watermarks.',
  },
  // 2. 360 SKY DOME & HORIZON PLATES
  {
    id: 'sky_dome_grindhouse',
    outPath: path.join(PLATES_DIR, 'sky_dome_grindhouse.jpg'),
    aspect: '16:9',
    refs: [],
    prompt:
      'Seamless 360 equirectangular night sky dome environment map for a Gothic Halloween 3D game. Deep midnight indigo storm clouds, a glowing amber Harvest Moon with atmospheric halo, a swirling emerald-green and violet supernatural dimensional rift nebula across the zenith, scattered crisp stars, dark mountain silhouettes along the very bottom horizon edge. Photorealistic 8k HDRI skybox style.',
  },
  {
    id: 'castle_horizon_plate',
    outPath: path.join(PLATES_DIR, 'castle_horizon_plate.jpg'),
    aspect: '16:9',
    refs: [],
    prompt:
      'Panoramic dark Gothic mountain ridge and distant haunted castle silhouettes wrapped in eerie violet and emerald midnight fog, dramatic moonlight rim lighting, matte painting cyclorama background plate for 3D game horizon, 16:9 widescreen, high contrast.',
  },
  // 3. CHARACTER TURNAROUND & TEXTURE SHEETS FROM MOVIE STILLS
  {
    id: 'pumpkin_patch_sheet',
    outPath: path.join(SHEETS_DIR, 'pumpkin_patch_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'char_1_portrait.jpg'), path.join(STILLS_DIR, 'panel_225.jpg')],
    prompt:
      'Professional 3D character turnaround model sheet and PBR texture atlas grounded on the reference image: Pumpkin Patch (Melvin Lester). Full-body front view and back view in symmetrical A-pose on neutral dark studio grid, plus high-detail head close-up. Exact likeness to reference: carved orange Jack-o-Lantern pumpkin head with curved green-brown stem, glowing triangular amber eyes, jagged stitched grin, wearing a long glossy black leather duster trench coat with wide lapels over a dark tactical vest, heavy combat trousers, leather boots, holding dual glowing superheated orange plasma blades. Photorealistic AAA game character asset sheet.',
  },
  {
    id: 'miriam_sheet',
    outPath: path.join(SHEETS_DIR, 'miriam_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'char_3_portrait.jpg')],
    prompt:
      'Professional 3D character turnaround model sheet and PBR texture reference grounded on the reference image: Wicked Witch Miriam. Full-body front view and back view in A-pose plus face close-up. Exact likeness to reference: emerald green skin, black leather eyepatch over her right eye, dramatic smoky eye makeup on left eye, black lipstick, wide-brimmed black leather witch hat, high popped Gothic collar with ornate silver medallion brooch, tailored dark Victorian witch coat and skirt, and a small glowing blue cyber-cat familiar perched on her shoulder. AAA 3D character production sheet.',
  },
  {
    id: 'stitch_sheet',
    outPath: path.join(SHEETS_DIR, 'stitch_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'char_4_portrait.jpg')],
    prompt:
      'Professional 3D character turnaround model sheet and PBR texture reference grounded on the reference image: Stitch the Scarecrow. Full-body front view and back view in A-pose plus head close-up. Exact likeness to reference: coarse brown burlap sack mask with heavy Hemp twine X-stitches sewn across the mouth and nose bridge, dark hollow right eye socket, intense left eye, weathered dark charcoal-brown duster coat with straw sticking out of shoulders and cuffs, rope belt, worn boots. AAA game character turnaround sheet.',
  },
  {
    id: 'robobones_sheet',
    outPath: path.join(SHEETS_DIR, 'robobones_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'char_5_portrait.jpg')],
    prompt:
      'Professional 3D character turnaround model sheet and PBR texture reference grounded on the reference image: Commander Crane (Robo-Bones). Full-body front view and back view in A-pose plus head close-up. Exact likeness to reference: brushed gunmetal silver cybernetic android skull face with glowing white pinpoint optical eyes, mechanical jaw pistons, exposed neck hydraulic cables, wearing a black bowler top hat and a high-collared black leather Victorian tactical trench coat. AAA game character turnaround sheet.',
  },
  {
    id: 'katrina_sheet',
    outPath: path.join(SHEETS_DIR, 'katrina_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'char_2_portrait.jpg')],
    prompt:
      'Professional 3D character turnaround model sheet and PBR texture reference grounded on the reference image: Special Agent Katrina Van Tassel. Full-body front and back A-pose views plus portrait close-up. Exact likeness to reference: blonde wavy hair styled in an updo with loose curls framing her face, silver pendant necklace, tailored dark grey ribbed tactical blazer, fitted dark trousers, combat boots. Photorealistic AAA game character sheet.',
  },
  {
    id: 'survivor_male_sheet',
    outPath: path.join(SHEETS_DIR, 'survivor_male_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'panel_225.jpg')],
    prompt:
      'Professional AAA 3D playable character turnaround model sheet (front and back A-pose + weapon callouts): Grindhouse Male Survivor action hero inspired by Fortnite and Bushido Blade. Athletic rugged male survivor wearing a distressed dark crimson and black leather biker jacket with armored shoulder pads, dark denim jeans, tactical knee pads, heavy boots, fingerless gloves, with a spiked baseball bat and katana-cleaver strapped to back. Photorealistic 3D character production sheet.',
  },
  {
    id: 'survivor_female_sheet',
    outPath: path.join(SHEETS_DIR, 'survivor_female_sheet.jpg'),
    aspect: '1:1',
    refs: [path.join(STILLS_DIR, 'char_2_portrait.jpg')],
    prompt:
      'Professional AAA 3D playable character turnaround model sheet (front and back A-pose + weapon callouts): Grindhouse Female Survivor heroine inspired by Fortnite and Bushido Blade. Athletic fierce female survivor wearing a cropped studded dark leather and denim tactical jacket, utility belt, dark cargo pants, high-laced combat boots, fingerless gloves, armed with a spiked bat and flaming Molotov cocktail. Photorealistic 3D character production sheet.',
  },
  {
    id: 'monsters_sheet',
    outPath: path.join(SHEETS_DIR, 'monsters_sheet.jpg'),
    aspect: '16:9',
    refs: [],
    prompt:
      'Professional AAA 3D horror monster turnaround model sheet showing three realistic creatures side-by-side in front/side pose: (1) A rotting Grindhouse Zombie with necrotic grey-green skin, torn bloodied flannel shirt, exposed ribs; (2) A hulking muscular Lycanthrope Werewolf with dark silver-black fur, snarling fanged wolf snout, glowing amber eyes, razor claws, digitigrade legs; (3) A spectral Banshee Ghost in tattered glowing cyan-emerald translucent shroud. Unreal Engine 5 creature production sheet.',
  },
  {
    id: 'tank_sheet',
    outPath: path.join(SHEETS_DIR, 'tank_sheet.jpg'),
    aspect: '16:9',
    refs: [path.join(STILLS_DIR, 'panel_165.jpg'), path.join(STILLS_DIR, 'panel_195.jpg')],
    prompt:
      'Professional 3D vehicle orthographic blueprint and PBR texture sheet grounded on the reference images: Pumpkin Patch Armored War-Rig Tank. Front, side, and 3/4 views of a heavy dark olive-drab and gunmetal armored military tank with a menacing steel skull front grille, glowing amber combustion headlights, heavy armored caterpillar treads, and a roof-mounted triple rotary cannon turret. Photorealistic 3D game vehicle sheet.',
  },
  // 4. SEAMLESS PBR ENVIRONMENT TEXTURES
  {
    id: 'asphalt_road',
    outPath: path.join(TEXTURES_DIR, 'asphalt_road.jpg'),
    aspect: '1:1',
    refs: [],
    prompt:
      'Seamless tileable top-down PBR texture of dark wet cracked nocturnal asphalt road pavement with subtle rain puddles, weathered aggregate gravel, and faint worn amber road grit, 4k game texture.',
  },
  {
    id: 'gothic_stone',
    outPath: path.join(TEXTURES_DIR, 'gothic_stone.jpg'),
    aspect: '1:1',
    refs: [],
    prompt:
      'Seamless tileable flat PBR texture of ancient dark Gothic castle stone wall blocks, weathered basalt and granite masonry with deep mortar crevices and subtle dark moss, 4k game texture.',
  },
  {
    id: 'weathered_wood',
    outPath: path.join(TEXTURES_DIR, 'weathered_wood.jpg'),
    aspect: '1:1',
    refs: [],
    prompt:
      'Seamless tileable flat PBR texture of dilapidated weathered dark barn wood planks with rough grain, iron nail heads, and peeling dark stain for vintage roadside billboards, 4k game texture.',
  },
  {
    id: 'forest_ground',
    outPath: path.join(TEXTURES_DIR, 'forest_ground.jpg'),
    aspect: '1:1',
    refs: [],
    prompt:
      'Seamless tileable top-down PBR texture of dark spooky midnight forest ground with wet mud, dead autumn leaves, mossy rocks, and gnarled roots, 4k game texture.',
  },
];

(async () => {
  console.log(`=== Council Art-to-3D Sheet, Plate & Texture Pipeline (${ASSETS.length} assets) ===`);
  // Run in batches of 4 for speed
  const BATCH = 4;
  for (let i = 0; i < ASSETS.length; i += BATCH) {
    const slice = ASSETS.slice(i, i + BATCH);
    await Promise.all(slice.map((item) => generateAsset(item)));
  }
  console.log('=== Finished generating Council Sheets, Master Plate, Sky Dome & PBR Textures ===');
})();
