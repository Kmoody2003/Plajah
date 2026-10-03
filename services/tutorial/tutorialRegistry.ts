// services/tutorial/tutorialRegistry.ts
// Platform Self-Building Tutorial Engine — Feature Specifications & Markup Registry

export interface TutorialMarkup {
  id: string;
  shape: 'spotlight-rect' | 'spotlight-circle' | 'arrow' | 'pulse-badge' | 'bracket';
  x: number; // percentage (0 - 100) or pixel
  y: number;
  width?: number;
  height?: number;
  label?: string;
  color?: string; // Tailwind or Hex
  arrowDirection?: 'up' | 'down' | 'left' | 'right';
}

export interface TutorialStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  targetSelector?: string;
  actionType?: 'click' | 'drag' | 'type' | 'hotkey' | 'inspect';
  hotkey?: string;
  badges?: string[];
  markups: TutorialMarkup[];
  screenshotPlaceholderText?: string;
  screenshotUrl?: string;
}

export interface FeatureTutorial {
  featureId: string;
  featureName: string;
  moduleName: string;
  category: 'Broadcast' | 'Audio DAW' | 'Video NLE' | 'Lighting' | 'Commerce' | 'Civic & Places' | 'Sports 3D' | 'Education';
  estimatedTime: string;
  summary: string;
  steps: TutorialStep[];
}

export const TUTORIAL_REGISTRY: Record<string, FeatureTutorial> = {
  'ambo-broadcast': {
    featureId: 'ambo-broadcast',
    featureName: 'Ambo Master Live Broadcast & LED Wall',
    moduleName: 'Ambo / Elevate',
    category: 'Broadcast',
    estimatedTime: '2 min',
    summary: 'Master multi-display presentation rasterization, LED wall routing, auto-saving, and uninterrupted slide playback.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-workspace',
        title: 'Open Live Presentation Workspace',
        instruction: 'Navigate to Ambo from the top switcher. Notice the Master Slides rail on the left and the Live Program Preview in the center.',
        targetSelector: '#ambo-master-slides',
        actionType: 'click',
        hotkey: 'Alt + A',
        badges: ['Auto-Save Active', 'NDI Ready'],
        markups: [
          { id: 'm1', shape: 'spotlight-rect', x: 5, y: 15, width: 25, height: 70, label: 'Slide Deck Deck', color: '#ff8c00' },
          { id: 'm2', shape: 'arrow', x: 32, y: 30, arrowDirection: 'left', label: 'Select or drag slides' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-output-menu',
        title: 'Route to External LED Walls & NDI',
        instruction: 'Click the "Output" menu in the top bar. Select "LED Wall Configuration" to open the multi-panel rasterizer modal.',
        targetSelector: '#ambo-output-menu-btn',
        actionType: 'click',
        badges: ['Multi-Display', 'Hardware Acceleration'],
        markups: [
          { id: 'm3', shape: 'pulse-badge', x: 75, y: 8, label: 'Output Menu', color: '#10b981' },
          { id: 'm4', shape: 'arrow', x: 75, y: 15, arrowDirection: 'down', label: 'Choose LED Wall or Secondary Display' }
        ]
      },
      {
        stepNumber: 3,
        id: 'step-3-live-switch',
        title: 'Seamless Live Slide Firing',
        instruction: 'Press Spacebar or right-arrow to advance slides. The master broadcast engine pre-renders transitions without dropping display sync.',
        actionType: 'hotkey',
        hotkey: 'Space / Right Arrow',
        badges: ['Zero-Frame Drop', 'Persistence Loop'],
        markups: [
          { id: 'm5', shape: 'spotlight-circle', x: 50, y: 50, width: 40, height: 40, label: 'Live Program View', color: '#8b5cf6' }
        ]
      }
    ]
  },

  'melos-synth-sampler': {
    featureId: 'melos-synth-sampler',
    featureName: 'Melos Pro Sound Studio: ONDA & KERA',
    moduleName: 'Melos DAW',
    category: 'Audio DAW',
    estimatedTime: '3 min',
    summary: 'Design rich wavetable sounds with ONDA, load multisampled soundfonts with KERA, and sculpt master bus audio with Spectra EQ.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-add-instrument',
        title: 'Add an ONDA Wavetable Synth',
        instruction: 'Click "+ Add Instrument" in the Melos timeline. Choose ONDA to instantiate the Rust/WASM wavetable synthesizer on a dedicated track.',
        targetSelector: '#melos-add-track-btn',
        actionType: 'click',
        badges: ['WASM DSP', 'Low Latency'],
        markups: [
          { id: 'm1', shape: 'pulse-badge', x: 12, y: 22, label: '+ Add Instrument', color: '#06b6d4' },
          { id: 'm2', shape: 'arrow', x: 20, y: 25, arrowDirection: 'left', label: 'Choose ONDA or KERA' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-modulate',
        title: 'Drag Motion Modulators to Knobs',
        instruction: 'Drag one of the 7 Motion shapes directly onto any cutoff or wavetable position knob to create instant animated modulation.',
        targetSelector: '.motion-modulator-source',
        actionType: 'drag',
        badges: ['7 Wave Shapes', 'Visual LFO'],
        markups: [
          { id: 'm3', shape: 'spotlight-rect', x: 30, y: 65, width: 40, height: 25, label: 'Motion Modulation Strip', color: '#f59e0b' }
        ]
      },
      {
        stepNumber: 3,
        id: 'step-3-send-fabula',
        title: 'Export Directly to Fabula Video NLE',
        instruction: 'Once your groove is complete, click "→ Fabula". Melos renders a sample-cleared stem pass directly into your active Fabula video timeline.',
        targetSelector: '#melos-to-fabula-btn',
        actionType: 'click',
        badges: ['Instant Interop', 'Stems Synced'],
        markups: [
          { id: 'm4', shape: 'pulse-badge', x: 88, y: 8, label: '→ Fabula', color: '#ec4899' }
        ]
      }
    ]
  },

  'fabula-forge-fx': {
    featureId: 'fabula-forge-fx',
    featureName: 'Fabula Local-First NLE & Forge FX Suite',
    moduleName: 'Fabula Video',
    category: 'Video NLE',
    estimatedTime: '3 min',
    summary: 'Edit directly from local drive handles, apply 175 real-time Forge GPU effects, and isolate moving subjects with client-side SAM AI.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-local-handles',
        title: 'Direct Local Disk Playback & JKL Shuttle',
        instruction: 'Import video files using your local watch folder or direct picker. Notice the blue glowing indicator showing zero-buffer local disk streaming.',
        targetSelector: '#fabula-media-pool',
        actionType: 'click',
        hotkey: 'J / K / L Shuttle',
        badges: ['Zero Cloud Latency', 'FileSystem API'],
        markups: [
          { id: 'm1', shape: 'spotlight-rect', x: 45, y: 25, width: 45, height: 45, label: 'Local-First Monitor', color: '#3b82f6' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-forge-effects',
        title: 'Browse 175 GPU Effects & Beat Reactor',
        instruction: 'Open the Forge FX panel. Drag an effect onto any timeline clip, and enable "Beat Reactor" to pulse parameters automatically to soundtrack transients.',
        targetSelector: '#fabula-fx-drawer',
        actionType: 'drag',
        badges: ['175 Effects', 'Audio Reactive'],
        markups: [
          { id: 'm2', shape: 'spotlight-rect', x: 70, y: 20, width: 25, height: 60, label: 'Forge FX Library', color: '#10b981' }
        ]
      },
      {
        stepNumber: 3,
        id: 'step-3-sam-rotoscope',
        title: 'AI Object Matte with Segment Anything (SAM)',
        instruction: 'Click on a subject in the preview monitor. SAM tracks and segments the object in real time without sending footage to any external cloud.',
        actionType: 'click',
        badges: ['On-Device AI', 'Depth Anything V2'],
        markups: [
          { id: 'm3', shape: 'spotlight-circle', x: 50, y: 40, width: 20, height: 25, label: 'Click to Rotoscope', color: '#a855f7' }
        ]
      }
    ]
  },

  'lighting-designer': {
    featureId: 'lighting-designer',
    featureName: 'Lighting Designer (LD) & Smart Fixture Sync',
    moduleName: 'LD Mode',
    category: 'Lighting',
    estimatedTime: '2 min',
    summary: 'Auto-discover Govee and Nanoleaf fixtures on your local Wi-Fi and synchronize real-world smart lights with on-screen visualizers.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-lan-scan',
        title: 'Zero-Friction Fixture Discovery',
        instruction: 'Open Lighting Designer from the primary navigation. The engine broadcasts local UDP packets to find all LAN-connected Govee, Nanoleaf, and Philips Hue lights.',
        targetSelector: '#ld-scan-fixtures-btn',
        actionType: 'click',
        badges: ['UDP Broadcast', 'Zero Setup'],
        markups: [
          { id: 'm1', shape: 'pulse-badge', x: 20, y: 15, label: 'Discovered Lights', color: '#eab308' },
          { id: 'm2', shape: 'arrow', x: 25, y: 22, arrowDirection: 'left', label: '1-Click Connect' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-stage-mapping',
        title: 'Stage Grid Drag & Drop',
        instruction: 'Drag your light fixtures onto the 2D stage canvas to match their physical location in your room (Left, Right, Ceiling, Backlight).',
        targetSelector: '#ld-stage-canvas',
        actionType: 'drag',
        badges: ['Spatial Layout', 'DMX Color Map'],
        markups: [
          { id: 'm3', shape: 'spotlight-rect', x: 30, y: 30, width: 40, height: 40, label: 'Stage Layout Canvas', color: '#06b6d4' }
        ]
      },
      {
        stepNumber: 3,
        id: 'step-3-visualizer-sync',
        title: 'Audio Reactivity & Razer Chroma Sync',
        instruction: 'Toggle "Follow Visualizer". Your physical lights will now strobe, pulse, and color-cycle in locked sync with Chora and Plajah Pixels visualizers.',
        targetSelector: '#ld-sync-toggle',
        actionType: 'click',
        badges: ['Razer Chroma SDK', 'Beat Reactor Sync'],
        markups: [
          { id: 'm4', shape: 'pulse-badge', x: 80, y: 20, label: 'Follow Visualizer', color: '#22c55e' }
        ]
      }
    ]
  },

  'business-pos-register': {
    featureId: 'business-pos-register',
    featureName: 'Plajah Business POS Register & In-Store Live',
    moduleName: 'Business / POS',
    category: 'Commerce',
    estimatedTime: '2 min',
    summary: 'Operate touchscreen retail checkout with cash drawer kicks, staff PIN clocks, customer loyalty recognition, and live in-store music broadcasting.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-pos-ring',
        title: 'Touchscreen Register & Barcode Scan',
        instruction: 'Tap product items or scan barcodes to add to the cart. Customer loyalty deals apply automatically when the customer presents their QR badge.',
        targetSelector: '#pos-product-grid',
        actionType: 'click',
        badges: ['Direct Stripe Connect', 'Offline Cache'],
        markups: [
          { id: 'm1', shape: 'spotlight-rect', x: 10, y: 25, width: 55, height: 65, label: 'Catalog Grid', color: '#10b981' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-receipt-drawer',
        title: 'Cash Sales & Thermal Receipt Printing',
        instruction: 'Tender cash or credit card. The hardware seam triggers the connected ESC-POS receipt printer and cash drawer kick via local USB/Ethernet.',
        targetSelector: '#pos-checkout-btn',
        actionType: 'click',
        badges: ['ESC-POS', 'QZ Tray Native'],
        markups: [
          { id: 'm2', shape: 'pulse-badge', x: 82, y: 80, label: 'Charge & Print', color: '#f59e0b' }
        ]
      },
      {
        stepNumber: 3,
        id: 'step-3-instore-live',
        title: 'Broadcast In-Store Audio to Walk-In Shoppers',
        instruction: 'Enable "In-Store Live". Nearby patrons auto-check in, view what song is playing in the shop, and can tip creators or order items from their phone.',
        targetSelector: '#store-live-toggle',
        actionType: 'click',
        badges: ['Geofence Check-in', 'Interactive Pulse'],
        markups: [
          { id: 'm3', shape: 'spotlight-rect', x: 70, y: 15, width: 25, height: 25, label: 'In-Store Live Hub', color: '#8b5cf6' }
        ]
      }
    ]
  },

  'terra-listing-film': {
    featureId: 'terra-listing-film',
    featureName: 'Terra: Detroit Civic Places & Listing Films',
    moduleName: 'Terra Explorer',
    category: 'Civic & Places',
    estimatedTime: '2 min',
    summary: 'Inspect Detroit zoning envelopes in 3D, view property passports, and turn smartphone video walkthroughs into automated room-by-room listing films.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-parcel-zoning',
        title: '3D Zoning Envelopes & OLR Records',
        instruction: 'Click any parcel in the Terra 3D map. The envelope engine renders permissible building volumes, setbacks, and verified property records.',
        targetSelector: '#terra-3d-map-viewport',
        actionType: 'inspect',
        badges: ['Detroit City GIS', 'OLR Standard'],
        markups: [
          { id: 'm1', shape: 'spotlight-rect', x: 20, y: 20, width: 60, height: 60, label: 'Interactive Parcel Map', color: '#38bdf8' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-listing-film',
        title: 'Automated Walkthrough to Listing Film',
        instruction: 'Upload a phone walkthrough video. The platform transcribes speech, identifies kitchen/living/bedroom scenes, and cuts an edited showcase video.',
        targetSelector: '#terra-film-upload',
        actionType: 'click',
        badges: ['Speech Transcription', 'Room Segmentation'],
        markups: [
          { id: 'm2', shape: 'pulse-badge', x: 45, y: 75, label: 'Generate Listing Film', color: '#ec4899' }
        ]
      }
    ]
  },

  'firstlight-3d-lab': {
    featureId: 'firstlight-3d-lab',
    featureName: 'Project Firstlight: 3D Passing Lab & Physics',
    moduleName: 'Firstlight Sports',
    category: 'Sports 3D',
    estimatedTime: '2 min',
    summary: 'Experience real-time football physics simulations, customize stadium aurora shaders, and aim passes with gyro motion controls.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-launch-lab',
        title: 'Launch 3D Passing Lab',
        instruction: 'Enter Project Firstlight from the Sports menu. Use touch or mouse drag to aim throw trajectory, velocity, and spiral spin.',
        targetSelector: '#firstlight-3d-canvas',
        actionType: 'drag',
        badges: ['WebGL 3D Physics', 'Aurora Shaders'],
        markups: [
          { id: 'm1', shape: 'spotlight-circle', x: 50, y: 50, width: 45, height: 45, label: 'Passing Field Viewport', color: '#10b981' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-stitch-menu',
        title: 'Customize Trajectory & Ball Dynamics',
        instruction: 'Open the Stitch floating menu to adjust wind vector, receiver route timing, and ball seam friction in real-time.',
        targetSelector: '#firstlight-stitch-menu',
        actionType: 'click',
        badges: ['Physics Sandbox', 'Custom Playbook'],
        markups: [
          { id: 'm2', shape: 'pulse-badge', x: 85, y: 35, label: 'Stitch Menu', color: '#f59e0b' }
        ]
      }
    ]
  },

  'academia-worksheets': {
    featureId: 'academia-worksheets',
    featureName: 'Plajah Museion: Interactive Lesson Worksheets',
    moduleName: 'Academia',
    category: 'Education',
    estimatedTime: '2 min',
    summary: 'Digitize paper assignments into interactive digital worksheets, assign to students with strict privacy, and enable instant AI step-by-step tutoring.',
    steps: [
      {
        stepNumber: 1,
        id: 'step-1-upload-sheet',
        title: 'Scan or Upload Paper Worksheet',
        instruction: 'Upload a PDF or photo of any worksheet. Tela Document Intelligence auto-detects question fields, answer blanks, and diagrams.',
        targetSelector: '#academia-worksheet-upload',
        actionType: 'click',
        badges: ['OCR & Vector Trace', 'Formula Detection'],
        markups: [
          { id: 'm1', shape: 'spotlight-rect', x: 30, y: 25, width: 40, height: 50, label: 'Digitized Worksheet', color: '#8b5cf6' }
        ]
      },
      {
        stepNumber: 2,
        id: 'step-2-interactive-tutor',
        title: 'Student Fill & Live AI Tutor Hints',
        instruction: 'Students fill in answers with text or digital pen ink. The built-in Aria tutor gives guided Socratic hints without giving away answers.',
        targetSelector: '#academia-tutor-sidebar',
        actionType: 'type',
        badges: ['Windows Ink Pen', 'Socratic Guidance'],
        markups: [
          { id: 'm2', shape: 'spotlight-rect', x: 75, y: 20, width: 22, height: 70, label: 'Aria Homework Tutor', color: '#06b6d4' }
        ]
      }
    ]
  }
};

export function getTutorialForFeature(featureId: string): FeatureTutorial | undefined {
  return TUTORIAL_REGISTRY[featureId];
}

export function listAllTutorials(): FeatureTutorial[] {
  return Object.values(TUTORIAL_REGISTRY);
}
