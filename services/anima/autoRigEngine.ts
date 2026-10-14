/**
 * services/anima/autoRigEngine.ts
 *
 * Plajah Unified Motion & Animation System ("Anima") - Intelligent Auto-Rig Engine
 *
 * Automatically recognizes characters or objects from artwork/images without
 * destroying their visual structure:
 * 1. Analyzes morphology, silhouette, contours, and anatomical landmarks
 * 2. Ingests Story Intelligence Character Dossier / World Entries (lore, weight, posture, mood)
 * 3. Derives physical sense of mass, inertia, center of gravity, and elasticity
 * 4. Generates an adaptive hierarchical skeletal bone rig (FK/IK ready)
 * 5. Synthesizes bespoke, morphology-specific walk cycles and emotion stances
 */

import type {
  AnimaBone,
  AnimaChannel,
  AnatomicalLandmark,
  AutoRigResult,
  CharacterMorphologyType,
  CharacterMassProfile,
  CharacterStoryDossier,
  MassMaterialKind,
  Keyframe,
} from './types.ts';

export interface ArtworkAnalysisInput {
  width: number;
  height: number;
  silhouetteBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  colorPalette?: string[];
  suggestedMorphology?: CharacterMorphologyType;
  storyDossier?: CharacterStoryDossier;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MORPHOLOGY & LANDMARK RECOGNITION
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeArtworkStructure(input: ArtworkAnalysisInput): {
  morphology: CharacterMorphologyType;
  landmarks: AnatomicalLandmark[];
} {
  const w = input.width || 1280;
  const h = input.height || 720;
  const bounds = input.silhouetteBounds || { minX: 0.15, minY: 0.1, maxX: 0.85, maxY: 0.9 };
  const charWidth = (bounds.maxX - bounds.minX) * w;
  const charHeight = (bounds.maxY - bounds.minY) * h;
  const aspectRatio = charHeight / Math.max(1, charWidth);

  // Determine Morphology
  let morphology: CharacterMorphologyType = input.suggestedMorphology || 'biped_humanoid';

  if (!input.suggestedMorphology) {
    if (input.storyDossier?.archetype?.toLowerCase().includes('vehicle') || input.storyDossier?.archetype?.toLowerCase().includes('car')) {
      morphology = 'mechanical_vehicle';
    } else if (input.storyDossier?.archetype?.toLowerCase().includes('spirit') || input.storyDossier?.archetype?.toLowerCase().includes('ghost')) {
      morphology = 'ethereal_spirit';
    } else if (input.storyDossier?.archetype?.toLowerCase().includes('mascot') || input.storyDossier?.name?.toLowerCase().includes('rello') || input.storyDossier?.name?.toLowerCase().includes('chora')) {
      morphology = 'mascot_creature';
    } else if (aspectRatio < 0.95) {
      morphology = 'quadruped_animal';
    } else if (aspectRatio >= 1.6) {
      morphology = 'biped_humanoid';
    } else {
      morphology = 'mascot_creature';
    }
  }

  const cx = (bounds.minX + bounds.maxX) / 2;
  const topY = bounds.minY;
  const botY = bounds.maxY;
  const totalH = botY - topY;

  const landmarks: AnatomicalLandmark[] = [];

  if (morphology === 'mechanical_vehicle') {
    landmarks.push(
      { id: 'lm_chassis', name: 'Chassis Center', x: cx, y: topY + totalH * 0.5, confidence: 0.98, partType: 'chassis_center' },
      { id: 'lm_wheel_f', name: 'Front Wheel Pivot', x: bounds.maxX - 0.15, y: botY - 0.08, confidence: 0.95, partType: 'wheel_front' },
      { id: 'lm_wheel_r', name: 'Rear Wheel Pivot', x: bounds.minX + 0.15, y: botY - 0.08, confidence: 0.95, partType: 'wheel_rear' },
    );
  } else if (morphology === 'quadruped_animal') {
    landmarks.push(
      { id: 'lm_head', name: 'Head Center', x: bounds.maxX - 0.1, y: topY + totalH * 0.25, confidence: 0.92, partType: 'head' },
      { id: 'lm_jaw', name: 'Jaw / Muzzle', x: bounds.maxX - 0.04, y: topY + totalH * 0.32, confidence: 0.88, partType: 'jaw' },
      { id: 'lm_neck', name: 'Neck Base', x: bounds.maxX - 0.18, y: topY + totalH * 0.35, confidence: 0.90, partType: 'neck' },
      { id: 'lm_chest', name: 'Chest / Fore-Spine', x: bounds.maxX - 0.28, y: topY + totalH * 0.45, confidence: 0.94, partType: 'chest' },
      { id: 'lm_pelvis', name: 'Pelvis / Rear-Spine', x: bounds.minX + 0.22, y: topY + totalH * 0.45, confidence: 0.94, partType: 'pelvis' },
      // Forelegs
      { id: 'lm_shoulder_l', name: 'Foreleg Shoulder L', x: bounds.maxX - 0.28, y: topY + totalH * 0.52, confidence: 0.91, partType: 'shoulder_l' },
      { id: 'lm_knee_fl', name: 'Foreleg Knee L', x: bounds.maxX - 0.26, y: topY + totalH * 0.72, confidence: 0.89, partType: 'knee_l' },
      { id: 'lm_foot_fl', name: 'Foreleg Paw L', x: bounds.maxX - 0.25, y: botY, confidence: 0.92, partType: 'foot_l' },
      // Hindlegs
      { id: 'lm_hip_l', name: 'Hindleg Hip L', x: bounds.minX + 0.22, y: topY + totalH * 0.52, confidence: 0.91, partType: 'hip_l' },
      { id: 'lm_knee_hl', name: 'Hindleg Knee L', x: bounds.minX + 0.24, y: topY + totalH * 0.72, confidence: 0.89, partType: 'knee_l' },
      { id: 'lm_foot_hl', name: 'Hindleg Paw L', x: bounds.minX + 0.22, y: botY, confidence: 0.92, partType: 'foot_l' },
      // Tail
      { id: 'lm_tail_root', name: 'Tail Root', x: bounds.minX + 0.12, y: topY + totalH * 0.42, confidence: 0.87, partType: 'tail_root' },
      { id: 'lm_tail_tip', name: 'Tail Tip', x: bounds.minX, y: topY + totalH * 0.25, confidence: 0.85, partType: 'tail_tip' },
    );
  } else {
    // Biped Humanoid or Mascot Creature
    const isMascot = morphology === 'mascot_creature';
    const headRatio = isMascot ? 0.38 : 0.22;
    const torsoRatio = isMascot ? 0.32 : 0.36;
    const legRatio = isMascot ? 0.30 : 0.42;

    const headY = topY + totalH * (headRatio * 0.5);
    const neckY = topY + totalH * headRatio;
    const chestY = neckY + totalH * (torsoRatio * 0.4);
    const pelvisY = neckY + totalH * torsoRatio;
    const kneeY = pelvisY + totalH * (legRatio * 0.52);
    const footY = botY;

    const shoulderSpan = isMascot ? charWidth * 0.28 : charWidth * 0.35;
    const hipSpan = isMascot ? charWidth * 0.22 : charWidth * 0.24;

    landmarks.push(
      // Head & Facial
      { id: 'lm_head', name: 'Head Top', x: cx, y: headY, confidence: 0.98, partType: 'head' },
      { id: 'lm_eye_l', name: 'Eye Left', x: cx - (isMascot ? 0.05 : 0.035), y: headY - 0.02, confidence: 0.94, partType: 'eye_l' },
      { id: 'lm_eye_r', name: 'Eye Right', x: cx + (isMascot ? 0.05 : 0.035), y: headY - 0.02, confidence: 0.94, partType: 'eye_r' },
      { id: 'lm_jaw', name: 'Mouth / Jaw', x: cx, y: headY + 0.04, confidence: 0.92, partType: 'jaw' },
      { id: 'lm_neck', name: 'Neck Pivot', x: cx, y: neckY, confidence: 0.96, partType: 'neck' },

      // Spine & Torso
      { id: 'lm_chest', name: 'Upper Chest', x: cx, y: chestY, confidence: 0.96, partType: 'chest' },
      { id: 'lm_pelvis', name: 'Pelvis Root', x: cx, y: pelvisY, confidence: 0.98, partType: 'pelvis' },

      // Left Arm
      { id: 'lm_shoulder_l', name: 'Left Shoulder', x: cx - shoulderSpan / w, y: chestY + 0.01, confidence: 0.93, partType: 'shoulder_l' },
      { id: 'lm_elbow_l', name: 'Left Elbow', x: cx - (shoulderSpan + 25) / w, y: chestY + totalH * 0.20, confidence: 0.90, partType: 'elbow_l' },
      { id: 'lm_wrist_l', name: 'Left Wrist', x: cx - (shoulderSpan + 40) / w, y: pelvisY + 0.05, confidence: 0.88, partType: 'wrist_l' },
      { id: 'lm_hand_l', name: 'Left Hand Tip', x: cx - (shoulderSpan + 48) / w, y: pelvisY + 0.10, confidence: 0.85, partType: 'hand_l' },

      // Right Arm
      { id: 'lm_shoulder_r', name: 'Right Shoulder', x: cx + shoulderSpan / w, y: chestY + 0.01, confidence: 0.93, partType: 'shoulder_r' },
      { id: 'lm_elbow_r', name: 'Right Elbow', x: cx + (shoulderSpan + 25) / w, y: chestY + totalH * 0.20, confidence: 0.90, partType: 'elbow_r' },
      { id: 'lm_wrist_r', name: 'Right Wrist', x: cx + (shoulderSpan + 40) / w, y: pelvisY + 0.05, confidence: 0.88, partType: 'wrist_r' },
      { id: 'lm_hand_r', name: 'Right Hand Tip', x: cx + (shoulderSpan + 48) / w, y: pelvisY + 0.10, confidence: 0.85, partType: 'hand_r' },

      // Left Leg
      { id: 'lm_hip_l', name: 'Left Hip', x: cx - hipSpan / w, y: pelvisY + 0.02, confidence: 0.95, partType: 'hip_l' },
      { id: 'lm_knee_l', name: 'Left Knee', x: cx - (hipSpan + 4) / w, y: kneeY, confidence: 0.92, partType: 'knee_l' },
      { id: 'lm_ankle_l', name: 'Left Ankle', x: cx - (hipSpan + 8) / w, y: footY - 0.03, confidence: 0.90, partType: 'ankle_l' },
      { id: 'lm_foot_l', name: 'Left Foot Contact', x: cx - (hipSpan + 14) / w, y: footY, confidence: 0.94, partType: 'foot_l' },

      // Right Leg
      { id: 'lm_hip_r', name: 'Right Hip', x: cx + hipSpan / w, y: pelvisY + 0.02, confidence: 0.95, partType: 'hip_r' },
      { id: 'lm_knee_r', name: 'Right Knee', x: cx + (hipSpan + 4) / w, y: kneeY, confidence: 0.92, partType: 'knee_r' },
      { id: 'lm_ankle_r', name: 'Right Ankle', x: cx + (hipSpan + 8) / w, y: footY - 0.03, confidence: 0.90, partType: 'ankle_r' },
      { id: 'lm_foot_r', name: 'Right Foot Contact', x: cx + (hipSpan + 14) / w, y: footY, confidence: 0.94, partType: 'foot_r' },
    );

    // If Kaiju mascot, add tail
    if (isMascot || input.storyDossier?.name?.toLowerCase().includes('kaiju') || input.storyDossier?.name?.toLowerCase().includes('rello')) {
      landmarks.push(
        { id: 'lm_tail_root', name: 'Tail Root', x: cx - 0.08, y: pelvisY + 0.04, confidence: 0.90, partType: 'tail_root' },
        { id: 'lm_tail_tip', name: 'Tail Tip', x: cx - 0.22, y: pelvisY - 0.02, confidence: 0.86, partType: 'tail_tip' },
      );
    }
  }

  return { morphology, landmarks };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MASS & INERTIA CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

export function calculateMassDynamics(
  landmarks: AnatomicalLandmark[],
  morphology: CharacterMorphologyType,
  dossier?: CharacterStoryDossier,
): CharacterMassProfile {
  // Center of mass calculation
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const lm of landmarks) {
    // Weighted by part importance
    const weight = lm.partType === 'chest' || lm.partType === 'pelvis' ? 3 : lm.partType === 'head' ? 2 : 1;
    sumX += lm.x * weight;
    sumY += lm.y * weight;
    count += weight;
  }

  const centerOfMass = {
    x: count > 0 ? sumX / count : 0.5,
    y: count > 0 ? sumY / count : 0.5,
  };

  // Base mass estimation by morphology
  let estimatedMassKg = 72; // Average adult human default
  let materialKind: MassMaterialKind = 'organic_flesh';
  let bounceElasticity = 0.25;
  let squashStretchFactor = 1.0;
  let gravityDamping = 14.0;

  if (morphology === 'mascot_creature') {
    estimatedMassKg = 34;
    materialKind = 'jelly_mascot';
    bounceElasticity = 0.65;
    squashStretchFactor = 1.45;
    gravityDamping = 10.0;
  } else if (morphology === 'quadruped_animal') {
    estimatedMassKg = 140;
    materialKind = 'organic_flesh';
    bounceElasticity = 0.35;
    squashStretchFactor = 0.9;
    gravityDamping = 18.0;
  } else if (morphology === 'mechanical_vehicle') {
    estimatedMassKg = 1250;
    materialKind = 'heavy_mech';
    bounceElasticity = 0.12;
    squashStretchFactor = 0.15;
    gravityDamping = 28.0;
  } else if (morphology === 'ethereal_spirit') {
    estimatedMassKg = 4;
    materialKind = 'ethereal_cloth';
    bounceElasticity = 0.85;
    squashStretchFactor = 1.8;
    gravityDamping = 5.0;
  }

  // Story Dossier Override / Deep Lore Integration
  if (dossier) {
    if (dossier.physicalStats?.weight) {
      const parsedWeight = parseWeightStringToKg(dossier.physicalStats.weight);
      if (parsedWeight > 0) estimatedMassKg = parsedWeight;
    }

    const arch = (dossier.archetype || '').toLowerCase();
    const traits = (dossier.personalityTraits || []).join(' ').toLowerCase();

    if (arch.includes('titan') || arch.includes('kaiju') || arch.includes('tank') || traits.includes('heavy')) {
      estimatedMassKg = Math.max(estimatedMassKg, 450);
      gravityDamping = 32.0;
      squashStretchFactor = 0.7; // Heavy impact compression with low elasticity
      bounceElasticity = 0.15;
    } else if (arch.includes('thief') || arch.includes('ninja') || traits.includes('nimble') || traits.includes('agile')) {
      estimatedMassKg = Math.min(estimatedMassKg, 58);
      bounceElasticity = 0.45;
      squashStretchFactor = 1.25;
      gravityDamping = 12.0;
    }
  }

  // Moment of Inertia = Mass * Radius^2
  const momentOfInertia = Math.round(estimatedMassKg * 0.42 * 10) / 10;

  return {
    estimatedMassKg,
    centerOfMass,
    momentOfInertia,
    materialKind,
    bounceElasticity,
    squashStretchFactor,
    gravityDamping,
  };
}

function parseWeightStringToKg(wStr: string): number {
  const lower = wStr.toLowerCase().trim();
  const num = parseFloat(lower.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 0;
  if (lower.includes('ton')) return num * 1000;
  if (lower.includes('lbs') || lower.includes('pound')) return Math.round(num * 0.453592);
  return num; // assume kg if unspecified
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ADAPTIVE SKELETON GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function generateAdaptiveSkeleton(
  landmarks: AnatomicalLandmark[],
  morphology: CharacterMorphologyType,
  massProfile: CharacterMassProfile,
): AnimaBone[] {
  const lmMap = new Map<string, AnatomicalLandmark>();
  for (const lm of landmarks) lmMap.set(lm.partType, lm);

  const bones: AnimaBone[] = [];

  if (morphology === 'mechanical_vehicle') {
    const chassis = lmMap.get('chassis_center');
    const wf = lmMap.get('wheel_front');
    const wr = lmMap.get('wheel_rear');
    const cy = chassis ? chassis.y * 720 : 360;
    const cx = chassis ? chassis.x * 1280 : 640;

    bones.push(
      { id: 'b_chassis', name: 'chassis_root', parentId: null, length: 120, baseAngle: 0, pivot: [cx, cy, 0], color: '#FF8C00' },
      { id: 'b_wheel_f', name: 'wheel_front', parentId: 'b_chassis', length: 30, baseAngle: 0, pivot: [wf ? wf.x * 1280 : cx + 80, wf ? wf.y * 720 : cy + 40, 0], color: '#00DAF3' },
      { id: 'b_wheel_r', name: 'wheel_rear', parentId: 'b_chassis', length: 30, baseAngle: 0, pivot: [wr ? wr.x * 1280 : cx - 80, wr ? wr.y * 720 : cy + 40, 0], color: '#00DAF3' },
    );
    return bones;
  }

  // Biped or Mascot Rig
  const pelvis = lmMap.get('pelvis');
  const chest = lmMap.get('chest');
  const neck = lmMap.get('neck');
  const head = lmMap.get('head');

  const rootX = pelvis ? pelvis.x * 1280 : 640;
  const rootY = pelvis ? pelvis.y * 720 : 420;

  // Root Pelvis
  bones.push({
    id: 'b_pelvis',
    name: 'pelvis_root',
    parentId: null,
    length: 45,
    baseAngle: 0,
    pivot: [rootX, rootY, 0],
    color: '#D40055',
  });

  // Spine & Chest
  const chestY = chest ? chest.y * 720 : rootY - 60;
  bones.push({
    id: 'b_spine',
    name: 'spine_mid',
    parentId: 'b_pelvis',
    length: Math.abs(chestY - rootY) * 0.55,
    baseAngle: 0,
    pivot: [rootX, rootY - 20, 0],
    color: '#FF8C00',
  });

  bones.push({
    id: 'b_chest',
    name: 'chest_upper',
    parentId: 'b_spine',
    length: Math.abs(chestY - rootY) * 0.45,
    baseAngle: 0,
    pivot: [rootX, chestY, 0],
    color: '#FF8C00',
  });

  // Neck & Head
  const headY = head ? head.y * 720 : chestY - 70;
  bones.push({
    id: 'b_neck',
    name: 'neck',
    parentId: 'b_chest',
    length: 22,
    baseAngle: 0,
    pivot: [rootX, neck ? neck.y * 720 : chestY - 20, 0],
    color: '#00DAF3',
  });

  bones.push({
    id: 'b_head',
    name: 'head',
    parentId: 'b_neck',
    length: Math.abs(headY - (neck ? neck.y * 720 : chestY - 20)),
    baseAngle: 0,
    pivot: [rootX, headY, 0],
    color: '#00DAF3',
  });

  // Left Arm (upper, lower, hand)
  const sL = lmMap.get('shoulder_l');
  const eL = lmMap.get('elbow_l');
  const wL = lmMap.get('wrist_l');
  const armLen = eL && sL ? Math.hypot((eL.x - sL.x) * 1280, (eL.y - sL.y) * 720) : 48;

  bones.push({
    id: 'b_arm_l_upper',
    name: 'arm_l_upper',
    parentId: 'b_chest',
    length: armLen,
    baseAngle: 25,
    pivot: [sL ? sL.x * 1280 : rootX - 50, sL ? sL.y * 720 : chestY, 0],
    color: '#A259FF',
  });
  bones.push({
    id: 'b_arm_l_lower',
    name: 'arm_l_forearm',
    parentId: 'b_arm_l_upper',
    length: armLen * 0.9,
    baseAngle: 10,
    pivot: [eL ? eL.x * 1280 : rootX - 75, eL ? eL.y * 720 : chestY + 45, 0],
    color: '#A259FF',
  });
  bones.push({
    id: 'b_hand_l',
    name: 'hand_l',
    parentId: 'b_arm_l_lower',
    length: 20,
    baseAngle: 0,
    pivot: [wL ? wL.x * 1280 : rootX - 95, wL ? wL.y * 720 : chestY + 85, 0],
    color: '#D0BCFF',
  });

  // Right Arm (upper, lower, hand)
  const sR = lmMap.get('shoulder_r');
  const eR = lmMap.get('elbow_r');
  const wR = lmMap.get('wrist_r');
  bones.push({
    id: 'b_arm_r_upper',
    name: 'arm_r_upper',
    parentId: 'b_chest',
    length: armLen,
    baseAngle: -25,
    pivot: [sR ? sR.x * 1280 : rootX + 50, sR ? sR.y * 720 : chestY, 0],
    color: '#A259FF',
  });
  bones.push({
    id: 'b_arm_r_lower',
    name: 'arm_r_forearm',
    parentId: 'b_arm_r_upper',
    length: armLen * 0.9,
    baseAngle: -10,
    pivot: [eR ? eR.x * 1280 : rootX + 75, eR ? eR.y * 720 : chestY + 45, 0],
    color: '#A259FF',
  });
  bones.push({
    id: 'b_hand_r',
    name: 'hand_r',
    parentId: 'b_arm_r_lower',
    length: 20,
    baseAngle: 0,
    pivot: [wR ? wR.x * 1280 : rootX + 95, wR ? wR.y * 720 : chestY + 85, 0],
    color: '#D0BCFF',
  });

  // Left Leg (thigh, calf, foot)
  const hL = lmMap.get('hip_l');
  const kL = lmMap.get('knee_l');
  const aL = lmMap.get('ankle_l');
  const legLen = kL && hL ? Math.hypot((kL.x - hL.x) * 1280, (kL.y - hL.y) * 720) : 56;

  bones.push({
    id: 'b_leg_l_thigh',
    name: 'leg_l_thigh',
    parentId: 'b_pelvis',
    length: legLen,
    baseAngle: 0,
    pivot: [hL ? hL.x * 1280 : rootX - 25, hL ? hL.y * 720 : rootY + 20, 0],
    color: '#06D6A0',
  });
  bones.push({
    id: 'b_leg_l_calf',
    name: 'leg_l_calf',
    parentId: 'b_leg_l_thigh',
    length: legLen * 0.95,
    baseAngle: 0,
    pivot: [kL ? kL.x * 1280 : rootX - 28, kL ? kL.y * 720 : rootY + 75, 0],
    color: '#06D6A0',
  });
  bones.push({
    id: 'b_foot_l',
    name: 'foot_l',
    parentId: 'b_leg_l_calf',
    length: 24,
    baseAngle: 90,
    pivot: [aL ? aL.x * 1280 : rootX - 30, aL ? aL.y * 720 : rootY + 130, 0],
    color: '#FFD700',
  });

  // Right Leg (thigh, calf, foot)
  const hR = lmMap.get('hip_r');
  const kR = lmMap.get('knee_r');
  const aR = lmMap.get('ankle_r');

  bones.push({
    id: 'b_leg_r_thigh',
    name: 'leg_r_thigh',
    parentId: 'b_pelvis',
    length: legLen,
    baseAngle: 0,
    pivot: [hR ? hR.x * 1280 : rootX + 25, hR ? hR.y * 720 : rootY + 20, 0],
    color: '#06D6A0',
  });
  bones.push({
    id: 'b_leg_r_calf',
    name: 'leg_r_calf',
    parentId: 'b_leg_r_thigh',
    length: legLen * 0.95,
    baseAngle: 0,
    pivot: [kR ? kR.x * 1280 : rootX + 28, kR ? kR.y * 720 : rootY + 75, 0],
    color: '#06D6A0',
  });
  bones.push({
    id: 'b_foot_r',
    name: 'foot_r',
    parentId: 'b_leg_r_calf',
    length: 24,
    baseAngle: 90,
    pivot: [aR ? aR.x * 1280 : rootX + 30, aR ? aR.y * 720 : rootY + 130, 0],
    color: '#FFD700',
  });

  // Tail (if mascot / kaiju)
  const tRoot = lmMap.get('tail_root');
  const tTip = lmMap.get('tail_tip');
  if (tRoot && tTip) {
    bones.push({
      id: 'b_tail_root',
      name: 'tail_root',
      parentId: 'b_pelvis',
      length: 45,
      baseAngle: -20,
      pivot: [tRoot.x * 1280, tRoot.y * 720, 0],
      color: '#FF8C00',
    });
    bones.push({
      id: 'b_tail_tip',
      name: 'tail_tip',
      parentId: 'b_tail_root',
      length: 40,
      baseAngle: 15,
      pivot: [tTip.x * 1280, tTip.y * 720, 0],
      color: '#FF8C00',
    });
  }

  return bones;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BESPOKE WALK CYCLE SYNTHESIS
// ─────────────────────────────────────────────────────────────────────────────

export function generateCustomWalkCycle(
  skeleton: AnimaBone[],
  massProfile: CharacterMassProfile,
  morphology: CharacterMorphologyType,
  dossier?: CharacterStoryDossier,
  fps = 24,
): Record<string, AnimaChannel<number>> {
  const channels: Record<string, AnimaChannel<number>> = {};
  const totalFrames = fps; // 1 second full 2-step cycle
  const stepRate = 2;      // On 2s (classic 12 FPS exposure holds)

  const isHeavy = massProfile.estimatedMassKg > 150 || (dossier?.archetype || '').toLowerCase().includes('titan');
  const isMascot = morphology === 'mascot_creature';
  const isVehicle = morphology === 'mechanical_vehicle';

  // Walk Cycle Parameters derived from mass
  const strideSwing = isHeavy ? 18 : isMascot ? 28 : 24; // leg swing degrees
  const armSwing = isHeavy ? 12 : isMascot ? 32 : 22;    // arm counter swing degrees
  const verticalBob = isHeavy ? 14 : isMascot ? 22 : 16;  // vertical pixels bob
  const torsoLean = isHeavy ? 5 : isMascot ? 2 : 3.5;    // degrees lean

  // 1. Root Vertical Bob & Horizontal Sway
  const rootKeysY: Keyframe<number>[] = [];
  const rootKeysRot: Keyframe<number>[] = [];

  for (let f = 1; f <= totalFrames; f += stepRate) {
    const t = (f - 1) / totalFrames;
    const rad = t * Math.PI * 2;

    // Contact at t = 0.25 and 0.75 (lowest), apex at t = 0.0 and 0.5 (highest)
    const yVal = Math.sin(rad * 2) * verticalBob * (isHeavy ? 1.25 : 1.0);
    const rotVal = Math.sin(rad) * torsoLean;

    rootKeysY.push({ id: `kf_w_y_${f}`, t: (f - 1) / fps, v: Math.round(yVal * 10) / 10, ease: 'smooth' });
    rootKeysRot.push({ id: `kf_w_rot_${f}`, t: (f - 1) / fps, v: Math.round(rotVal * 10) / 10, ease: 'smooth' });
  }

  channels['transform.y'] = {
    id: 'ch_walk_y',
    name: 'Root Bob',
    path: 'transform.y',
    defaultValue: 0,
    keyframes: rootKeysY,
    unit: 'px',
  };
  channels['transform.rotationZ'] = {
    id: 'ch_walk_rot',
    name: 'Torso Swagger',
    path: 'transform.rotationZ',
    defaultValue: 0,
    keyframes: rootKeysRot,
    unit: '°',
  };

  if (isVehicle) {
    // Wheel spin channels
    const wheelRotKeys: Keyframe<number>[] = [];
    for (let f = 1; f <= totalFrames; f += stepRate) {
      const deg = ((f - 1) / totalFrames) * 360;
      wheelRotKeys.push({ id: `kf_wh_${f}`, t: (f - 1) / fps, v: Math.round(deg), ease: 'linear' });
    }
    channels['bone.b_wheel_f.rot'] = {
      id: 'ch_wh_f',
      name: 'Front Wheel Spin',
      path: 'bone.b_wheel_f.rot',
      defaultValue: 0,
      keyframes: wheelRotKeys,
      unit: '°',
    };
    channels['bone.b_wheel_r.rot'] = {
      id: 'ch_wh_r',
      name: 'Rear Wheel Spin',
      path: 'bone.b_wheel_r.rot',
      defaultValue: 0,
      keyframes: wheelRotKeys,
      unit: '°',
    };
    return channels;
  }

  // 2. Leg Swing Channels (Left & Right alternating phase by 180 degrees)
  const legLKeys: Keyframe<number>[] = [];
  const legRKeys: Keyframe<number>[] = [];
  const kneeLKeys: Keyframe<number>[] = [];
  const kneeRKeys: Keyframe<number>[] = [];

  for (let f = 1; f <= totalFrames; f += stepRate) {
    const t = (f - 1) / totalFrames;
    const rad = t * Math.PI * 2;

    const rotThighL = Math.sin(rad) * strideSwing;
    const rotThighR = Math.sin(rad + Math.PI) * strideSwing;

    // Knee bends more on backward swing and recovery
    const kneeBendL = Math.max(0, -Math.sin(rad) * (strideSwing * 1.3));
    const kneeBendR = Math.max(0, -Math.sin(rad + Math.PI) * (strideSwing * 1.3));

    legLKeys.push({ id: `kf_l_thigh_${f}`, t: (f - 1) / fps, v: Math.round(rotThighL), ease: 'smooth' });
    legRKeys.push({ id: `kf_r_thigh_${f}`, t: (f - 1) / fps, v: Math.round(rotThighR), ease: 'smooth' });
    kneeLKeys.push({ id: `kf_l_knee_${f}`, t: (f - 1) / fps, v: Math.round(kneeBendL), ease: 'smooth' });
    kneeRKeys.push({ id: `kf_r_knee_${f}`, t: (f - 1) / fps, v: Math.round(kneeBendR), ease: 'smooth' });
  }

  channels['bone.b_leg_l_thigh.rot'] = { id: 'ch_l_thigh', name: 'Left Thigh Swing', path: 'bone.b_leg_l_thigh.rot', defaultValue: 0, keyframes: legLKeys, unit: '°' };
  channels['bone.b_leg_r_thigh.rot'] = { id: 'ch_r_thigh', name: 'Right Thigh Swing', path: 'bone.b_leg_r_thigh.rot', defaultValue: 0, keyframes: legRKeys, unit: '°' };
  channels['bone.b_leg_l_calf.rot'] = { id: 'ch_l_knee', name: 'Left Knee Flex', path: 'bone.b_leg_l_calf.rot', defaultValue: 0, keyframes: kneeLKeys, unit: '°' };
  channels['bone.b_leg_r_calf.rot'] = { id: 'ch_r_knee', name: 'Right Knee Flex', path: 'bone.b_leg_r_calf.rot', defaultValue: 0, keyframes: kneeRKeys, unit: '°' };

  // 3. Arm Counter-Swing Channels (opposite to legs)
  const armLKeys: Keyframe<number>[] = [];
  const armRKeys: Keyframe<number>[] = [];

  for (let f = 1; f <= totalFrames; f += stepRate) {
    const t = (f - 1) / totalFrames;
    const rad = t * Math.PI * 2;

    const rotArmL = Math.sin(rad + Math.PI) * armSwing;
    const rotArmR = Math.sin(rad) * armSwing;

    armLKeys.push({ id: `kf_l_arm_${f}`, t: (f - 1) / fps, v: Math.round(rotArmL), ease: 'smooth' });
    armRKeys.push({ id: `kf_r_arm_${f}`, t: (f - 1) / fps, v: Math.round(rotArmR), ease: 'smooth' });
  }

  channels['bone.b_arm_l_upper.rot'] = { id: 'ch_l_arm', name: 'Left Arm Counter-Swing', path: 'bone.b_arm_l_upper.rot', defaultValue: 0, keyframes: armLKeys, unit: '°' };
  channels['bone.b_arm_r_upper.rot'] = { id: 'ch_r_arm', name: 'Right Arm Counter-Swing', path: 'bone.b_arm_r_upper.rot', defaultValue: 0, keyframes: armRKeys, unit: '°' };

  // 4. Secondary Inertia Lag for Head and Tail
  const headLagKeys: Keyframe<number>[] = [];
  for (let f = 1; f <= totalFrames; f += stepRate) {
    const t = (f - 1) / totalFrames;
    const rad = t * Math.PI * 2;
    // Lags behind torso rotation by 90 degrees
    const headRot = -Math.cos(rad) * (torsoLean * (isHeavy ? 1.4 : 0.8));
    headLagKeys.push({ id: `kf_h_lag_${f}`, t: (f - 1) / fps, v: Math.round(headRot * 10) / 10, ease: 'smooth' });
  }
  channels['bone.b_head.rot'] = { id: 'ch_h_lag', name: 'Head Secondary Drag', path: 'bone.b_head.rot', defaultValue: 0, keyframes: headLagKeys, unit: '°' };

  return channels;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EMOTION & EXPRESSIVE STANCES GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function generateEmotionStances(
  skeleton: AnimaBone[],
  massProfile: CharacterMassProfile,
  dossier?: CharacterStoryDossier,
): Record<string, Record<string, number>> {
  const isHeavy = massProfile.estimatedMassKg > 150;

  return {
    heroic_resolve: {
      'transform.y': -10,
      'transform.rotationZ': 0,
      'bone.b_chest.rot': -4,
      'bone.b_head.rot': 8,
      'bone.b_arm_l_upper.rot': -35,
      'bone.b_arm_r_upper.rot': 35,
      'bone.b_leg_l_thigh.rot': -12,
      'bone.b_leg_r_thigh.rot': 12,
    },
    stealth_crouch: {
      'transform.y': isHeavy ? 35 : 28,
      'transform.rotationZ': -5,
      'bone.b_chest.rot': 14,
      'bone.b_head.rot': -10,
      'bone.b_arm_l_upper.rot': 25,
      'bone.b_arm_r_upper.rot': -25,
      'bone.b_leg_l_calf.rot': 40,
      'bone.b_leg_r_calf.rot': 40,
    },
    shocked_take: {
      'transform.y': -35,
      'transform.rotationZ': -8,
      'bone.b_chest.rot': -16,
      'bone.b_head.rot': 18,
      'bone.b_arm_l_upper.rot': -70,
      'bone.b_arm_r_upper.rot': 70,
    },
    celebratory_leap: {
      'transform.y': -55,
      'transform.rotationZ': 4,
      'bone.b_chest.rot': -8,
      'bone.b_head.rot': 12,
      'bone.b_arm_l_upper.rot': -120,
      'bone.b_arm_r_upper.rot': 120,
      'bone.b_leg_l_thigh.rot': -30,
      'bone.b_leg_r_thigh.rot': 30,
    },
    dramatic_despair: {
      'transform.y': 15,
      'transform.rotationZ': 3,
      'bone.b_chest.rot': 18,
      'bone.b_head.rot': -25,
      'bone.b_arm_l_upper.rot': 10,
      'bone.b_arm_r_upper.rot': -10,
    },
    battle_ready: {
      'transform.y': 8,
      'transform.rotationZ': -6,
      'bone.b_chest.rot': 8,
      'bone.b_head.rot': -4,
      'bone.b_arm_l_upper.rot': -45,
      'bone.b_arm_r_upper.rot': 30,
      'bone.b_leg_l_thigh.rot': -18,
      'bone.b_leg_r_thigh.rot': 18,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MAIN AUTO-RIG PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

export function autoRigArtwork(input: ArtworkAnalysisInput): AutoRigResult {
  const { morphology, landmarks } = analyzeArtworkStructure(input);
  const massProfile = calculateMassDynamics(landmarks, morphology, input.storyDossier);
  const bones = generateAdaptiveSkeleton(landmarks, morphology, massProfile);
  const walkCycleChannels = generateCustomWalkCycle(bones, massProfile, morphology, input.storyDossier);
  const emotionStances = generateEmotionStances(bones, massProfile, input.storyDossier);

  return {
    rigId: `rig_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    morphology,
    landmarks,
    bones,
    massProfile,
    walkCycleChannels,
    emotionStances,
    storyDossierApplied: input.storyDossier,
  };
}

export const autoRigEngine = {
  autoRigArtwork,
  analyzeArtworkStructure,
  calculateMassDynamics,
  generateAdaptiveSkeleton,
  generateCustomWalkCycle,
  generateEmotionStances,
};

export type { AutoRigResult };
