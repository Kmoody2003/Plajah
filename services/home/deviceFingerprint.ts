/**
 * Plajah Home - Hardware OEM & Device Type Fingerprinting Engine
 * Identifies exact Vendor, Model Name, Device Category, and UI Icon for all LAN/Matter/Bluetooth devices.
 */

export type DetailedDeviceType = 
  | 'LIGHT' 
  | 'SPEAKER' 
  | 'DISPLAY' 
  | 'TV' 
  | 'CAMERA' 
  | 'HUB' 
  | 'PHONE' 
  | 'WORKSTATION' 
  | 'CONTROLLER' 
  | 'PRINTER' 
  | 'AUDIO_INTERFACE' 
  | 'MIC'
  | 'PERIPHERAL'
  | 'NETWORK';

export interface DeviceFingerprint {
  brand: string;
  brandColor: string;
  model: string;
  friendlyName: string;
  deviceType: DetailedDeviceType;
  typeLabel: string;
  protocolBadge: string;
  suggestedRoom: string;
}

export function fingerprintDevice(params: {
  rawName: string;
  cleanName?: string;
  vendor?: string;
  model?: string;
  ip?: string;
  mac?: string;
  protocol?: string;
  deviceClass?: string;
}): DeviceFingerprint {
  const name = (params.cleanName || params.rawName || '').trim();
  const lower = name.toLowerCase();
  const ip = (params.ip || '').trim();
  const mac = (params.mac || '').trim().toUpperCase();

  // 1. SAMSUNG HARDWARE
  if (lower.includes('ls60d') || lower.includes('frame 1') || lower.includes('master bedroom speaker')) {
    const isMaster = lower.includes('master') || ip === '192.168.4.29';
    return {
      brand: 'Samsung',
      brandColor: '#00DAF3',
      model: 'HW-LS60D Music Frame',
      friendlyName: isMaster ? 'Master Bedroom Music Frame' : 'Living Room Music Frame 1',
      deviceType: 'DISPLAY',
      typeLabel: 'Smart Audio & Ambient Art Frame',
      protocolBadge: 'AIRPLAY 2 · SPOTIFY',
      suggestedRoom: isMaster ? 'Master Bedroom' : 'Living Room'
    };
  }

  if (lower.includes('q850d') || lower.includes('soundbar') || ip === '192.168.4.32') {
    return {
      brand: 'Samsung',
      brandColor: '#00DAF3',
      model: 'HW-Q850D Q-Symphony',
      friendlyName: 'Living Room Q-Series Soundbar',
      deviceType: 'SPEAKER',
      typeLabel: 'Dolby Atmos Surround Soundbar',
      protocolBadge: 'AIRPLAY 2 · MATV',
      suggestedRoom: 'Living Room'
    };
  }

  if (lower.includes('galaxyboo') || lower.includes('workstation') || lower.includes('kmoody')) {
    return {
      brand: 'Samsung',
      brandColor: '#00DAF3',
      model: 'Galaxy Book4 Ultra',
      friendlyName: "Kenny's Galaxy Book4 Ultra",
      deviceType: 'WORKSTATION',
      typeLabel: 'Intel Core Ultra 9 / RTX 4070 Workstation',
      protocolBadge: 'HOST RUNNER',
      suggestedRoom: 'Creative Studio'
    };
  }

  if (lower.includes('s23 ultra') || lower.includes('galaxy s')) {
    return {
      brand: 'Samsung',
      brandColor: '#00DAF3',
      model: 'Galaxy S23 Ultra',
      friendlyName: "Kenneth's S23 Ultra",
      deviceType: 'PHONE',
      typeLabel: 'Snapdragon 8 Gen 2 Smartphone',
      protocolBadge: 'BLUETOOTH 5.3',
      suggestedRoom: 'Roaming'
    };
  }

  // 2. HARMAN / JBL
  if (lower.includes('authentics') || lower.includes('dining speaker') || ip === '192.168.4.92' || mac.startsWith('84:3E:1D')) {
    return {
      brand: 'JBL / Harman',
      brandColor: '#FF8C00',
      model: 'Authentics 200',
      friendlyName: 'Dining Room Hi-Fi Speaker',
      deviceType: 'SPEAKER',
      typeLabel: 'Lossless Wi-Fi Smart Speaker',
      protocolBadge: 'AIRPLAY 2 · CHORA',
      suggestedRoom: 'Dining Room'
    };
  }

  // 3. APPLE
  if (lower.includes('kamille') || lower.includes('appletv') || ip === '192.168.4.57') {
    return {
      brand: 'Apple',
      brandColor: '#A0A0B0',
      model: 'Apple TV 4K',
      friendlyName: "Kamille's Apple TV 4K",
      deviceType: 'TV',
      typeLabel: '4K Dolby Vision Streaming Player',
      protocolBadge: 'AIRPLAY 2 · THREAD',
      suggestedRoom: "Kamille's Room"
    };
  }

  // 4. PHILIPS HUE
  if (lower.includes('hue bridge') || ip === '192.168.4.21') {
    return {
      brand: 'Philips Hue',
      brandColor: '#FFB800',
      model: 'Hue Bridge v2 (BSB002)',
      friendlyName: 'Hue Lighting Bridge & Gateway',
      deviceType: 'HUB',
      typeLabel: 'Matter-Certified Zigbee Lighting Hub',
      protocolBadge: 'MATTER 1.3 · ZIGBEE',
      suggestedRoom: 'Network Core'
    };
  }

  // 5. NANOLEAF
  if (lower.includes('shapes') || lower.includes('nanoleaf') || lower.includes('nl42') || ip === '192.168.4.73') {
    return {
      brand: 'Nanoleaf',
      brandColor: '#00DAF3',
      model: 'Shapes Triangles & Hexagons',
      friendlyName: 'Studio Nanoleaf Shapes Light Panels',
      deviceType: 'LIGHT',
      typeLabel: 'Modular RGBW Smart Light Panels',
      protocolBadge: 'MATTER 1.3 · THREAD',
      suggestedRoom: 'Creative Studio'
    };
  }

  // 6. ANKER EUFY
  if (lower.includes('indoorcam') || lower.includes('pan 2k') || lower.includes('t8410') || ip === '192.168.7.250') {
    return {
      brand: 'Anker Eufy',
      brandColor: '#06D6A0',
      model: 'IndoorCam Pan & Tilt 2K (T8410)',
      friendlyName: 'Perimeter Indoor Security Camera 2K',
      deviceType: 'CAMERA',
      typeLabel: 'Pan & Tilt 2K Smart Security Camera',
      protocolBadge: 'HOMEKIT · RTSP',
      suggestedRoom: 'Front Porch & Entry'
    };
  }

  // 7. AMAZON ECHO & EERO
  if (ip === '192.168.4.1' || lower.includes('lighthouse router') || lower.includes('eero')) {
    return {
      brand: 'Amazon eero',
      brandColor: '#00DAF3',
      model: 'eero Mesh Gateway',
      friendlyName: 'Lighthouse Gateway & Thread Router',
      deviceType: 'HUB',
      typeLabel: 'Wi-Fi 6E Mesh & Thread Border Router',
      protocolBadge: 'THREAD · ROUTER',
      suggestedRoom: 'Network Core'
    };
  }

  if (lower.includes('echo') || lower.includes('amazon') || [
    '192.168.4.67', '192.168.4.72', '192.168.4.85', '192.168.4.26', '192.168.4.23',
    '192.168.4.33', '192.168.4.66', '192.168.7.227', '192.168.7.240', '192.168.7.251'
  ].includes(ip)) {
    const lastOctet = ip.split('.').pop() || 'Hub';
    let room = 'Living Room';
    if (ip === '192.168.4.26') room = 'Master Bedroom';
    else if (ip === '192.168.4.33') room = 'Kitchen';
    else if (ip === '192.168.4.23') room = 'Guest Bedroom';

    return {
      brand: 'Amazon',
      brandColor: '#00DAF3',
      model: 'Echo Smart Speaker (Matter)',
      friendlyName: `${room} Echo Hub (${lastOctet})`,
      deviceType: 'SPEAKER',
      typeLabel: 'Matter 1.3 Voice & Audio Hub',
      protocolBadge: 'MATTER 1.3 · THREAD',
      suggestedRoom: room
    };
  }

  // 8. RAZER
  if (lower.includes('basilisk') || lower.includes('razer')) {
    return {
      brand: 'Razer',
      brandColor: '#06D6A0',
      model: 'Basilisk X HyperSpeed',
      friendlyName: 'Razer Basilisk Wireless Mouse',
      deviceType: 'PERIPHERAL',
      typeLabel: 'HyperSpeed Wireless Gaming Mouse',
      protocolBadge: 'BLUETOOTH LE',
      suggestedRoom: 'Creative Studio'
    };
  }

  // 9. MICROSOFT XBOX
  if (lower.includes('xbox') || lower.includes('controller')) {
    return {
      brand: 'Microsoft',
      brandColor: '#06D6A0',
      model: 'Xbox Wireless Controller',
      friendlyName: 'Xbox Series Wireless Controller',
      deviceType: 'CONTROLLER',
      typeLabel: 'Bluetooth Wireless Gamepad',
      protocolBadge: 'BLUETOOTH LE',
      suggestedRoom: 'Living Room'
    };
  }

  // 10. NATIVE INSTRUMENTS
  if (lower.includes('maschine')) {
    return {
      brand: 'Native Instruments',
      brandColor: '#D40055',
      model: 'Maschine Studio',
      friendlyName: 'NI Maschine Studio MIDI Controller',
      deviceType: 'AUDIO_INTERFACE',
      typeLabel: 'Groove Production Hardware Console',
      protocolBadge: 'HIGH-SPEED USB',
      suggestedRoom: 'Creative Studio'
    };
  }

  if (lower.includes('komplete')) {
    return {
      brand: 'Native Instruments',
      brandColor: '#D40055',
      model: 'Komplete Kontrol S-Series',
      friendlyName: 'NI Komplete Kontrol Smart Keyboard',
      deviceType: 'AUDIO_INTERFACE',
      typeLabel: 'Fatar Keybed Smart MIDI Keyboard',
      protocolBadge: 'HIGH-SPEED USB',
      suggestedRoom: 'Creative Studio'
    };
  }

  // 11. HP PRINTER
  if (lower.includes('officejet') || lower.includes('printer') || lower.includes('hp 5200')) {
    return {
      brand: 'HP',
      brandColor: '#00DAF3',
      model: 'OfficeJet 5200 All-in-One',
      friendlyName: 'HP OfficeJet 5200 Smart Printer',
      deviceType: 'PRINTER',
      typeLabel: 'Wireless Color Inkjet All-in-One',
      protocolBadge: 'WI-FI DIRECT · WSD',
      suggestedRoom: 'Home Office'
    };
  }

  // 12. AUDIO ENDPOINTS & MICS
  if (lower.includes('realtek') || lower.includes('headphone')) {
    return {
      brand: 'Realtek / Audio',
      brandColor: '#FF8C00',
      model: 'USB 2.0 DAC Studio Interface',
      friendlyName: 'Hi-Res USB Audio DAC & Monitor Out',
      deviceType: 'AUDIO_INTERFACE',
      typeLabel: 'Studio Headphone & Speaker DAC',
      protocolBadge: 'USB AUDIO CLASS 2',
      suggestedRoom: 'Creative Studio'
    };
  }

  if (lower.includes('microphone') || lower.includes('smart sound') || lower.includes('audio share')) {
    return {
      brand: 'Intel',
      brandColor: '#00DAF3',
      model: 'Smart Sound Mic Array',
      friendlyName: 'Quad Studio Intercom Microphone Array',
      deviceType: 'MIC',
      typeLabel: 'Aria Voice & 2-Way Intercom Sensor',
      protocolBadge: 'HARDWARE ENDPOINT',
      suggestedRoom: 'Creative Studio'
    };
  }

  if (lower.includes('camera share') || lower.includes('avstream')) {
    return {
      brand: 'Intel',
      brandColor: '#06D6A0',
      model: 'AVStream FHD Sensor',
      friendlyName: 'Studio HD Webcam Sensor',
      deviceType: 'CAMERA',
      typeLabel: 'FHD HDR Video Call Camera',
      protocolBadge: 'HARDWARE ENDPOINT',
      suggestedRoom: 'Creative Studio'
    };
  }

  // 13. MATTER OPERATIONAL NODES
  if (params.protocol === 'MATTER' || lower.includes('matter node')) {
    const lastHex = name.split(' ').pop() || ip.split('.').pop() || 'Node';
    return {
      brand: 'Matter Standard',
      brandColor: '#00DAF3',
      model: `Matter 1.3 Endpoint (${lastHex})`,
      friendlyName: `Matter Smart Device (${lastHex})`,
      deviceType: 'LIGHT',
      typeLabel: 'Matter Certified Smart Home Node',
      protocolBadge: 'MATTER 1.3 · IPV6',
      suggestedRoom: 'Living Room'
    };
  }

  // Fallback
  return {
    brand: params.vendor && params.vendor !== 'Generic' ? params.vendor : 'Smart Network Node',
    brandColor: '#D0BCFF',
    model: params.model || (ip ? `Host ${ip}` : 'Network Peripheral'),
    friendlyName: name,
    deviceType: (params.deviceClass as any) || 'NETWORK',
    typeLabel: `${params.protocol || 'LAN'} Verified Device`,
    protocolBadge: params.protocol || 'LAN',
    suggestedRoom: 'Living Room'
  };
}
