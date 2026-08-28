// CameraRig — the difference between a diagram you rotate and a place you fly
// through.
//
// The module let you orbit a fixed point. Selecting Neptune changed the text
// panel and nothing else, so the planet you were reading about stayed a speck in
// the corner. This flies the camera to whatever is selected and keeps it there
// while the planet continues along its orbit.
//
// Three things make the difference between a camera move and a cinematic one:
//
//   · FRAMING BY SIZE, not by distance. The camera stops at a multiple of the
//     body's radius, so the Sun and Mercury both fill a comparable part of the
//     frame. A fixed standoff makes small planets invisible and large ones
//     clip the near plane.
//
//   · EASE, NOT LERP. A constant fraction per frame (the usual `lerp(a, b, 0.05)`)
//     starts fast and crawls forever — it never actually arrives, and the motion
//     reads as sluggish. A smoothstep over a real duration accelerates out of
//     rest and decelerates into the target, which is how a camera on a crane
//     behaves.
//
//   · THE MOVE ENDS. Once it arrives, control returns to the user. A rig that
//     keeps steering fights whoever is trying to look around, which feels broken
//     even when it looks smooth.
//
// While travelling, the rig also FOLLOWS: the target is re-read every frame, so
// a planet moving along its orbit is tracked rather than aimed at where it used
// to be. Over Neptune's slow arc that hardly matters; over Mercury's it is the
// difference between arriving at the planet and arriving where it was.

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export interface CameraRigProps {
  /** Live world position of the selected body, re-read every frame. */
  target: THREE.Vector3 | null;
  /** The body's radius, so framing scales with size. */
  targetRadius: number;
  /** Changing this starts a new flight. */
  targetKey: string;
  /** Seconds the move takes. */
  duration?: number;
  /** Standoff as a multiple of the body's radius. */
  framing?: number;
  /** Notified when the flight finishes, so controls can be handed back. */
  onArrive?: () => void;
}

/** Smoothstep — zero velocity at both ends, which is what "cinematic" means here. */
function ease(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export default function CameraRig({
  target, targetRadius, targetKey, duration = 2.2, framing = 4.5, onArrive,
}: CameraRigProps) {
  const { camera, controls } = useThree();
  const from = useRef(new THREE.Vector3());
  const fromLook = useRef(new THREE.Vector3());
  const elapsed = useRef(0);
  const flying = useRef(false);
  const scratch = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());

  // A new selection starts a flight. The starting point is wherever the camera
  // happens to be, so an interrupted move continues smoothly from where it got
  // to rather than snapping back to some canonical position.
  useEffect(() => {
    if (!target) return;
    from.current.copy(camera.position);
    const c = controls as unknown as { target?: THREE.Vector3 } | null;
    fromLook.current.copy(c?.target ?? new THREE.Vector3());

    // Approach direction: keep the camera on the side it is already on, so the
    // move never swings through the body. Falls back to a three-quarter view
    // from above, which flatters a sphere far more than a straight-on shot.
    offset.current.copy(camera.position).sub(target);
    if (offset.current.lengthSq() < 1e-6) offset.current.set(1, 0.45, 1);
    offset.current.normalize();
    if (Math.abs(offset.current.y) < 0.18) {
      offset.current.y = 0.28;                       // lift a level approach
      offset.current.normalize();
    }

    elapsed.current = 0;
    flying.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  useFrame((_, delta) => {
    if (!flying.current || !target) return;

    elapsed.current += delta;
    const t = ease(elapsed.current / duration);

    // Re-read the target every frame: the planet keeps moving along its orbit
    // while we travel, and aiming at a stale position means arriving beside it.
    const standoff = Math.max(targetRadius * framing, targetRadius + 1.2);
    scratch.current.copy(offset.current).multiplyScalar(standoff).add(target);

    camera.position.lerpVectors(from.current, scratch.current, t);

    const c = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (c?.target) {
      c.target.lerpVectors(fromLook.current, target, t);
      c.update?.();
    } else {
      camera.lookAt(target);
    }

    if (elapsed.current >= duration) {
      flying.current = false;
      onArrive?.();
    }
  });

  return null;
}
