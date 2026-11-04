// Builds data/lighting/fixtureCatalog.json from the Open Fixture Library (MIT): real channel modes
// and real physical specs for gear people actually own.
//   npx tsx scripts/lighting/fetchFixtureCatalog.ts
import fs from 'node:fs/promises';
import { profilesFromOfl } from '../../services/lighting/fixtureProfiles';

const RAW = 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/fixtures';

const PICKS = `chauvet-dj/slimpar-pro-h-usb chauvet-dj/slimpar-t12-usb chauvet-dj/slimpar-q12-bt chauvet-dj/intimidator-spot-110
chauvet-dj/intimidator-spot-160 chauvet-dj/intimidator-spot-260 chauvet-dj/freedom-h1 chauvet-dj/gigbar-2 chauvet-dj/hurricane-1600 chauvet-dj/hurricane-haze-2d
chauvet-professional/colorado-1-solo chauvet-professional/rogue-r1-wash chauvet-professional/rogue-r2-wash chauvet-professional/ovation-f-915vw
american-dj/mega-par-profile-plus american-dj/mega-tripar-profile-plus american-dj/mega-hex-par american-dj/dotz-par american-dj/ultra-hex-bar-12
american-dj/inno-pocket-spot american-dj/vizi-spot-led-pro american-dj/fog-fury-jett-pro american-dj/flat-par-qa12 american-dj/encore-profile-1000-ww
martin/mac-aura martin/mac-viper-performance martin/mac-viper-wash martin/mac-250-krypton martin/rush-mh-7-hybrid martin/rush-par-2-rgbw-zoom martin/atomic-3000
clay-paky/sharpy clay-paky/alpha-spot-qwo-800 robe/robin-600e-spot robe/robin-300e-wash
glp/impression-x4-bar-10 glp/impression-spot-one glp/jdc1
etc/source-four-led-series-2-lustr etc/source-four-led-series-3-lustr-x8 etc/colorsource-par etc/colorsource-spot etc/source-4wrd-color-ii
elation/sixpar-200 elation/sixbar-1000 elation/platinum-seven elation/platinum-spot-15r-pro
arri/skypanel-s60c arri/l7-c astera/fp1-titan-tube astera/ax3-lightdrop astera/fp5-nyx-bulb
ayrton/diablo-s ayrton/magicblade-fx showtec/phantom-140-led-spot showtec/led-blinder-2-cob showtec/sunstrip-active-mkii showtec/atmos-2000
stairville/led-par-56 stairville/mh-x25 cameo/zenit-w600 prolights/smartbat eurolite/led-tmh-x25 wled/wled`.split(/\s+/);

const get = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'plajah-fixture-catalog' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

/** OFL matrix modes hold insert blocks; flatten them so a mode is a plain channel list. */
function flattenMatrix(json: any) {
  const pixels: string[] = json.matrix?.pixelKeys
    ? json.matrix.pixelKeys.flat(2).filter(Boolean)
    : Array.from({ length: (json.matrix?.pixelCount ?? [1]).reduce((a: number, b: number) => a * b, 1) }, (_, i) => String(i + 1));
  const groups: Record<string, unknown> = json.matrix?.pixelGroups ?? {};
  json.availableChannels = { ...json.availableChannels };
  for (const mode of json.modes) {
    mode.channels = mode.channels.flatMap((c: any) => {
      if (!c || typeof c !== 'object' || c.insert !== 'matrixChannels') return [c];
      const over: string[] = Array.isArray(c.repeatFor)
        ? c.repeatFor.flatMap((k: string) => (Array.isArray(groups[k]) ? (groups[k] as string[]) : [k]))
        : pixels;
      return over.flatMap((p) => c.templateChannels.map((t: string | null) => {
        if (t == null) return null;
        const key = t.replace(/\$pixelKey/g, p);
        json.availableChannels[key] ??= json.templateChannels?.[t];
        return key;
      }));
    });
  }
}

function formOf(json: any, name: string): string {
  const cats: string[] = json.categories ?? [];
  const n = name.toLowerCase();
  if (cats.includes('Smoke') || cats.includes('Hazer')) return 'fog';
  if (/wled/.test(n)) return 'string';
  if (cats.includes('Moving Head')) return /wash|aura/.test(n) ? 'mover-wash' : /sharpy|beam/.test(n) ? 'mover-beam' : 'mover-spot';
  if (/blinder|dotz/.test(n)) return 'blinder';
  if (/source four|source 4|ovation|colorsource spot|profile 1000/.test(n)) return 'ellipsoidal';
  if (/skypanel|l7|panel/.test(n)) return 'panel';
  if (/titan|helios|tube/.test(n)) return 'tube';
  if (cats.includes('Strobe') || /atomic|jdc|strobe/.test(n)) return 'strobe';
  if (cats.includes('Pixel Bar') || /bar|strip|x4|magicblade/.test(n)) return 'bar';
  return 'par';
}

const CATEGORY: Record<string, any> = { par: 'par', bar: 'bar', 'mover-spot': 'spot', 'mover-wash': 'wash', 'mover-beam': 'spot', strobe: 'strobe', blinder: 'par', ellipsoidal: 'dimmer', panel: 'par', tube: 'bar', fog: 'fog', string: 'bar' };
const beamOf = (json: any) => {
  const d = json.physical?.lens?.degreesMinMax;
  return d ? (d[0] + d[1]) / 2 : undefined;
};

const manufacturers = await get(`${RAW}/manufacturers.json`);
const out: any[] = [];
for (const pick of PICKS) {
  const [man, key] = pick.split('/');
  const json = await get(`${RAW}/${pick}.json`);
  flattenMatrix(json);
  const profiles = profilesFromOfl({ ...json, manufacturerKey: undefined })
    .map((p) => ({ ...p, category: CATEGORY[formOf(json, json.name)] ?? p.category, beamDeg: beamOf(json), id: `ofl-${man}-${key}-${p.id.replace(/^ofl-/, '')}`, name: `${manufacturers[man].name} ${p.name}` }));
  if (!profiles.length) { console.warn('no usable modes', pick); continue; }
  const ph = json.physical ?? {};
  out.push({
    id: `${man}/${key}`,
    manufacturer: manufacturers[man].name,
    name: json.name,
    categories: json.categories ?? [],
    form: formOf(json, json.name),
    spec: {
      dimensionsMm: ph.dimensions, weightKg: ph.weight, powerW: ph.power, dmxConnector: ph.DMXconnector,
      source: ph.bulb?.type, colorTempK: ph.bulb?.colorTemperature, lumens: ph.bulb?.lumens, beamDeg: ph.lens?.degreesMinMax,
      rdm: !!json.rdm,
    },
    productPage: json.links?.productPage?.[0],
    manual: json.links?.manual?.[0],
    profiles,
  });
  console.log(pick, profiles.length, 'modes');
}
await fs.writeFile('data/lighting/fixtureCatalog.json', JSON.stringify({ source: 'Open Fixture Library (MIT), open-fixture-library.org', fixtures: out }));
console.log(out.length, 'fixtures');
