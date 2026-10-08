/**
 * Device Location & Zone Parser Engine
 * 
 * Automatically parses where a device is located in the home from its network/mDNS/UPnP name.
 * Extracts: Room Name, Floor, Spatial Zone, Normalized Category, Capabilities, and Floor Plan (x,y) layout coordinates.
 */

export interface ParsedLocation {
  roomId: string;
  roomName: string;
  floor: 'main' | 'upper' | 'exterior' | 'basement';
  zone: string;
  themeColor: string;
  layoutCoords: { x: number; y: number }; // percentage 0-100 on floor plan blueprint
  category: 'TV' | 'SPEAKER' | 'CAMERA' | 'LIGHT' | 'HUB' | 'DISPLAY' | 'PRINTER' | 'MOBILE' | 'WORKSTATION' | 'SENSOR' | 'CLIMATE';
  cleanName: string;
  iconType: string;
}

interface RoomRule {
  id: string;
  name: string;
  floor: 'main' | 'upper' | 'exterior' | 'basement';
  zone: string;
  themeColor: string;
  defaultCoords: { x: number; y: number };
  pattern: RegExp;
}

const ROOM_RULES: RoomRule[] = [
  {
    id: 'master_bedroom',
    name: 'Master Bedroom',
    floor: 'upper',
    zone: 'Master Suite',
    themeColor: '#D0BCFF', // Lilac
    defaultCoords: { x: 74, y: 35 },
    pattern: /master\s*bed|primary\s*bed|mbdr|bedroo/i
  },
  {
    id: 'living_room',
    name: 'Living Room',
    floor: 'main',
    zone: 'Main Lounge',
    themeColor: '#00DAF3', // Cyan
    defaultCoords: { x: 38, y: 46 },
    pattern: /living|lounge|salon|parlor|great\s*room|xbox|controller/i
  },
  {
    id: 'network_core',
    name: 'Network Infrastructure & Hub',
    floor: 'main',
    zone: 'Core Infrastructure',
    themeColor: '#00DAF3',
    defaultCoords: { x: 50, y: 50 },
    pattern: /router|gateway|hub|switch|access\s*point|lighthouse|hue\s*bridge/i
  },
  {
    id: 'dining_room',
    name: 'Dining Room',
    floor: 'main',
    zone: 'Dining & Gathering',
    themeColor: '#FFB800',
    defaultCoords: { x: 30, y: 35 },
    pattern: /dining|dinner|nook/i
  },
  {
    id: 'family_room',
    name: 'Family Media Room',
    floor: 'main',
    zone: 'Media Lounge',
    themeColor: '#FF8C00', // Signal Orange
    defaultCoords: { x: 68, y: 52 },
    pattern: /family|media|den|playroom/i
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    floor: 'main',
    zone: 'Culinary Area',
    themeColor: '#FFB800', // Warm Amber
    defaultCoords: { x: 22, y: 28 },
    pattern: /kitchen|cook|pantry|fridge|coffee/i
  },
  {
    id: 'studio',
    name: 'Creative Studio Lab',
    floor: 'main',
    zone: 'Creative Workshop',
    themeColor: '#D40055', // Hyper-Magenta
    defaultCoords: { x: 18, y: 78 },
    pattern: /studio|lab|synthesizer|maschine|komplete|midi|shapes|nanoleaf/i
  },
  {
    id: 'office',
    name: 'Home Office & Tech Rig',
    floor: 'main',
    zone: 'Workstation',
    themeColor: '#00DAF3', // Cyan
    defaultCoords: { x: 82, y: 80 },
    pattern: /office|desk|workstation|rig|study|printer|officejet|laserjet|display|monitor|ls32/i
  },
  {
    id: 'kamille_room',
    name: "Kamille's Room",
    floor: 'upper',
    zone: 'Bedroom Suite',
    themeColor: '#D40055',
    defaultCoords: { x: 25, y: 35 },
    pattern: /kamille/i
  },
  {
    id: 'guest_bedroom',
    name: 'Guest Bedroom',
    floor: 'upper',
    zone: 'Guest Suite',
    themeColor: '#D0BCFF',
    defaultCoords: { x: 25, y: 35 },
    pattern: /guest|bedroom\s*2|br2|spare/i
  },
  {
    id: 'front_porch',
    name: 'Front Porch & Entry',
    floor: 'exterior',
    zone: 'Front Perimeter',
    themeColor: '#06D6A0', // Emerald
    defaultCoords: { x: 50, y: 92 },
    pattern: /front\s*door|porch|doorbell|entry|foyer|entrance|vestibule|indoorcam|pan\s*2k/i
  },
  {
    id: 'backyard',
    name: 'Patio & Backyard',
    floor: 'exterior',
    zone: 'Outdoor Lounge',
    themeColor: '#06D6A0',
    defaultCoords: { x: 50, y: 12 },
    pattern: /patio|deck|backyard|garden|terrace|outdoor|courtyard/i
  },
  {
    id: 'garage',
    name: 'Garage & Workshop',
    floor: 'main',
    zone: 'Utility',
    themeColor: '#A0A0B0',
    defaultCoords: { x: 90, y: 40 },
    pattern: /garage|carport|driveway|workshop/i
  },
  {
    id: 'bathroom',
    name: 'Bath Suite',
    floor: 'main',
    zone: 'Sanitary',
    themeColor: '#00DAF3',
    defaultCoords: { x: 48, y: 22 },
    pattern: /bath|powder|restroom|shower|toilet/i
  },
  {
    id: 'basement',
    name: 'Basement & Lower Level',
    floor: 'basement',
    zone: 'Lower Ground',
    themeColor: '#6B0099',
    defaultCoords: { x: 50, y: 50 },
    pattern: /basement|cellar|dungeon|lower/i
  }
];

export function parseDeviceLocation(rawName: string, deviceClassHint?: string): ParsedLocation {
  const name = rawName.trim();

  // 1. Identify Room & Floor from Name
  let matchedRule: RoomRule | null = null;
  for (const rule of ROOM_RULES) {
    if (rule.pattern.test(name)) {
      matchedRule = rule;
      break;
    }
  }

  // 2. Identify Device Category
  let category: ParsedLocation['category'] = 'DISPLAY';
  let iconType = 'Monitor';

  if (/tv|crystal uhd|q60a|tu690t|webos|bravia|roku/i.test(name) || deviceClassHint === 'TV') {
    category = 'TV';
    iconType = 'Tv';
  } else if (/speaker|soundbar|sonos|homepod|audio|echo dot|nest audio/i.test(name) || deviceClassHint === 'SPEAKER') {
    category = 'SPEAKER';
    iconType = 'Speaker';
  } else if (/cam|camera|doorbell|ring|nest cam/i.test(name) || deviceClassHint === 'CAMERA') {
    category = 'CAMERA';
    iconType = 'Camera';
  } else if (/light|lamp|strip|bulb|hue|nanoleaf|govee|cove/i.test(name) || deviceClassHint === 'LIGHT') {
    category = 'LIGHT';
    iconType = 'Lightbulb';
  } else if (/thermostat|ecobee|nest learning|climate|hvac/i.test(name) || deviceClassHint === 'CLIMATE') {
    category = 'CLIMATE';
    iconType = 'Thermometer';
  } else if (/printer|scanner|officejet|deskjet|laserjet/i.test(name) || deviceClassHint === 'PRINTER') {
    category = 'PRINTER';
    iconType = 'Printer';
  } else if (/ultra|galaxy s|iphone|pixel|phone/i.test(name) || deviceClassHint === 'MOBILE') {
    category = 'MOBILE';
    iconType = 'Smartphone';
  } else if (/dock|hub|bridge|matter controller/i.test(name) || deviceClassHint === 'HUB') {
    category = 'HUB';
    iconType = 'Cpu';
  } else if (/maschine|komplete|rig|pc|workstation/i.test(name) || deviceClassHint === 'WORKSTATION') {
    category = 'WORKSTATION';
    iconType = 'Monitor';
  }

  // Default fallback if no specific room keyword was found
  if (!matchedRule) {
    if (category === 'TV' || category === 'SPEAKER') {
      matchedRule = ROOM_RULES.find(r => r.id === 'living_room')!;
    } else if (category === 'PRINTER' || category === 'WORKSTATION') {
      matchedRule = ROOM_RULES.find(r => r.id === 'office')!;
    } else if (category === 'CAMERA') {
      matchedRule = ROOM_RULES.find(r => r.id === 'front_porch')!;
    } else if (category === 'MOBILE') {
      matchedRule = {
        id: 'roaming',
        name: 'Roaming Mobile',
        floor: 'main',
        zone: 'Personal Area',
        themeColor: '#FF8C00',
        defaultCoords: { x: 50, y: 50 },
        pattern: /mobile/i
      };
    } else {
      matchedRule = ROOM_RULES.find(r => r.id === 'living_room')!;
    }
  }

  // 3. Clean Display Name
  let cleanName = name
    .replace(/^\[.*?\]\s*/, '')
    .replace(/#miracast/gi, '')
    .replace(/\s*\(.*?\)$/, '')
    .trim();

  // Normalize specific device titles for elegance
  if (/workstation|host machine/i.test(cleanName)) cleanName = `${cleanName.split(' ')[0]} Rig`;
  else if (/s23 ultra/i.test(cleanName)) cleanName = "Kenneth's Galaxy S23 Ultra";
  else if (/xbox.*controller/i.test(cleanName)) cleanName = "Xbox Wireless Controller";
  else if (/officejet/i.test(cleanName)) cleanName = 'HP OfficeJet 5200 Series';
  else if (/ls32/i.test(cleanName)) cleanName = 'Samsung Odyssey LS32 32" Display';
  else if (/gateway|router|moodygig/i.test(cleanName)) cleanName = 'Wi-Fi Gateway (MoodyGig)';
  else if (/komplete/i.test(cleanName)) cleanName = 'Komplete Kontrol MIDI';
  else if (/maschine/i.test(cleanName)) cleanName = 'Maschine Studio MIDI';
  else if (/basilisk/i.test(cleanName)) cleanName = 'Razer Basilisk X HyperSpeed';

  // Provide slight coordinate jitter for multiple devices in same room
  const jitterX = ((name.length % 5) - 2) * 3;
  const jitterY = (((name.charCodeAt(0) || 0) % 5) - 2) * 3;

  return {
    roomId: matchedRule.id,
    roomName: matchedRule.name,
    floor: matchedRule.floor,
    zone: matchedRule.zone,
    themeColor: matchedRule.themeColor,
    layoutCoords: {
      x: Math.max(10, Math.min(90, matchedRule.defaultCoords.x + jitterX)),
      y: Math.max(10, Math.min(90, matchedRule.defaultCoords.y + jitterY))
    },
    category,
    cleanName,
    iconType
  };
}
