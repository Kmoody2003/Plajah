import * as THREE from 'three';
import { type GeneratedRoads, type SimData, type UserMapData, featuresToSim } from './sim/data';
import { buildRoadGraph } from './sim/network';
import { type RailNetwork, layoutRail } from './sim/rail';
import { type AirportLayout, layoutAirport } from './sim/airport';
import { carveAirport, carveRail } from './sim/carve';
import { SimWorld } from './sim/world';
import { denseArea } from './sim/signals';
import { buildIntersections, type IntersectionLayer } from './intersections';
import { buildRailScenes, type RailScenes } from './railScenes';
import { buildAirportScenes, type AirportScenes } from './airportScenes';

/**
 * The simulation layer in the game: the map editor's roads, zones, rails, stations and airport become a road graph, a rail network and an airfield; the terrain is graded for the rails
 * and the field before it is meshed (planSim + carveSim, called from boot), then SimLayer draws them and runs the sim: cars and trucks commuting between the zones along the real roads,
 * trains on their timetables (gates close at level crossings, traffic waits), planes landing and taking off.
 */
export interface SimPlan { data: SimData; net: RailNetwork | null; L: AirportLayout | null; /** tall buildings (x, z): where they cluster is downtown */ tall?: [number, number][] }

export function planSim(map: UserMapData | null, gen: GeneratedRoads, ground: (x: number, z: number) => number, tall?: [number, number][]): SimPlan {
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
  return { data, net, L, tall };
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
  /** stop lines, crosswalks, signals and stop signs, from the sim's junction control */
  readonly junctions: IntersectionLayer;
  private t = 0;
  private _m4 = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _sc = new THREE.Vector3();
  private _p = new THREE.Vector3();
  private _col = new THREE.Color();
  private groundCache = new Float32Array(320 * 3); // [lastX, lastZ, cachedY] per slot

  constructor(private plan: SimPlan, private o: { ground: (x: number, z: number) => number; carGround?: (x: number, z: number) => number; water: (x: number, z: number) => boolean }) {
    this.group.name = 'sim-layer';
    this.world = new SimWorld({ roads: plan.data.roads, zones: plan.data.zones, services: plan.data.services, rail: plan.net, airport: plan.L, water: o.water, maxCars: 240, downtown: plan.tall?.length ? denseArea(plan.tall) : undefined });
    this.junctions = buildIntersections(this.world.signals, this.world.graph, o.carGround ?? o.ground);
    this.group.add(this.junctions.group);
    this.rail = plan.net ? buildRailScenes({ net: plan.net, sim: this.world.trains, ground: o.ground }) : null;
    this.airport = plan.L ? buildAirportScenes({ L: plan.L, sim: this.world.air, ground: o.ground }) : null;
    if (this.rail) this.group.add(this.rail.group);
    if (this.airport) this.group.add(this.airport.group);
    const geo = new THREE.BoxGeometry(1.85, 1.35, 4.3); geo.translate(0, 0.75, 0);
    this.cars = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.45 }), 320);
    this.cars.frustumCulled = false; this.cars.count = 0; this.cars.castShadow = false;
    this.group.add(this.cars);
    this.groundCache.fill(-1e9);
  }

  /** true within r metres of a rail line or the airfield: nothing grows or is built there */
  near(x: number, z: number, r: number): boolean { return !!(this.rail?.near(x, z, r) || this.airport?.inside(x, z, r) || this.junctions.near(x, z, r)); }
  get surfaces(): THREE.Mesh[] { return this.airport?.surfaces ?? []; }

  /** public traffic is off on a closed circuit: the cars are hidden (the sim keeps running) while a race or time trial is on */
  setPublicTraffic(on: boolean): void { this.cars.visible = on; }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    this.world.setFocus(cam.x, cam.z);
    this.world.step(dt);
    this.rail?.update(this.t, dt);
    this.airport?.update(this.t, dt);
    this.junctions.update();
    if (!this.cars.visible) return;

    const m4 = this._m4, q = this._q, up = this._up, sc = this._sc, p = this._p, col = this._col;
    const gc = this.groundCache;
    const gFn = this.o.carGround ?? this.o.ground;
    let n = 0;
    const list = this.world.cars;
    for (let i = 0; i < list.length && n < 320; i++) {
      const c = list[i];
      q.setFromAxisAngle(up, c.yaw);
      if (c.kind === 'truck') sc.set(1.25, 1.7, 1.9); else sc.set(1, 1, 1);
      const base = n * 3;
      let gy = gc[base + 2];
      if (gy < -1e8 || Math.abs(c.x - gc[base]) + Math.abs(c.z - gc[base + 1]) > 1.8) {
        gy = gFn(c.x, c.z) + 0.05;
        gc[base] = c.x;
        gc[base + 1] = c.z;
        gc[base + 2] = gy;
      }
      p.set(c.x, gy, c.z);
      this.cars.setMatrixAt(n, m4.compose(p, q, sc)); this.cars.setColorAt(n, col.setHex(c.color)); n++;
    }
    this.cars.count = n; this.cars.instanceMatrix.needsUpdate = true; if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
  }
}
