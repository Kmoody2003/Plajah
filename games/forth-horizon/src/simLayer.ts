import * as THREE from 'three';
import { type GeneratedRoads, type SimData, type UserMapData, featuresToSim } from './sim/data';
import { buildRoadGraph } from './sim/network';
import { type RailNetwork, layoutRail } from './sim/rail';
import { type AirportLayout, layoutAirport } from './sim/airport';
import { carveAirport, carveRail } from './sim/carve';
import { SimWorld } from './sim/world';
import { buildRailScenes, type RailScenes } from './railScenes';
import { buildAirportScenes, type AirportScenes } from './airportScenes';

/**
 * The simulation layer in the game: the map editor's roads, zones, rails, stations and airport become a road graph, a rail network and an airfield; the terrain is graded for the rails
 * and the field before it is meshed (planSim + carveSim, called from boot), then SimLayer draws them and runs the sim: cars and trucks commuting between the zones along the real roads,
 * trains on their timetables (gates close at level crossings, traffic waits), planes landing and taking off.
 */
export interface SimPlan { data: SimData; net: RailNetwork | null; L: AirportLayout | null }

export function planSim(map: UserMapData | null, gen: GeneratedRoads, ground: (x: number, z: number) => number): SimPlan {
  const data = featuresToSim(map, gen);
  let net: RailNetwork | null = null, L: AirportLayout | null = null;
  try {
    if (data.rails.length) net = layoutRail(data.rails, data.stations, ground, buildRoadGraph(data.roads));
    if (data.airport.length) {
      const rw = data.airport.find((a) => a.kind === 'runway');
      const e = rw ? ground((rw.pts[0][0] + rw.pts[1][0]) / 2, (rw.pts[0][1] + rw.pts[1][1]) / 2) : 4;
      L = layoutAirport(data.airport, Math.max(e, 4));
    }
  } catch (e) { console.warn('sim plan failed', e); }
  return { data, net, L };
}

export function carveSim(plan: SimPlan, heights: Float32Array, W: number, H: number, mpp: number): void {
  if (plan.net) carveRail(heights, W, H, mpp, plan.net.lines.map((l) => ({ profile: l.profile, double: l.kind === 'double' })));
  if (plan.L) carveAirport(heights, W, H, mpp, plan.L);
}

export class SimLayer {
  readonly group = new THREE.Group();
  readonly world: SimWorld;
  readonly rail: RailScenes | null;
  readonly airport: AirportScenes | null;
  private cars: THREE.InstancedMesh;
  private t = 0;

  constructor(private plan: SimPlan, private o: { ground: (x: number, z: number) => number; water: (x: number, z: number) => boolean }) {
    this.group.name = 'sim-layer';
    this.world = new SimWorld({ roads: plan.data.roads, zones: plan.data.zones, services: plan.data.services, rail: plan.net, airport: plan.L, water: o.water, maxCars: 240 });
    this.rail = plan.net ? buildRailScenes({ net: plan.net, sim: this.world.trains, ground: o.ground }) : null;
    this.airport = plan.L ? buildAirportScenes({ L: plan.L, sim: this.world.air, ground: o.ground }) : null;
    if (this.rail) this.group.add(this.rail.group);
    if (this.airport) this.group.add(this.airport.group);
    const geo = new THREE.BoxGeometry(1.85, 1.35, 4.3); geo.translate(0, 0.75, 0);
    this.cars = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.45 }), 320);
    this.cars.frustumCulled = false; this.cars.count = 0; this.cars.castShadow = false;
    this.group.add(this.cars);
  }

  /** true within r metres of a rail line or the airfield: nothing grows or is built there */
  near(x: number, z: number, r: number): boolean { return !!(this.rail?.near(x, z, r) || this.airport?.inside(x, z, r)); }
  get surfaces(): THREE.Mesh[] { return this.airport?.surfaces ?? []; }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    this.world.setFocus(cam.x, cam.z);
    this.world.step(dt);
    this.rail?.update(this.t, dt);
    this.airport?.update(this.t, dt);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let n = 0;
    for (const c of this.world.cars) {
      if (n >= 320) break;
      q.setFromAxisAngle(up, c.yaw);
      if (c.kind === 'truck') sc.set(1.25, 1.7, 1.9); else sc.set(1, 1, 1);
      p.set(c.x, this.o.ground(c.x, c.z) + 0.12, c.z);
      this.cars.setMatrixAt(n, m4.compose(p, q, sc)); this.cars.setColorAt(n, col.setHex(c.color)); n++;
    }
    this.cars.count = n; this.cars.instanceMatrix.needsUpdate = true; if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
  }
}
