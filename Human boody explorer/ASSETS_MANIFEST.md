# Plajah Human Body Explorer — Free Asset Manifest
> All assets listed here are free/open-source with CC or public-domain licenses.
> Download these to replace Three.js procedural geometry with high-quality real 3D models.

---

## 📦 3D MODEL SOURCES

### 1. BodyParts3D — PRIMARY RECOMMENDED SOURCE
- **License:** CC Attribution-Share Alike 2.1 Japan
- **Attribution:** "BodyParts3D, © The Database Center for Life Science licensed under CC BY-SA 2.1 Japan"
- **GitHub:** https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
- **Format:** OBJ files (convert to GLTF using Blender — free, open-source)
- **Coverage:** Complete human male anatomy — 200+ body parts

**Key files in the repo:**
```
/stl/heart.stl
/stl/brain.stl
/stl/liver.stl
/stl/lung_left.stl
/stl/lung_right.stl
/stl/kidney_left.stl
/stl/kidney_right.stl
/stl/stomach.stl
/stl/pancreas.stl
/stl/spleen.stl
/stl/thyroid.stl
/stl/skeleton/skull.stl
/stl/skeleton/spine_cervical.stl
...and 200+ more
```

**To convert STL → GLTF (for Three.js):**
1. Download Blender (free): https://www.blender.org
2. File → Import → STL
3. File → Export → glTF 2.0 (.glb)
4. Place .glb files in `/assets/models/`

---

### 2. Z-Anatomy — BEST INTERACTIVE REFERENCE
- **License:** Open Source (based on BodyParts3D + added structures)
- **Website:** https://www.z-anatomy.com
- **GitHub:** https://github.com/LluisV/Z-Anatomy
- **Format:** Blender project files + OBJ/FBX
- **Coverage:** 1,000+ anatomical structures, cleaned up and labeled
- **Special:** Includes muscle insertion/origin points, nerves, vessels

---

### 3. NIH 3D Print Exchange — MEDICAL GRADE
- **License:** CC (varies by model — check individual pages)
- **URL:** https://3d.nih.gov
- **Format:** STL, VRML, X3D (convert to GLTF via Blender)
- **Coverage:** Cells, organs, full body systems
- **Special:** Many derived from actual patient MRI/CT data

**Top anatomical categories to browse:**
- https://3d.nih.gov/entries?category=brain
- https://3d.nih.gov/entries?category=heart
- https://3d.nih.gov/entries?category=musculoskeletal

---

### 4. AnatomyTOOL — ACADEMIC OPEN SOURCE
- **License:** CC BY-SA (check individual models)
- **URL:** https://anatomytool.org/open3dmodel
- **Format:** OBJ + textures
- **Coverage:** Full human body, male + female, multiple ethnicities
- **Institutional:** Created by Leiden/Utrecht University Medical Centers

---

### 5. Sketchfab — FREE CC MODELS
*Filter by "Downloadable" and "CC Attribution"*

| Model | URL | License |
|-------|-----|---------|
| Human Skeleton (CT scan derived) | https://sketchfab.com/3d-models/human-skeleton-911b9df7e7834175b69b4840ea15e054 | CC BY |
| Human Organs (full set) | https://sketchfab.com/3d-models/human-organs-035316622877438cb62de673b8f19217 | CC Attribution |
| Human Anatomy (skeletal + muscular) | https://sketchfab.com/3d-models/human-anatomy-faf0f3eaec554bcf854be2038993024f | CC Attribution |
| Myology (muscles, Z-Anatomy) | https://sketchfab.com/3d-models/myology-31b40fd809b14665b93773936d67c52c | Open Source |
| Brain (detailed) | Search: "brain anatomy free" on sketchfab.com | Various CC |
| Heart anatomy | Search: "heart anatomy free" on sketchfab.com | Various CC |

---

### 6. GrabCAD Community Library
- **License:** Public domain / GrabCAD Terms
- **URL:** https://grabcad.com/library/human-anatomy-v3-male-life-sciences-japan-bodyparts3d-source-1
- **Format:** STEP, STL, OBJ
- **Coverage:** Complete male anatomy from BodyParts3D

---

### 7. embodi3D — MRI/CT Derived Models
- **License:** CC (varies)
- **URL:** https://www.embodi3d.com/free-3d-printed-human-anatomy-model-stl-files-for-medical-3d-printing/
- **Format:** STL (convert to GLTF)
- **Special:** Real patient scan data (anonymized), extremely anatomically accurate

---

## 🖼 TEXTURE & MATERIAL SOURCES

### Skin Textures (PBR-ready)
- **ambientCG.com** — https://ambientcg.com/list?category=Skin
  - License: CC0 (Public Domain)
  - Formats: PNG, EXR (Albedo, Normal, Roughness, AO maps)

### Muscle Tissue Textures
- **Poly Haven** — https://polyhaven.com/textures
  - License: CC0
  - Formats: 1K/2K/4K PNG + EXR
  - Search: "muscle", "organic", "tissue"

### Bone / Ivory Textures
- **FreePBR.com** — https://freepbr.com
  - License: Free for commercial use
  - Search: "bone", "ivory"

### Organ Reference Textures (Histology)
- **Wikimedia Commons — Histology** 
  - https://commons.wikimedia.org/wiki/Category:Histology
  - License: CC / Public Domain
  - Coverage: Microscopy images of every tissue type

---

## 📊 DIAGRAMS & ILLUSTRATIONS

### OpenStax Anatomy & Physiology 2e
- **License:** CC BY-NC-SA 4.0
- **URL:** https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction
- **Coverage:** 1,500+ detailed anatomical diagrams covering every body system
- **Formats:** PNG, SVG
- **Download:** All images available individually at AnatomyTOOL:
  https://anatomytool.org/content/openstax-book-anatomy-physiology

### Wikimedia Commons — Anatomical Illustrations
- **License:** CC / Public Domain
- **URL:** https://commons.wikimedia.org/wiki/Category:Anatomy
- **Coverage:** Thousands of historical and modern anatomical plates
- **Recommended searches:**
  - `Gray's Anatomy plates` — classic medical illustrations (public domain)
  - `Heart anatomy diagram`
  - `Brain anatomy diagram`

### National Cancer Institute (NCI) Visuals Online
- **License:** Public Domain (US Government)
- **URL:** https://visualsonline.cancer.gov
- **Coverage:** Medical-quality illustrations of organs, cells, and systems

### BioRender (Free Tier)
- **URL:** https://www.biorender.com
- **Coverage:** Modern flat-design medical illustrations
- **Note:** Free tier with attribution; paid for commercial use

---

## 🎬 IK ANIMATIONS & RIGS

### Mixamo (Free with Adobe ID)
- **URL:** https://www.mixamo.com
- **License:** Free for commercial and non-commercial use
- **Formats:** FBX, COLLADA
- **Coverage:** 2,000+ motion-captured animations
- **For anatomy use:**
  - Breathing animations
  - Walking/running cycles (for muscular system demos)
  - Heartbeat (use as base for cardiac rhythm animation)

**Converting Mixamo FBX → Three.js:**
1. Download FBX from Mixamo
2. Open Blender → Import FBX
3. Export → GLTF 2.0 with animations
4. Load in Three.js: `THREE.GLTFLoader` + `THREE.AnimationMixer`

### Three.js GLTFLoader with Animations
```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer } from 'three';

const loader = new GLTFLoader();
loader.load('/assets/models/heart.glb', (gltf) => {
  scene.add(gltf.scene);
  const mixer = new AnimationMixer(gltf.scene);
  gltf.animations.forEach(clip => mixer.clipAction(clip).play());
});
```

---

## 🗂 RECOMMENDED FILE STRUCTURE

Place downloaded and converted assets in the `/assets/` folder:

```
human-body-explorer/
├── assets/
│   ├── models/
│   │   ├── brain.glb
│   │   ├── heart.glb          ← animate with Mixamo breathing rig
│   │   ├── lungs.glb
│   │   ├── liver.glb
│   │   ├── stomach.glb
│   │   ├── kidneys.glb
│   │   ├── pancreas.glb
│   │   ├── spleen.glb
│   │   ├── thyroid.glb
│   │   ├── skeleton_full.glb  ← from Z-Anatomy
│   │   ├── muscles_full.glb   ← from Z-Anatomy Myology
│   │   └── ...
│   ├── textures/
│   │   ├── skin_albedo.png
│   │   ├── skin_normal.png
│   │   ├── muscle_albedo.png
│   │   ├── bone_albedo.png
│   │   └── ...
│   └── diagrams/
│       ├── nervous_system.svg  ← from OpenStax
│       ├── circulatory.svg
│       ├── digestive.svg
│       └── ...
```

---

## 🔄 INTEGRATING REAL 3D MODELS

Replace the `buildOrganMesh()` function in `js/app.js` with a GLTFLoader:

```javascript
// In app.js — replace procedural geometry with real models:
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/assets/draco/');
loader.setDRACOLoader(dracoLoader);

function loadOrganModel(organId, onLoad) {
  loader.load(
    `/assets/models/${organId}.glb`,
    (gltf) => onLoad(gltf.scene),
    undefined,
    (err) => {
      console.warn(`No model for ${organId}, using procedural fallback`);
      onLoad(buildOrganMesh(organId, color)); // fallback to geometry
    }
  );
}
```

---

## 📋 ATTRIBUTION TEMPLATE

For your platform's credits page:

```
3D Anatomy Models:
  • BodyParts3D, © The Database Center for Life Science
    Licensed under CC BY-SA 2.1 Japan
    https://github.com/Kevin-Mattheus-Moerman/BodyParts3D

  • Z-Anatomy by LluisV
    Open Source — https://www.z-anatomy.com

Anatomical Diagrams:
  • OpenStax Anatomy & Physiology 2e
    Licensed under CC BY-NC-SA 4.0
    https://openstax.org

Textures:
  • ambientCG — CC0 Public Domain — https://ambientcg.com
  • Poly Haven — CC0 Public Domain — https://polyhaven.com

Animations:
  • Mixamo by Adobe — Free for use — https://www.mixamo.com
```

---

*Manifest compiled for Plajah Human Body Explorer — May 2026*
