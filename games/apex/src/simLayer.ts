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
import { createTrafficLibraryMaterial, loadCarLibraryModels, type LibraryVehicleRole } from './carLibraryInstancer';

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
  private carGroup = new THREE.Group();
  private carBuckets = new Map<LibraryVehicleRole, THREE.InstancedMesh>();
  private carRoles: LibraryVehicleRole[] = [];
  private trafficVisible = true;
  /** stop lines, crosswalks, signals and stop signs, from the sim's junction control */
  readonly junctions: IntersectionLayer;
  private t = 0;
  private stepAcc = 0;
  private hiddenSkip = 0;
  private _m4 = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _sc = new THREE.Vector3(1, 1, 1);
  private _p = new THREE.Vector3();
  private _col = new THREE.Color();
  private groundCache = new Float32Array(320 * 3); // [lastX, lastZ, cachedY] per slot

  constructor(private plan: SimPlan, private o: { ground: (x: number, z: number) => number; carGround?: (x: number, z: number) => number; water: (x: number, z: number) => boolean; keepOut?: (x: number, z: number) => boolean }) {
    this.group.name = 'sim-layer';
    this.world = new SimWorld({ roads: plan.data.roads, zones: plan.data.zones, services: plan.data.services, rail: plan.net, airport: plan.L, water: o.water, maxCars: 240, downtown: plan.tall?.length ? denseArea(plan.tall) : undefined });
    this.junctions = buildIntersections(this.world.signals, this.world.graph, o.carGround ?? o.ground, o.keepOut);
    this.group.add(this.junctions.group);
    this.rail = plan.net ? buildRailScenes({ net: plan.net, sim: this.world.trains, ground: o.ground }) : null;
    this.airport = plan.L ? buildAirportScenes({ L: plan.L, sim: this.world.air, ground: o.ground }) : null;
    if (this.rail) this.group.add(this.rail.group);
    if (this.airport) this.group.add(this.airport.group);
    this.carGroup.name = 'sim-library-traffic';
    this.group.add(this.carGroup);
    this.groundCache.fill(-1e9);
    // Load ALL 26 real 3D Car Library models (sedans, SUVs, sports/muscle, EVs, pickups, city transit bus, shuttles, tow/haulers, taxis, police & semis!)
    void loadCarLibraryModels().then((models) => {
      const heavyRoles = new Set<LibraryVehicleRole>(['truck', 'semi', 'bus', 'tow', 'hauler', 'carrier', 'tactical']);
      const roles: LibraryVehicleRole[] = [
        'sedan', 'suv', 'coupe', 'pickup', 'estate', 'luxsuv', 'crew', 'van', 'taxi', 'police',
        'sport_gt', 'muscle', 'ev_sedan', 'overland', 'hatch', 'hd_pickup', 'municipal', 'commander', 'shuttle',
        'truck', 'semi', 'bus', 'tow', 'hauler', 'carrier', 'tactical',
      ];
      for (const role of roles) {
        const mod = models.get(role);
        if (!mod) continue;
        const mat = createTrafficLibraryMaterial(role, mod.size);
        const cap = heavyRoles.has(role) ? 48 : 64;
        const im = new THREE.InstancedMesh(mod.geometry, mat, cap);
        im.frustumCulled = false;
        im.count = 0;
        im.castShadow = false;
        im.receiveShadow = true;
        this.carBuckets.set(role, im);
        this.carGroup.add(im);
        if (!heavyRoles.has(role)) this.carRoles.push(role);
      }
      this.carGroup.visible = this.trafficVisible;
    });
  }

  /** true within r metres of a rail line or the airfield: nothing grows or is built there */
  near(x: number, z: number, r: number): boolean { return !!(this.rail?.near(x, z, r) || this.airport?.inside(x, z, r) || this.junctions.near(x, z, r)); }
  get surfaces(): THREE.Mesh[] { return this.airport?.surfaces ?? []; }

  /** public traffic is off on a closed circuit: the cars are hidden (the sim keeps running) while a race or time trial is on */
  setPublicTraffic(on: boolean): void { this.trafficVisible = on; this.carGroup.visible = on; }

  /**
   * Map Overview mode: hides close-up AI traffic cars & road intersections to keep 60 FPS,
   * while keeping the operating Railroad (3 lines, 8 stations, live Freight & Passenger trains!)
   * and Halcyon International Airport (Runway 09/27, Terminal, Hangars, live Flights!) VISIBLE!
   */
  setMapOverview(on: boolean): void {
    this.group.visible = true;
    this.carGroup.visible = !on && this.trafficVisible;
    this.junctions.group.visible = !on;
    if (this.rail) this.rail.group.visible = true;
    if (this.airport) this.airport.group.visible = true;
  }

  /** Lightweight 60-FPS Map Overview step: advances live Freight/Passenger Trains and Scheduled Flights without stepping street cars. */
  updateTransitOnly(dt: number): void {
    this.t += dt;
    const stepDt = Math.min(dt, 0.1);
    this.world.trains?.step(stepDt);
    this.world.air?.step(stepDt);
    this.rail?.update(this.t, stepDt);
    this.airport?.update(this.t, stepDt);
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    this.rail?.update(this.t, dt);
    this.airport?.update(this.t, dt);
    // During closed-circuit races when public traffic is hidden, throttle background traffic stepping to 15 Hz so it never competes with race-start frame times
    if (!this.trafficVisible || this.carBuckets.size === 0) {
      this.stepAcc += dt;
      if (++this.hiddenSkip < 4) return;
      this.hiddenSkip = 0;
      const stepDt = Math.min(this.stepAcc, 0.1);
      this.stepAcc = 0;
      this.world.setFocus(cam.x, cam.z);
      this.world.step(stepDt);
      this.junctions.update();
      return;
    }

    // In free roam with heavy downtown traffic, cap traffic simulation & matrix upload cleanly at ~30 Hz and cull cars > 380 m away from camera
    this.stepAcc += dt;
    const dense = this.world.cars.length > 60;
    if (dense && this.stepAcc < 1 / 34) return;
    const stepDt = Math.min(this.stepAcc, 0.08);
    this.stepAcc = 0;
    this.world.setFocus(cam.x, cam.z);
    this.world.step(stepDt);
    this.junctions.update();

    const m4 = this._m4, q = this._q, up = this._up, sc = this._sc, p = this._p, col = this._col;
    const gc = this.groundCache;
    const gFn = this.o.carGround ?? this.o.ground;
    const maxVisDist2 = 380 * 380;
    const counts = new Map<LibraryVehicleRole, number>();
    for (const role of this.carBuckets.keys()) counts.set(role, 0);

    const list = this.world.cars;
    for (let i = 0; i < list.length && i < 320; i++) {
      const c = list[i];
      const dx = c.x - cam.x, dz = c.z - cam.z;
      if (dx * dx + dz * dz > maxVisDist2) continue;
      const heavyPool: LibraryVehicleRole[] = ['truck', 'semi', 'bus', 'tow', 'hauler', 'carrier', 'tactical'].filter((r) => this.carBuckets.has(r as LibraryVehicleRole)) as LibraryVehicleRole[];
      const role: LibraryVehicleRole = c.kind === 'truck'
        ? (heavyPool[i % Math.max(1, heavyPool.length)] ?? 'pickup')
        : this.carRoles[i % Math.max(1, this.carRoles.length)] ?? 'sedan';
      const im = this.carBuckets.get(role);
      if (!im) continue;
      const slot = counts.get(role) ?? 0;
      if (slot >= im.instanceMatrix.count) continue;

      q.setFromAxisAngle(up, c.yaw);
      sc.set(1, 1, 1);
      const base = i * 3;
      let gy = gc[base + 2];
      if (gy < -1e8 || Math.abs(c.x - gc[base]) + Math.abs(c.z - gc[base + 1]) > 2.2) {
        gy = gFn(c.x, c.z) + 0.03;
        gc[base] = c.x;
        gc[base + 1] = c.z;
        gc[base + 2] = gy;
      }
      p.set(c.x, gy, c.z);
      im.setMatrixAt(slot, m4.compose(p, q, sc));
      im.setColorAt(slot, col.setHex(c.color));
      counts.set(role, slot + 1);
    }
    for (const [role, im] of this.carBuckets) {
      im.count = counts.get(role) ?? 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
