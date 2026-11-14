// Smart-light models for the gallery, per brand. No open data set exists for these the way Open
// Fixture Library exists for DMX, so this is hand-written and sticks to what a model is known to do:
// no lumens or wattage, which vary by region and revision. Check the maker's page before buying.

import type { LightPlatform } from '../smartLightingService';

export type SmartForm = 'bulb' | 'strip' | 'panels' | 'lamp' | 'lightbar' | 'peripheral' | 'string';

export type SmartCapability =
  | 'Full colour' | 'Tunable white' | 'Warm white only' | 'Multi-zone colour' | 'Music sync on device' | 'Screen sync'
  | 'Outdoor rated' | 'Battery' | 'Matter' | 'Thread' | 'Wi-Fi' | 'Bluetooth' | 'Zigbee' | 'USB / Synapse';

export interface SmartModel {
  id: string;
  platform: LightPlatform;
  name: string;
  form: SmartForm;
  note: string;
  capabilities: SmartCapability[];
}

export interface SmartBrand {
  platform: LightPlatform;
  name: string;
  site: string;
  connect: string;
  /** What Plajah can do with this brand's lights today, which can be less than the hardware can. */
  control: string;
}

export const SMART_BRANDS: SmartBrand[] = [
  { platform: 'hue', name: 'Philips Hue', site: 'https://www.philips-hue.com', connect: 'Sign in with your Hue account.', control: 'Plajah sets on/off, brightness and one colour per light. Gradient zones show one colour for now.' },
  { platform: 'govee', name: 'Govee', site: 'https://www.govee.com', connect: 'Scan your network, or paste a Govee API key.', control: 'Plajah sets on/off, brightness and one colour per device. Segments show one colour for now.' },
  { platform: 'nanoleaf', name: 'Nanoleaf', site: 'https://nanoleaf.me', connect: 'Scan your network, then hold the power button to pair.', control: 'Plajah sets on/off, brightness and one colour per controller, not each panel.' },
  { platform: 'razer', name: 'Razer Chroma', site: 'https://www.razer.com/chroma', connect: 'Have Synapse running on this PC.', control: 'Plajah sends one colour to Chroma devices through Synapse on this PC.' },
];

const hue = (id: string, name: string, form: SmartForm, note: string, extra: SmartCapability[]): SmartModel =>
  ({ id: `hue-${id}`, platform: 'hue', name, form, note, capabilities: ['Tunable white', 'Zigbee', 'Bluetooth', 'Matter', ...extra] });
const govee = (id: string, name: string, form: SmartForm, note: string, extra: SmartCapability[]): SmartModel =>
  ({ id: `govee-${id}`, platform: 'govee', name, form, note, capabilities: ['Wi-Fi', 'Bluetooth', ...extra] });
const leaf = (id: string, name: string, form: SmartForm, note: string, extra: SmartCapability[]): SmartModel =>
  ({ id: `leaf-${id}`, platform: 'nanoleaf', name, form, note, capabilities: extra });
const razer = (id: string, name: string, form: SmartForm, note: string): SmartModel =>
  ({ id: `razer-${id}`, platform: 'razer', name, form, note, capabilities: ['Full colour', 'Multi-zone colour', 'USB / Synapse'] });

export const SMART_MODELS: SmartModel[] = [
  hue('color-bulb', 'White and Color Ambiance Bulb', 'bulb', 'The everyday colour bulb.', ['Full colour']),
  hue('ambiance-bulb', 'White Ambiance Bulb', 'bulb', 'Warm to cool white, no colour.', []),
  hue('lightstrip-plus', 'Lightstrip Plus', 'strip', 'Extendable indoor strip.', ['Full colour']),
  hue('gradient-strip', 'Gradient Lightstrip', 'strip', 'Several colours along one strip.', ['Full colour', 'Multi-zone colour']),
  hue('play-gradient', 'Play Gradient Lightstrip', 'strip', 'Mounts behind a TV or monitor.', ['Full colour', 'Multi-zone colour', 'Screen sync']),
  hue('play-bar', 'Play Light Bar', 'lightbar', 'Small uplighter for behind a screen.', ['Full colour', 'Screen sync']),
  hue('go', 'Go Portable Light', 'lamp', 'Carry it around the room or outside.', ['Full colour', 'Battery']),
  hue('iris', 'Iris Table Lamp', 'lamp', 'Glowing accent lamp.', ['Full colour']),
  hue('outdoor-strip', 'Outdoor Lightstrip', 'strip', 'For patios and rooflines.', ['Full colour', 'Outdoor rated']),

  govee('rgbic-strip', 'RGBIC LED Strip Lights', 'strip', 'Separate colours along one strip.', ['Full colour', 'Multi-zone colour', 'Music sync on device']),
  govee('bulb', 'Smart LED Bulb', 'bulb', 'Colour bulb with no hub.', ['Full colour', 'Tunable white']),
  govee('hexa', 'Glide Hexa Light Panels', 'panels', 'Wall panels with per-panel colour.', ['Full colour', 'Multi-zone colour', 'Music sync on device']),
  govee('glide-bar', 'Glide Wall Light', 'lightbar', 'Linear wall bars.', ['Full colour', 'Multi-zone colour', 'Music sync on device']),
  govee('immersion', 'Immersion TV Backlight', 'strip', 'A camera matches the strip to the TV.', ['Full colour', 'Multi-zone colour', 'Screen sync', 'Music sync on device']),
  govee('lyra', 'Lyra Floor Lamp', 'lamp', 'Corner floor lamp.', ['Full colour', 'Multi-zone colour', 'Music sync on device']),
  govee('curtain', 'Curtain Lights', 'string', 'Hanging pixel curtain for walls and windows.', ['Full colour', 'Multi-zone colour', 'Music sync on device']),
  govee('permanent', 'Permanent Outdoor Lights', 'string', 'Eave-mounted, good for year-round holiday displays.', ['Full colour', 'Multi-zone colour', 'Outdoor rated']),
  govee('christmas', 'Christmas String Lights', 'string', 'Holiday string for trees and rails.', ['Full colour', 'Multi-zone colour', 'Music sync on device', 'Outdoor rated']),

  leaf('shapes', 'Shapes', 'panels', 'Hexagons, triangles and mini triangles.', ['Full colour', 'Tunable white', 'Multi-zone colour', 'Music sync on device', 'Wi-Fi', 'Thread']),
  leaf('lines', 'Lines', 'lightbar', 'Backlit wall bars.', ['Full colour', 'Tunable white', 'Multi-zone colour', 'Music sync on device', 'Wi-Fi', 'Thread']),
  leaf('canvas', 'Canvas', 'panels', 'Touch-reactive square panels.', ['Full colour', 'Tunable white', 'Multi-zone colour', 'Music sync on device', 'Wi-Fi', 'Thread']),
  leaf('elements', 'Elements', 'panels', 'Wood-look hexagons.', ['Warm white only', 'Multi-zone colour', 'Music sync on device', 'Wi-Fi', 'Thread']),
  leaf('essentials-bulb', 'Essentials Bulb', 'bulb', 'Colour bulb with no bridge.', ['Full colour', 'Tunable white', 'Matter', 'Thread', 'Bluetooth']),
  leaf('essentials-strip', 'Essentials Lightstrip', 'strip', 'Colour strip with no bridge.', ['Full colour', 'Tunable white', 'Matter', 'Thread', 'Bluetooth']),
  leaf('screen-mirror', '4D Screen Mirror + Lightstrip', 'strip', 'A camera matches the strip to the screen.', ['Full colour', 'Multi-zone colour', 'Screen sync', 'Music sync on device', 'Wi-Fi']),

  razer('blackwidow', 'BlackWidow Keyboard', 'peripheral', 'Per-key colour.'),
  razer('basilisk', 'Basilisk Mouse', 'peripheral', 'Scroll wheel and logo zones.'),
  razer('firefly', 'Firefly Mouse Mat', 'peripheral', 'Underglow around the mat.'),
  razer('kraken', 'Kraken Headset', 'peripheral', 'Earcup lighting.'),
  razer('argb', 'Chroma ARGB Controller', 'strip', 'Runs addressable strips and fans inside a PC.'),
];

export function searchSmartModels(query: string, platform: LightPlatform | 'all'): SmartModel[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SMART_MODELS.filter((m) => {
    if (platform !== 'all' && m.platform !== platform) return false;
    const hay = `${SMART_BRANDS.find((b) => b.platform === m.platform)!.name} ${m.name} ${m.capabilities.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
