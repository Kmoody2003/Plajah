/**
 * services/anima/motionDataLoader.ts
 *
 * Plajah Unified Motion & Animation System ("Anima") - Motion Capture & Tracking Data Loader
 *
 * Imports and retargets industry-standard motion capture and 2D tracking files:
 * 1. BVH (Biovision Hierarchy) 3D skeletal mocap files
 * 2. JSON Pose Sequences (MediaPipe, OpenPose, Plajah Pose)
 * 3. 2D Point Tracker CSV files (After Effects, Blender Motion Tracker, Mocha)
 *
 * Converts imported spatial data into 2D planar bone angles and layer trajectories,
 * allowing 2D rigged characters to be driven by external mocap files.
 */

import type { AnimaProject, AnimaLayer, AnimaBone, AnimaChannel, Keyframe } from './types';

export interface BVHJoint {
  name: string;
  isRoot: boolean;
  offset: [number, number, number];
  channels: string[];
  channelIndices: number[];
  children: BVHJoint[];
  parentName: string | null;
}

export interface BVHMotion {
  frameCount: number;
  frameTime: number; // in seconds, e.g. 0.0333 for 30fps
  data: number[][];  // [frameIdx][channelIdx]
}

export interface BVHStructure {
  root: BVHJoint;
  jointsByName: Record<string, BVHJoint>;
  channelList: { jointName: string; channelName: string; index: number }[];
  motion: BVHMotion;
}

export interface ParsedMotionTrack {
  name: string;
  type: 'rotation' | 'position_x' | 'position_y' | 'scalar';
  samples: { t: number; v: number }[];
}

export interface ParsedMotionData {
  format: 'bvh' | 'openpose_json' | 'mediapipe_json' | 'plajah_pose_json' | 'tracker_csv';
  fps: number;
  durationSec: number;
  tracks: Record<string, ParsedMotionTrack>;
  rawJoints?: string[];
}

export interface MotionDataRetargetOptions {
  sampleCadence?: 'every_frame' | 'on_2s' | 'adaptive';
  tolerance?: number;
  scaleX?: number;
  scaleY?: number;
  boneMapping?: Record<string, string>; // rigBoneId -> motionTrackName
}

/**
 * 1. BVH PARSER
 */
export function parseBVH(bvhText: string): BVHStructure {
  const lines = bvhText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  let lineIdx = 0;
  if (!lines[lineIdx] || !lines[lineIdx].startsWith('HIERARCHY')) {
    throw new Error('Invalid BVH file: Missing HIERARCHY header');
  }
  lineIdx++;

  const jointsByName: Record<string, BVHJoint> = {};
  const channelList: { jointName: string; channelName: string; index: number }[] = [];
  let channelCounter = 0;

  function parseJoint(parentName: string | null): BVHJoint {
    const line = lines[lineIdx++];
    const tokens = line.split(/\s+/);
    const isRoot = tokens[0] === 'ROOT';
    const isJoint = tokens[0] === 'JOINT';
    const isEnd = tokens[0] === 'End';

    const name = isEnd ? `${parentName}_End` : tokens[1];
    const joint: BVHJoint = {
      name,
      isRoot,
      offset: [0, 0, 0],
      channels: [],
      channelIndices: [],
      children: [],
      parentName,
    };

    // Open brace
    if (lines[lineIdx++] !== '{') {
      throw new Error(`Expected '{' after joint declaration for ${name}`);
    }

    while (lineIdx < lines.length) {
      const curLine = lines[lineIdx];
      if (curLine === '}') {
        lineIdx++;
        break;
      }

      const curTokens = curLine.split(/\s+/);
      const tag = curTokens[0];

      if (tag === 'OFFSET') {
        joint.offset = [parseFloat(curTokens[1]), parseFloat(curTokens[2]), parseFloat(curTokens[3])];
        lineIdx++;
      } else if (tag === 'CHANNELS') {
        const count = parseInt(curTokens[1], 10);
        for (let c = 0; c < count; c++) {
          const chName = curTokens[2 + c];
          joint.channels.push(chName);
          joint.channelIndices.push(channelCounter);
          channelList.push({ jointName: name, channelName: chName, index: channelCounter });
          channelCounter++;
        }
        lineIdx++;
      } else if (tag === 'JOINT' || tag === 'End') {
        const child = parseJoint(name);
        joint.children.push(child);
      } else {
        lineIdx++;
      }
    }

    jointsByName[name] = joint;
    return joint;
  }

  const root = parseJoint(null);

  // Parse MOTION section
  while (lineIdx < lines.length && !lines[lineIdx].startsWith('MOTION')) {
    lineIdx++;
  }
  lineIdx++; // skip 'MOTION'

  let frameCount = 0;
  let frameTime = 0.033333;

  while (lineIdx < lines.length) {
    const curLine = lines[lineIdx];
    if (curLine.startsWith('Frames:')) {
      frameCount = parseInt(curLine.split(/\s+/)[1], 10);
      lineIdx++;
    } else if (curLine.startsWith('Frame Time:')) {
      frameTime = parseFloat(curLine.split(/\s+/)[2]);
      lineIdx++;
      break;
    } else {
      lineIdx++;
    }
  }

  const motionData: number[][] = [];
  while (lineIdx < lines.length) {
    const dataTokens = lines[lineIdx].trim().split(/\s+/).map((t) => parseFloat(t));
    if (dataTokens.length >= channelCounter) {
      motionData.push(dataTokens);
    }
    lineIdx++;
  }

  return {
    root,
    jointsByName,
    channelList,
    motion: {
      frameCount: motionData.length,
      frameTime,
      data: motionData,
    },
  };
}

/**
 * Converts BVH structure to normalized 2D Planar Motion Data
 */
export function bvhToParsedMotion(bvh: BVHStructure): ParsedMotionData {
  const tracks: Record<string, ParsedMotionTrack> = {};
  const frameTime = bvh.motion.frameTime;
  const fps = Math.round(1 / frameTime);
  const durationSec = bvh.motion.frameCount * frameTime;

  // Extract root translation channels if present
  const rootName = bvh.root.name;
  for (const ch of bvh.channelList) {
    if (ch.jointName === rootName) {
      if (ch.channelName.toLowerCase().includes('xposition')) {
        tracks['root_x'] = {
          name: 'Root X',
          type: 'position_x',
          samples: bvh.motion.data.map((row, i) => ({ t: i * frameTime, v: row[ch.index] })),
        };
      } else if (ch.channelName.toLowerCase().includes('yposition')) {
        tracks['root_y'] = {
          name: 'Root Y',
          type: 'position_y',
          samples: bvh.motion.data.map((row, i) => ({ t: i * frameTime, v: -row[ch.index] })), // flip for 2D screen coords
        };
      }
    }

    // Extract rotations for all joints (focusing on Zrotation or Yrotation for 2D sagittal/coronal projection)
    if (ch.channelName.toLowerCase().includes('zrotation')) {
      const cleanJoint = ch.jointName.toLowerCase();
      tracks[`${cleanJoint}_rot`] = {
        name: `${ch.jointName} Rotation`,
        type: 'rotation',
        samples: bvh.motion.data.map((row, i) => ({ t: i * frameTime, v: row[ch.index] })),
      };
    }
  }

  return {
    format: 'bvh',
    fps,
    durationSec,
    tracks,
    rawJoints: Object.keys(bvh.jointsByName),
  };
}

/**
 * 2. JSON POSE SEQUENCE PARSER (OpenPose, MediaPipe, Plajah Pose)
 */
export function parsePoseJSON(jsonContent: string | object): ParsedMotionData {
  const data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;

  // Check if Plajah Pose format
  if (data.format === 'plajah_pose' && Array.isArray(data.frames)) {
    const fps = data.fps || 30;
    const tracks: Record<string, ParsedMotionTrack> = {};
    const frames = data.frames;
    const durationSec = frames.length > 0 ? (frames[frames.length - 1].t ?? (frames.length - 1) / fps) : 0;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const t = f.t ?? i / fps;
      if (f.bones) {
        for (const [bone, val] of Object.entries(f.bones)) {
          if (!tracks[bone]) {
            tracks[bone] = { name: bone, type: 'rotation', samples: [] };
          }
          tracks[bone].samples.push({ t, v: Number(val) });
        }
      }
      if (f.root) {
        if (!tracks['root_x']) tracks['root_x'] = { name: 'Root X', type: 'position_x', samples: [] };
        if (!tracks['root_y']) tracks['root_y'] = { name: 'Root Y', type: 'position_y', samples: [] };
        tracks['root_x'].samples.push({ t, v: f.root.x ?? 0 });
        tracks['root_y'].samples.push({ t, v: f.root.y ?? 0 });
      }
    }

    return {
      format: 'plajah_pose_json',
      fps,
      durationSec,
      tracks,
    };
  }

  // Check if MediaPipe pose sequence: { frames: [{ time: number, keypoints: [...] }] }
  if (Array.isArray(data.frames) && data.frames[0]?.keypoints) {
    const fps = data.fps || 30;
    const tracks: Record<string, ParsedMotionTrack> = {};
    const frames = data.frames;
    const durationSec = frames[frames.length - 1].time ?? (frames.length - 1) / fps;

    // Track landmark points
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const t = f.time ?? i / fps;
      const kps = f.keypoints;
      if (Array.isArray(kps)) {
        for (let j = 0; j < kps.length; j++) {
          const pt = kps[j];
          const kx = `pt_${j}_x`;
          const ky = `pt_${j}_y`;
          if (!tracks[kx]) tracks[kx] = { name: `Point ${j} X`, type: 'position_x', samples: [] };
          if (!tracks[ky]) tracks[ky] = { name: `Point ${j} Y`, type: 'position_y', samples: [] };
          tracks[kx].samples.push({ t, v: pt.x * 100 });
          tracks[ky].samples.push({ t, v: pt.y * 100 });
        }
      }
    }

    return {
      format: 'mediapipe_json',
      fps,
      durationSec,
      tracks,
    };
  }

  // OpenPose single or multi frame
  if (data.people || data.version) {
    const people = data.people || [];
    const tracks: Record<string, ParsedMotionTrack> = {};
    if (people.length > 0 && people[0].pose_keypoints_2d) {
      const pts = people[0].pose_keypoints_2d;
      for (let i = 0; i < pts.length; i += 3) {
        const idx = i / 3;
        tracks[`pt_${idx}_x`] = {
          name: `Joint ${idx} X`,
          type: 'position_x',
          samples: [{ t: 0, v: pts[i] }],
        };
        tracks[`pt_${idx}_y`] = {
          name: `Joint ${idx} Y`,
          type: 'position_y',
          samples: [{ t: 0, v: pts[i + 1] }],
        };
      }
    }
    return {
      format: 'openpose_json',
      fps: 30,
      durationSec: 1.0,
      tracks,
    };
  }

  throw new Error('Unsupported JSON motion format');
}

/**
 * 3. 2D POINT TRACKER CSV PARSER (After Effects, Blender, Mocha)
 */
export function parseTrackerCSV(csvContent: string, fps = 30): ParsedMotionData {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length < 2) {
    throw new Error('CSV file has insufficient lines');
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const tracks: Record<string, ParsedMotionTrack> = {};

  // Check columns: e.g. Frame, Time, X, Y or Frame, Track1_X, Track1_Y...
  const frameCol = header.findIndex((h) => h === 'frame');
  const timeCol = header.findIndex((h) => h === 'time' || h === 'timesec');
  const xCol = header.findIndex((h) => h === 'x' || h === 'pos_x' || h === 'position x');
  const yCol = header.findIndex((h) => h === 'y' || h === 'pos_y' || h === 'position y');

  if (xCol !== -1 && yCol !== -1) {
    // Single point tracker format
    const samplesX: { t: number; v: number }[] = [];
    const samplesY: { t: number; v: number }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => parseFloat(c.trim()));
      if (isNaN(cols[xCol]) || isNaN(cols[yCol])) continue;

      let t = 0;
      if (timeCol !== -1 && !isNaN(cols[timeCol])) {
        t = cols[timeCol];
      } else if (frameCol !== -1 && !isNaN(cols[frameCol])) {
        t = cols[frameCol] / fps;
      } else {
        t = (i - 1) / fps;
      }

      samplesX.push({ t, v: cols[xCol] });
      samplesY.push({ t, v: cols[yCol] });
    }

    tracks['point_x'] = { name: 'Tracker X', type: 'position_x', samples: samplesX };
    tracks['point_y'] = { name: 'Tracker Y', type: 'position_y', samples: samplesY };
  } else {
    // Multi-column tracker format
    for (let c = 0; c < header.length; c++) {
      const colName = header[c];
      if (colName === 'frame' || colName === 'time') continue;

      const samples: { t: number; v: number }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((v) => parseFloat(v.trim()));
        if (isNaN(cols[c])) continue;

        let t = 0;
        if (timeCol !== -1 && !isNaN(cols[timeCol])) {
          t = cols[timeCol];
        } else if (frameCol !== -1 && !isNaN(cols[frameCol])) {
          t = cols[frameCol] / fps;
        } else {
          t = (i - 1) / fps;
        }

        samples.push({ t, v: cols[c] });
      }

      const isX = colName.endsWith('_x') || colName.endsWith('.x');
      const isY = colName.endsWith('_y') || colName.endsWith('.y');
      tracks[colName] = {
        name: colName,
        type: isX ? 'position_x' : isY ? 'position_y' : 'scalar',
        samples,
      };
    }
  }

  const allSamples = Object.values(tracks).flatMap((t) => t.samples);
  const maxTime = allSamples.length > 0 ? Math.max(...allSamples.map((s) => s.t)) : 0;

  return {
    format: 'tracker_csv',
    fps,
    durationSec: Math.max(0.1, maxTime),
    tracks,
  };
}

/**
 * Unified detector & loader for any motion data file
 */
export function parseMotionFile(filename: string, content: string): ParsedMotionData {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.bvh') || content.includes('HIERARCHY') && content.includes('MOTION')) {
    const bvh = parseBVH(content);
    return bvhToParsedMotion(bvh);
  }

  if (lower.endsWith('.json') || content.trim().startsWith('{')) {
    return parsePoseJSON(content);
  }

  if (lower.endsWith('.csv') || content.includes(',')) {
    return parseTrackerCSV(content);
  }

  throw new Error(`Unable to determine motion data format for ${filename}`);
}

/**
 * Apply parsed motion data to an Anima Project layer and bake into timeline keyframes
 */
export function applyMotionDataToProject(
  project: AnimaProject,
  motionData: ParsedMotionData,
  targetLayerId: string,
  options: MotionDataRetargetOptions = {}
): AnimaProject {
  const layerIndex = project.layers.findIndex((l) => l.id === targetLayerId);
  if (layerIndex === -1) {
    console.warn(`Layer ${targetLayerId} not found in project`);
    return project;
  }

  const layer = project.layers[layerIndex];
  const cadence = options.sampleCadence ?? 'adaptive';
  const tolerance = options.tolerance ?? 0.5;
  const scaleX = options.scaleX ?? 1.0;
  const scaleY = options.scaleY ?? 1.0;

  const updatedChannels = { ...layer.channels };

  // Iterate over tracks and map to channels
  for (const [trackKey, track] of Object.entries(motionData.tracks)) {
    let targetChannelPath = '';

    if (track.type === 'position_x') {
      targetChannelPath = 'transform.x';
    } else if (track.type === 'position_y') {
      targetChannelPath = 'transform.y';
    } else if (track.type === 'rotation') {
      // Find matching bone in layer or use custom mapping
      if (options.boneMapping && options.boneMapping[trackKey]) {
        targetChannelPath = `bone.${options.boneMapping[trackKey]}.rot`;
      } else {
        const boneMatch = layer.bones?.find(
          (b) =>
            b.id.toLowerCase() === trackKey.toLowerCase() ||
            b.name.toLowerCase().replace(/[- ]/g, '_') === trackKey.toLowerCase() ||
            trackKey.toLowerCase().includes(b.name.toLowerCase())
        );
        if (boneMatch) {
          targetChannelPath = `bone.${boneMatch.id}.rot`;
        } else {
          targetChannelPath = `rot_${trackKey}`;
        }
      }
    } else {
      targetChannelPath = `track_${trackKey}`;
    }

    // Scale samples if translation
    const samples = track.samples.map((s) => ({
      t: s.t,
      v: track.type === 'position_x' ? s.v * scaleX : track.type === 'position_y' ? s.v * scaleY : s.v,
    }));

    // Filter samples cadence
    const filteredSamples = cadence === 'on_2s' ? samples.filter((_, idx) => idx % 2 === 0) : samples;

    // Build keyframes
    const keyframes: Keyframe<number>[] = filteredSamples.map((s, idx) => ({
      id: `k_data_${trackKey}_${idx}`,
      t: Number(s.t.toFixed(3)),
      v: Number(s.v.toFixed(2)),
      ease: 'smooth',
    }));

    const existingCh = updatedChannels[targetChannelPath];
    updatedChannels[targetChannelPath] = {
      id: existingCh ? existingCh.id : `ch_${targetChannelPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: track.name,
      path: targetChannelPath,
      defaultValue: samples.length > 0 ? samples[0].v : 0,
      keyframes,
    };
  }

  const updatedLayers = [...project.layers];
  updatedLayers[layerIndex] = {
    ...layer,
    channels: updatedChannels,
  };

  return {
    ...project,
    layers: updatedLayers,
  };
}
