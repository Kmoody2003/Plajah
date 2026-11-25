import * as THREE from 'three/webgpu';
import type { CarState } from './physics';
import type { BroadcastCam } from './world';

interface ReplayFrame {
  pos: THREE.Vector3;
  yaw: number;
  steerAngle: number;
  wheelSpin: number;
  wheelCompression: [number, number, number, number];
  brakeTemp: [number, number, number, number];
  pitch: number;
  roll: number;
  speedMps: number;
  rpm: number;
  gear: number;
  isDrifting: boolean;
  isBraking: boolean;
}

export class ReplaySystem {
  private frames: ReplayFrame[] = [];
  private readonly maxFrames = 600;
  private playIdx = 0;
  private angleIdx = 0;
  public active = false;

  record(state: CarState): void {
    this.frames.push({
      pos: state.pos.clone(),
      yaw: state.yaw,
      steerAngle: state.steerAngle,
      wheelSpin: state.wheelSpin,
      wheelCompression: [...state.wheelCompression] as [number, number, number, number],
      brakeTemp: [...state.brakeTemp] as [number, number, number, number],
      pitch: state.pitch,
      roll: state.roll,
      speedMps: state.speedMps,
      rpm: state.rpm,
      gear: state.gear,
      isDrifting: state.isDrifting,
      isBraking: state.isBraking,
    });
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  toggle(): boolean {
    if (!this.active && this.frames.length < 4) return false;
    this.active = !this.active;
    if (this.active) this.playIdx = 0;
    return this.active;
  }

  cycleAngle(): void {
    this.angleIdx = (this.angleIdx + 1) % 3;
  }

  step(
    state: CarState,
    camera: THREE.PerspectiveCamera,
    _elapsed: number,
    broadcastCams: BroadcastCam[]
  ): boolean {
    if (!this.active || this.frames.length === 0) return false;
    const f = this.frames[this.playIdx % this.frames.length];
    this.playIdx = (this.playIdx + 1) % this.frames.length;

    state.pos.copy(f.pos);
    state.yaw = f.yaw;
    state.steerAngle = f.steerAngle;
    state.wheelSpin = f.wheelSpin;
    state.wheelCompression = [...f.wheelCompression];
    state.brakeTemp = [...f.brakeTemp];
    state.pitch = f.pitch;
    state.roll = f.roll;
    state.speedMps = f.speedMps;
    state.rpm = f.rpm;
    state.gear = f.gear;
    state.isDrifting = f.isDrifting;
    state.isBraking = f.isBraking;

    if (this.angleIdx === 0 && broadcastCams.length > 0) {
      let nearest = broadcastCams[0].pos;
      let bestD2 = Infinity;
      for (const cam of broadcastCams) {
        const d2 = cam.pos.distanceToSquared(f.pos);
        if (d2 < bestD2) {
          bestD2 = d2;
          nearest = cam.pos;
        }
      }
      camera.position.copy(nearest);
      camera.lookAt(f.pos.x, f.pos.y + 0.8, f.pos.z);
    } else if (this.angleIdx === 1) {
      // Low wheel-arch / fender tracking cam
      const sx = Math.sin(f.yaw), cz = Math.cos(f.yaw);
      camera.position.set(f.pos.x + cz * 2.4 - sx * 1.4, f.pos.y + 0.65, f.pos.z - sx * 2.4 - cz * 1.4);
      camera.lookAt(f.pos.x + sx * 1.2, f.pos.y + 0.55, f.pos.z + cz * 1.2);
    } else {
      // Helicopter chase angle
      const sx = Math.sin(f.yaw), cz = Math.cos(f.yaw);
      camera.position.set(f.pos.x - sx * 8.5, f.pos.y + 4.5, f.pos.z - cz * 8.5);
      camera.lookAt(f.pos.x, f.pos.y + 0.8, f.pos.z);
    }
    return true;
  }
}
