# Plajah Human Body Explorer
### A museum-quality interactive 3D tour of the human body

---

## What's Inside

```
human-body-explorer/
├── index.html                  ← Open this in a browser to run the app
├── css/
│   └── style.css               ← All museum-quality styling
├── js/
│   └── app.js                  ← Main app: SVG body, 3D viewer, UI, search
├── data/
│   ├── anatomy.js              ← Core organ data (17 major organs)
│   └── anatomy-extended.js     ← Extended data (ears, nose, esophagus,
│                                  gallbladder, trachea, diaphragm, bladder,
│                                  lymph nodes, pituitary, cerebellum,
│                                  uterus/ovaries, testes/prostate,
│                                  bone marrow, and more)
├── unity/
│   └── Scripts/
│       ├── BodyExplorer.cs     ← Unity: main controller (camera, orbit, input)
│       ├── OrganController.cs  ← Unity: per-organ hover/click/glow + OrganData SO
│       ├── SystemManager.cs    ← Unity: system isolation + fade transitions
│       └── UIManager.cs        ← Unity: all UI panels, tabs, medical mode, search
├── assets/
│   ├── models/                 ← Drop your .glb files here (see ASSETS_MANIFEST.md)
│   ├── textures/               ← PBR textures from ambientCG / Poly Haven
│   └── diagrams/               ← OpenStax CC-licensed anatomy diagrams
├── ASSETS_MANIFEST.md          ← Complete guide to free 3D asset sources
└── README.md                   ← This file
```

---

## Quick Start (Web Version — VS Code)

### 1. Open in VS Code
```bash
# Open the folder in VS Code
code human-body-explorer/
```

### 2. Run with Live Server
Install the **Live Server** extension (ritwickdey.liveserver), then:
- Right-click `index.html` → **Open with Live Server**
- Or press `Ctrl+Shift+P` → "Live Server: Open with Live Server"

The app opens at `http://127.0.0.1:5500`

### 3. Alternatively — run with Python
```bash
cd human-body-explorer
python -m http.server 8080
# Open http://localhost:8080
```

> **Important:** The app must be served over HTTP — double-clicking `index.html` directly will block the script modules. Use Live Server or Python.

---

## How to Use the Explorer

| Action | How |
|--------|-----|
| **Explore an organ** | Click any glowing dot on the body |
| **Filter by system** | Click a system in the left sidebar |
| **Toggle layers** | Use checkboxes (Skeletal, Circulatory, etc.) |
| **Medical Mode** | Toggle in the header — switches to clinical terminology |
| **Male / Female** | Toggle in header (shows sex-specific organs) |
| **Zoom** | Scroll wheel or pinch, or use +/− buttons |
| **Pan** | Click and drag the body |
| **3D viewer** | Click "View in 3D Viewer" after selecting an organ |
| **Search** | Type any organ name in the search bar |
| **Rotate 3D** | Click and drag in the 3D viewer |

---

## What's Covered — Organ & System Data

### 29 Organs & Structures (complete data for each):

| Organ | System | Sex |
|-------|--------|-----|
| Brain (Encephalon) | Nervous | Both |
| Heart (Cor) | Circulatory | Both |
| Lungs (Pulmones) | Respiratory | Both |
| Liver (Hepar) | Digestive | Both |
| Stomach (Gaster) | Digestive | Both |
| Kidneys (Renes) | Urinary | Both |
| Small Intestine | Digestive | Both |
| Large Intestine / Colon | Digestive | Both |
| Pancreas | Digestive + Endocrine | Both |
| Spleen (Splen) | Lymphatic | Both |
| Thyroid Gland | Endocrine | Both |
| Skin (Cutis) | Integumentary | Both |
| Eyes (Oculi) | Sensory | Both |
| Skeletal System | Skeletal | Both |
| Muscular System | Muscular | Both |
| Spinal Cord | Nervous | Both |
| Adrenal Glands | Endocrine | Both |
| Ears (Aures) | Sensory | Both |
| Nose & Sinuses | Respiratory | Both |
| Mouth, Tongue & Salivary Glands | Digestive | Both |
| Esophagus | Digestive | Both |
| Gallbladder | Digestive | Both |
| Trachea & Bronchi | Respiratory | Both |
| Diaphragm | Muscular | Both |
| Urinary Bladder | Urinary | Both |
| Lymph Nodes & Thymus | Lymphatic | Both |
| Pituitary Gland | Endocrine | Both |
| Cerebellum & Brainstem | Nervous | Both |
| Bone Marrow | Circulatory | Both |
| Uterus & Ovaries | Reproductive | Female |
| Testes & Prostate | Reproductive | Male |

### For every organ, data includes:
- **Description** (plain-language + medical/clinical)
- **Function** — what it does and why
- **Blood flow** — how blood reaches and leaves it
- **Bodily fluids** — secretions, lymph, CSF, etc.
- **Vitamins** — which vitamins it needs and exactly why
- **Minerals** — which minerals it needs and exactly why
- **Cell types** — every major cell type with detailed descriptions
- **Cellular processes** — what happens at the molecular/cellular level
- **Common conditions** — diseases and disorders affecting that organ
- **Interesting fact** — memorable fact for general audiences

---

## Integrating Real 3D Models

Currently the app uses procedural Three.js geometry. To upgrade to photorealistic models:

### Step 1 — Download free models
See `ASSETS_MANIFEST.md` for a complete list of free sources. Key ones:
- **BodyParts3D** — https://github.com/Kevin-Mattheus-Moerman/BodyParts3D (CC BY-SA)
- **Z-Anatomy** — https://www.z-anatomy.com (open source)
- **NIH 3D Print Exchange** — https://3d.nih.gov (CC/public domain)

### Step 2 — Convert to GLTF
1. Download **Blender** (free): https://www.blender.org
2. File → Import → STL (or OBJ)
3. File → Export → glTF 2.0 (.glb)
4. Place in `/assets/models/` (e.g., `heart.glb`, `brain.glb`)

### Step 3 — Update app.js
In `js/app.js`, the `open3DViewer()` function calls `buildOrganMesh()` which uses procedural geometry. Replace the loader section with:

```javascript
// Replace buildOrganMesh() call with:
const loader = new THREE.GLTFLoader();  // requires GLTFLoader addon
loader.load(
  `/assets/models/${organ.id}.glb`,
  (gltf) => {
    scene.add(gltf.scene);
    // ... animate
  },
  undefined,
  () => {
    // Fallback to procedural if model not found
    scene.add(buildOrganMesh(organ.id, color));
  }
);
```

---

## Unity WebGL Integration

The `unity/Scripts/` folder contains production-ready Unity C# scripts:

### Setup in Unity:
1. **Open Unity Hub** → Create new project (Unity 2022 LTS, 3D URP template)
2. Copy `unity/Scripts/*.cs` into `Assets/Scripts/Plajah/`
3. Import anatomy 3D models (from ASSETS_MANIFEST.md) into `Assets/Models/`
4. For each organ GameObject:
   - Add `OrganController` component
   - Create an `OrganData` ScriptableObject (Assets → Create → Plajah → OrganData)
   - Fill in the data fields matching the JS anatomy data
5. Add `BodyExplorer`, `SystemManager`, and `UIManager` to a root empty GameObject
6. Build → WebGL → Enable compression
7. Embed the WebGL build in your Plajah platform via `<iframe>` or React component

### Embedding in Plajah Platform (React):
```jsx
// PlajahBodyModule.jsx
import React from 'react';

export function BodyModule() {
  return (
    <iframe
      src="/body-explorer/index.html"   // or Unity WebGL build path
      title="Plajah Human Body Explorer"
      style={{ width: '100%', height: '100vh', border: 'none' }}
      allow="fullscreen"
    />
  );
}
```

### Sending messages from your platform into the explorer:
```javascript
// From your Plajah platform
const iframe = document.querySelector('#bodyExplorerFrame');

// Navigate to a specific organ
iframe.contentWindow.postMessage({ type: 'selectOrgan', organId: 'heart' }, '*');

// Toggle medical mode
iframe.contentWindow.postMessage({ type: 'setMedicalMode', value: true }, '*');

// Filter to a system
iframe.contentWindow.postMessage({ type: 'selectSystem', system: 'circulatory' }, '*');
```

Add this listener in `app.js` to handle incoming messages:
```javascript
window.addEventListener('message', (e) => {
  if (e.data.type === 'selectOrgan') selectOrgan(e.data.organId);
  if (e.data.type === 'setMedicalMode') { state.medicalMode = e.data.value; /* refresh */ }
  if (e.data.type === 'selectSystem') selectSystem(e.data.system);
});
```

---

## Adding More Organs

To add a new organ, append an entry to `data/anatomy-extended.js`:

```javascript
{
  id: "appendix",
  name: "Appendix",
  medicalName: "Appendix Vermiformis",
  system: "digestive",    // must match a key in BODY_SYSTEMS
  sex: "both",            // "both", "male", or "female"
  svgZone: "abdomen-lower",
  icon: "〰️",
  description: "...",
  medicalDescription: "...",
  function: "...",
  vitamins: [ { name: "...", role: "..." } ],
  minerals: [ { name: "...", role: "..." } ],
  cellTypes: [ { name: "...", description: "..." } ],
  bloodFlow: "...",
  fluidRole: "...",
  cellularProcess: "...",
  conditions: [ { name: "...", description: "..." } ],
  fact: "..."
}
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Web framework | Vanilla JS (ES6+, no build step needed) |
| 3D viewer | Three.js r128 (CDN) |
| 2D body map | Hand-crafted SVG with interactive hotspots |
| Styling | Custom CSS with CSS variables (no framework) |
| Fonts | Inter (Google Fonts) |
| Unity version | 2022 LTS + TextMeshPro + URP |
| Data format | Plain JS objects (window.ANATOMY array) |

---

## Credits & Asset Licensing

When deploying, include these attributions:

- **BodyParts3D** — © The Database Center for Life Science — CC BY-SA 2.1 Japan
- **Z-Anatomy** — LluisV — Open Source
- **OpenStax A&P 2e** — CC BY-NC-SA 4.0 — https://openstax.org
- **Three.js** — MIT License — https://threejs.org
- **Mixamo animations** — Adobe — Free for use

---

*Built for the Plajah Platform — Human Body Module*
*Version 1.0 — May 2026*
