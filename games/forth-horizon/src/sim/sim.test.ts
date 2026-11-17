import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraph, shortestPath, canJoin, type RoadInput } from './network';
import { railProfile, MAX_GRADE, STEP } from './railProfile';
import { layoutRail, TrainSim } from './rail';
import { layoutAirport, AirportSim } from './airport';
import { ZoneSim, type ZoneInput } from './zones';
import { SimWorld } from './world';
import { featuresToSim } from './data';
import type { P2 } from './geom';

const line = (id: string, cls: RoadInput['cls'], pts: P2[], extra: Partial<RoadInput> = {}): RoadInput => ({ id, cls, pts, ...extra });
const rect = (x: number, z: number, w: number, h: number): P2[] => [[x, z], [x + w, z], [x + w, z + h], [x, z + h]];

/** a small town: a street grid, an avenue, a highway above it, with homes, shops and works */
function town(): { roads: RoadInput[]; zones: ZoneInput[] } {
  const roads: RoadInput[] = [];
  for (let i = 0; i <= 8; i++) { roads.push(line('h' + i, 'street', [[0, i * 250], [2000, i * 250]])); roads.push(line('v' + i, 'street', [[i * 250, 0], [i * 250, 2000]])); }
  roads.push(line('ave', 'avenue', [[-300, 1000], [2300, 1000]]));
  roads.push(line('hwy', 'highway', [[1000, -500], [1000, 2500]]));
  const zones: ZoneInput[] = [
    { id: 'homes', kind: 'residential', pts: rect(0, 0, 900, 900) },
    { id: 'shops', kind: 'commercial', pts: rect(1100, 0, 800, 600) },
    { id: 'works', kind: 'industrial', pts: rect(1100, 1100, 900, 800) },
    { id: 'flats', kind: 'dense', pts: rect(0, 1100, 800, 800) },
    { id: 'lost', kind: 'residential', pts: rect(5000, 5000, 600, 600) },
  ];
  return { roads, zones };
}

test('roads: crossings become junctions, highways stay grade-separated from streets', () => {
  const g = buildRoadGraph([line('a', 'street', [[0, 0], [100, 0]]), line('b', 'street', [[50, -50], [50, 50]]), line('hw', 'highway', [[20, -80], [20, 80]])]);
  const j = g.nodes.find((n) => Math.abs(n.x - 50) < 1 && Math.abs(n.z) < 1)!;
  assert.ok(j, 'street crossing has a node');
  assert.equal(j.out.length, 4, 'four ways out');
  assert.ok(!g.nodes.some((n) => Math.abs(n.x - 20) < 1 && Math.abs(n.z) < 1), 'no junction where the highway passes over a street');
  assert.ok(canJoin('highway', 'avenue') && !canJoin('highway', 'street'));
});

test('roads: a short road ending near another joins it', () => {
  const g = buildRoadGraph([line('main', 'avenue', [[0, 0], [500, 0]]), line('side', 'street', [[250, 120], [250, 6]]), line('far', 'street', [[900, 0], [1500, 0]])]);
  const n = g.nodes.find((q) => Math.abs(q.x - 250) < 1 && Math.abs(q.z) < 1);
  assert.ok(n && n.out.length === 3, 'T junction created');
  const a = g.nearestNode(10, 0, 50)!, b = g.nearestNode(250, 100, 60)!;
  assert.ok(shortestPath(g, a.id, b.id), 'routed over the T');
});

test('roads: routing prefers the faster class', () => {
  const g = buildRoadGraph([
    line('slow', 'street', [[0, 0], [400, 0], [800, 0]]),
    line('fast', 'avenue', [[0, 0], [0, 60], [800, 60], [800, 0]]),
  ]);
  const from = g.nearestNode(0, 0, 5)!, to = g.nearestNode(800, 0, 5)!;
  const path = shortestPath(g, from.id, to.id)!;
  assert.ok(path.length >= 1);
  const slow = path.filter((e) => g.edges[e].cls === 'street').length, fast = path.filter((e) => g.edges[e].cls === 'avenue').length;
  assert.ok(fast > slow, 'took the avenue');
});

test('rail profile: bridge over a creek, tunnel under a river and through a hill, grade within 2.5 %', () => {
  // ground: a plain at 8 m with a 40 m creek at x 300, a 600 m river (bed -4 m) at x 3000 and a 90 m hill at x 5500..6100
  const ground = (x: number): number => (Math.abs(x - 300) < 20 ? -2 : Math.abs(x - 3000) < 300 ? -4 : x > 5500 && x < 6100 ? 120 : 8);
  const p = railProfile([[0, 0], [2000, 0], [4000, 0], [7500, 0]], (x) => ground(x));
  assert.ok(p.bridges.some((b) => b.water), 'creek is bridged');
  const iCreek = p.pts.findIndex((q) => q[0] >= 300);
  assert.ok(p.y[iCreek] > 12, 'deck above the creek: ' + p.y[iCreek]);
  const river = p.tunnels.find((t) => p.pts[t.from][0] < 2800 && p.pts[t.to][0] > 3200);
  assert.ok(river, 'river is tunnelled');
  const iRiver = p.pts.findIndex((q) => q[0] >= 3000);
  assert.ok(p.y[iRiver] < -10, 'tunnel below the river bed: ' + p.y[iRiver]);
  assert.ok(p.tunnels.some((t) => p.pts[t.from][0] > 5000), 'hill is tunnelled');
  let maxGrade = 0; for (let i = 1; i < p.y.length; i++) maxGrade = Math.max(maxGrade, Math.abs(p.y[i] - p.y[i - 1]) / STEP);
  assert.ok(maxGrade <= MAX_GRADE + 0.002, 'grade ' + maxGrade);
});

test('rail: stations snap, crossings found, gates close for trains and open after', () => {
  const roads = [line('r', 'street', [[2000, -300], [2000, 300]]), line('hw', 'highway', [[4000, -300], [4000, 300]])];
  const g = buildRoadGraph(roads);
  const net = layoutRail([{ id: 'L', kind: 'double', pts: [[0, 0], [3000, 0], [6000, 0]], service: 'passenger' }], [{ id: 's1', kind: 'station', x: 1500, z: 40 }, { id: 's2', kind: 'halt', x: 4500, z: -30 }], () => 20, g);
  assert.equal(net.crossings.length, 2);
  assert.ok(net.crossings.find((c) => c.roadClass === 'street')!.level);
  assert.ok(!net.crossings.find((c) => c.roadClass === 'highway')!.level, 'highway is over/under, no gates');
  assert.ok(net.lines[0].stops.length >= 4, 'two stations plus the two ends');
  const sim = new TrainSim(net);
  assert.ok(sim.trains.length >= 1);
  const cross = net.crossings.find((c) => c.level)!;
  let closedSeen = false, openAfter = false, stops = 0, last = '';
  for (let t = 0; t < 1800; t += 0.5) {
    sim.step(0.5);
    for (const tr of sim.trains) { if (tr.state === 'dwell' && last !== tr.state + tr.at) { stops++; } }
    if (cross.closed) closedSeen = true; else if (closedSeen) openAfter = true;
    for (const tr of sim.trains) assert.ok(tr.s >= -1 && tr.s <= net.lines[0].profile.len + 1, 'train stays on the line');
  }
  assert.ok(closedSeen && openAfter, 'gates close and open again');
  assert.ok(stops >= 2, 'trains stop at stations');
});

test('rail: single track never has two trains in one block', () => {
  const net = layoutRail([{ id: 'S', kind: 'single', pts: [[0, 0], [7000, 0]], service: 'mixed' }], [{ id: 'a', kind: 'station', x: 3500, z: 0 }], () => 10, null);
  const sim = new TrainSim(net, 5);
  for (let t = 0; t < 3600; t += 1) {
    sim.step(1);
    const blocks = new Map<number, number>();
    for (const tr of sim.trains) {
      if (tr.state !== 'run') continue;
      const key = Math.min(tr.at, tr.to);
      blocks.set(key, (blocks.get(key) ?? 0) + 1);
    }
    for (const n of blocks.values()) assert.ok(n <= 1, 'two trains running in the same block at t=' + t);
  }
  assert.ok(sim.trains.some((t) => t.s !== 0));
});

test('airport: layout, then arrivals land, taxi, park, and depart without sharing the runway', () => {
  const L = layoutAirport([
    { id: 'r', kind: 'runway', pts: [[4000, 0], [1400, 0]] },
    { id: 'a', kind: 'apron', pts: rect(2000, -330, 1000, 150) },
    { id: 't', kind: 'terminal', pts: rect(2100, -420, 800, 70) },
  ], 30)!;
  assert.ok(L, 'layout');
  assert.ok(L.gates.length >= 5);
  assert.ok(L.taxiways.length >= 3);
  assert.ok(L.vz < 0, 'apron is on the -z side');
  const sim = new AirportSim(L, 4);
  const seen = new Set<string>();
  let departed = 0;
  for (let t = 0; t < 1800; t += 0.5) {
    sim.step(0.5);
    const onRwy = sim.planes.filter((p) => p.state === 'takeoff' || p.state === 'rollout' || (p.state === 'approach' && p.u > -300) || (p.state === 'climb' && p.u < L.len));
    assert.ok(onRwy.length <= 1, `runway shared at t=${t}: ${onRwy.map((p) => p.state).join(',')}`);
    for (const p of sim.planes) seen.add(p.state);
    for (const p of sim.planes) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.alt));
  }
  for (const s of ['approach', 'rollout', 'taxi_in', 'parked', 'taxi_out', 'takeoff', 'climb']) assert.ok(seen.has(s), 'saw ' + s);
  void departed;
});

test('zones: served zones grow with demand, unserved ones do not, services raise land value', () => {
  const { roads, zones } = town();
  const g = buildRoadGraph(roads);
  const without = new ZoneSim(zones, [], g);
  const withSvc = new ZoneSim(zones, [{ id: 'f', kind: 'fire', x: 450, z: 450 }, { id: 'p', kind: 'police', x: 450, z: 450 }, { id: 's', kind: 'school', x: 450, z: 450 }], g);
  const homes = (z: ZoneSim) => z.zones.find((q) => q.id === 'homes')!;
  assert.ok(homes(withSvc).landValue > homes(without).landValue, 'fire/police/school raise land value');
  const lost = without.zones.find((q) => q.id === 'lost')!;
  assert.equal(lost.access, 0, 'no road, no access');
  const before = lost.level; without.step(86400 * 3);
  assert.ok(lost.level <= before, 'an unserved zone does not grow');
  assert.ok(homes(without).anchors.length > 0);
  assert.ok(Math.abs(without.demand.R) <= 1 && Math.abs(without.demand.C) <= 1 && Math.abs(without.demand.I) <= 1);
  // more shops than people can feed: commercial demand falls
  const flat = new ZoneSim([{ id: 'x', kind: 'commercial', pts: rect(0, 0, 900, 900) }], [], g);
  flat.step(60 * 60 * 24);
  assert.ok(flat.demand.C < 0.2, 'shops without customers have little demand: ' + flat.demand.C);
});

test('world: commuters travel along the network, keep their gaps, and the morning is busier than the night', () => {
  const { roads, zones } = town();
  const w = new SimWorld({ roads, zones, services: [], seed: 7, maxCars: 120, dayLength: 600, startHour: 7.5 });
  w.setFocus(1000, 1000);
  assert.ok(w.graph.stats.mainEdges > 50);
  let peak = 0, minGap = Infinity;
  for (let i = 0; i < 20 * 60 * 3; i++) {
    w.step(1 / 20);
    peak = Math.max(peak, w.cars.length);
    // cars in one lane keep a positive gap
    const by = new Map<string, typeof w.cars>();
    for (const c of w.cars) { const k = c.path[c.pi] + ':' + c.lane; const a = by.get(k) ?? []; a.push(c); by.set(k, a); }
    for (const a of by.values()) { a.sort((p, q) => p.s - q.s); for (let k = 1; k < a.length; k++) minGap = Math.min(minGap, a[k].s - a[k - 1].s - (a[k].len + a[k - 1].len) / 2); }
  }
  assert.ok(w.stats.spawned > 40, 'cars spawned: ' + w.stats.spawned);
  assert.ok(w.stats.arrived > 10, 'cars arrive: ' + w.stats.arrived);
  assert.ok(peak > 30);
  assert.ok(minGap > -2.5, 'no car drives through another: ' + minGap);
  assert.ok(w.stats.trips.out > 0);
  assert.ok(SimWorld.activity(7.7).level > SimWorld.activity(3).level * 2);
  assert.ok(w.busyEdges() > 0);
  for (const c of w.cars) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.yaw));
});

test('world: cars wait at a closed level crossing', () => {
  const roads = [line('r', 'collector', [[0, 0], [3000, 0]])];
  roads.push(line('side', 'collector', [[0, 0], [0, 1500]]));
  const g = buildRoadGraph(roads);
  const net = layoutRail([{ id: 'L', kind: 'single', pts: [[1500, -2000], [1500, 2000]], service: 'passenger' }], [], () => 10, g);
  assert.equal(net.crossings.filter((c) => c.level).length, 0 + net.crossings.filter((c) => c.level).length);
  // the rail runs north-south at x=1500 but the road is at z=0; the road crosses it
  const w = new SimWorld({ roads: [...roads, line('x', 'collector', [[0, 1500], [3000, 1500]])], zones: [{ id: 'a', kind: 'residential', pts: rect(0, -200, 800, 400) }, { id: 'b', kind: 'commercial', pts: rect(2200, -200, 800, 400) }, { id: 'c', kind: 'dense', pts: rect(2200, 1300, 800, 400) }], services: [], rail: net, seed: 3, maxCars: 60, startHour: 7.7 });
  assert.ok(w.trains);
  let sawClosed = false, maxOver = 0;
  for (let i = 0; i < 20 * 900; i++) {
    w.step(1 / 20);
    for (const c of net.crossings) if (c.closed && c.level) {
      sawClosed = true;
      for (const car of w.cars) if (car.path[car.pi] === c.edge || car.path[car.pi] === c.twin) {
        const sc = car.path[car.pi] === c.edge ? c.edgeS : c.twinS;
        if (car.s > sc - 5 && car.s < sc + 5 && car.v > 4) maxOver++;
      }
    }
  }
  assert.ok(sawClosed, 'a crossing closed');
  assert.ok(maxOver < 25, 'cars do not run through closed gates: ' + maxOver);
});

test('data: user_map features convert, old files without the new types still load', () => {
  const s = featuresToSim({ version: 1, features: [
    { id: '1', type: 'road', kind: 'highway', name: '', note: '', pts: [[0, 0], [10, 10]] },
    { id: '2', type: 'zone', kind: 'dense', name: '', note: '', pts: [[0, 0], [10, 0], [10, 10]] },
    { id: '3', type: 'rail', kind: 'double', name: 'Main', note: '', pts: [[0, 0], [100, 0]] },
    { id: '4', type: 'station', kind: 'halt', name: 'X', note: '', pts: [[50, 0]] },
    { id: '5', type: 'airport', kind: 'runway', name: '', note: '', pts: [[0, 0], [2000, 0]] },
    { id: '6', type: 'service', kind: 'fire', name: '', note: '', pts: [[5, 5]] },
    { id: '7', type: 'road', kind: 'creek', name: '', note: '', pts: [[0, 0], [10, 10]] },
  ] }, { city: [{ c: 'arterial', p: [[0, 0], [5, 5]] }], shoreline: { xz: [[0, 0], [9, 9]] } });
  assert.equal(s.roads.length, 3); assert.equal(s.zones.length, 1); assert.equal(s.rails[0].kind, 'double');
  assert.equal(s.stations.length, 1); assert.equal(s.airport.length, 1); assert.equal(s.services.length, 1);
  assert.equal(featuresToSim(null).roads.length, 0);
});
