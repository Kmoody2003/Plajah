// Rift Realm — a faster shader precompile for loading screens.
//
// three r184's Renderer.compileAsync() handles objects strictly one after another: it builds an object's shader
// nodes (yielding to the main thread after every build stage), then WAITS for that object's GPU pipeline to finish
// compiling before it touches the next object, then yields again. With hundreds of pipelines that serialises every
// driver compile, and each yield is a scheduler/rAF turn (a hidden tab runs those about once a second), so the
// Elderwood Wilds spent minutes in "[wilds] compiling".
//
// installFastCompile(renderer) swaps that loop for: build every object's nodes synchronously in time slices
// (~20 ms of work, then a MessageChannel yield, which hidden tabs don't throttle), start ALL pipeline compiles at
// once (the browser compiles them in parallel off the main thread), then wait for them together. The project /
// render-list half of compileAsync is three's own code, untouched: we only collect the work items it queues.
// Progress is reported per object built and per pipeline finished, so a loading bar can follow it.
// Anything unexpected (a three upgrade renaming the private members) falls back to three's own path.
import type * as THREE from 'three/webgpu';

export interface CompileProgress { built: number; objects: number; ready: number; pipelines: number }
type Item = {
  object: THREE.Object3D & { geometry: THREE.BufferGeometry }; material: THREE.Material; scene: THREE.Scene; camera: THREE.Camera;
  lightsNode: unknown; group: unknown; clippingContext: unknown; passId: unknown; renderContext: unknown;
};
// the private members of three's Renderer this relies on (r184)
type R = {
  compileAsync: (scene: THREE.Object3D, camera: THREE.Camera, targetScene?: THREE.Scene | null) => Promise<void>;
  _compilationPromises: unknown[] | null; _currentRenderContext: unknown;
  _createObjectPipeline: (...a: unknown[]) => void;
  _objects: { get: (...a: unknown[]) => { drawRange: unknown; group: unknown } };
  _geometries: { updateForRender: (ro: unknown) => void };
  _nodes: { getForRender: (ro: unknown) => unknown; updateBefore: (ro: unknown) => void; updateForRender: (ro: unknown) => void; updateAfter: (ro: unknown) => void };
  _bindings: { updateForRender: (ro: unknown) => void };
  _pipelines: { getForRender: (ro: unknown, promises: Promise<unknown>[] | null) => unknown };
  __rrQueue?: Item[] | null;
};

const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const waiting: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => waiting.shift()?.();
/** Give the main thread back for a moment (input, CSS, the progress bar) without timer throttling. */
export const yieldFast = () => new Promise<void>((r) => { if (!channel) { setTimeout(r, 0); return; } waiting.push(r); channel.port2.postMessage(0); });

/** Totals across every compile since install (the loading screen reads these). */
export const compileStats = { built: 0, objects: 0, ready: 0, pipelines: 0, ms: 0, calls: 0 };

let onProgress: ((p: CompileProgress) => void) | undefined;
/** Install once (the menus do it for the pedestal); a later call only swaps the progress listener (the loading screen). */
export function installFastCompile(renderer: THREE.WebGPURenderer, progress?: (p: CompileProgress) => void) {
  onProgress = progress;
  const r = renderer as unknown as R;
  const proto = Object.getPrototypeOf(r) as R;
  const ok = typeof proto._createObjectPipeline === 'function' && typeof proto.compileAsync === 'function' && !!r._objects && !!r._nodes && !!r._pipelines;
  if (!ok || (r as { __rrFast?: boolean }).__rrFast) return;
  (r as { __rrFast?: boolean }).__rrFast = true;
  const original = proto.compileAsync;

  // while one of our compiles projects the scene, three's pipeline step queues its work item with us
  r._createObjectPipeline = function (this: R, object, material, scene, camera, lightsNode, group, clippingContext, passId) {
    if (this.__rrQueue && this._compilationPromises !== null) {
      this.__rrQueue.push({ object, material, scene, camera, lightsNode, group, clippingContext, passId, renderContext: this._currentRenderContext } as Item);
      return;
    }
    return proto._createObjectPipeline.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
  } as R['_createObjectPipeline'];

  r.compileAsync = async function (this: R, scene: THREE.Object3D, camera: THREE.Camera, targetScene: THREE.Scene | null = null) {
    const t0 = performance.now();
    const queue: Item[] = [];
    // three's projection half runs synchronously up to its (now empty) work loop, so the queue is ours alone
    const prev = this.__rrQueue; this.__rrQueue = queue;
    let projected: Promise<void>;
    try { projected = original.call(this, scene, camera, targetScene); } finally { this.__rrQueue = prev ?? null; }
    await projected;
    compileStats.calls++;
    compileStats.objects += queue.length;
    const pending: Promise<unknown>[] = [];
    const report = () => onProgress?.({ built: compileStats.built, objects: compileStats.objects, ready: compileStats.ready, pipelines: compileStats.pipelines });
    let slice = performance.now();
    for (const it of queue) {
      try {
        const ro = this._objects.get(it.object, it.material, it.scene, it.camera, it.lightsNode, it.renderContext, it.clippingContext, it.passId);
        ro.drawRange = it.object.geometry.drawRange;
        ro.group = it.group;
        this._geometries.updateForRender(ro);
        this._nodes.getForRender(ro); // the shader: synchronous build (cached per material key)
        this._nodes.updateBefore(ro);
        this._nodes.updateForRender(ro);
        this._bindings.updateForRender(ro);
        const before = pending.length;
        this._pipelines.getForRender(ro, pending); // starts the GPU compile; does not wait for it
        for (let k = before; k < pending.length; k++) {
          compileStats.pipelines++;
          pending[k] = pending[k].then(() => { compileStats.ready++; }, () => { compileStats.ready++; });
        }
        this._nodes.updateAfter(ro);
      } catch (e) { console.warn('[load] precompile skipped an object', e); }
      compileStats.built++;
      if (performance.now() - slice > 20) { report(); await yieldFast(); slice = performance.now(); }
    }
    report();
    // the pipelines compile in parallel; tick the progress while they land
    let left = pending.length;
    if (left) await new Promise<void>((res) => { for (const p of pending) p.then(() => { left--; if (left % 8 === 0) report(); if (!left) res(); }); });
    report();
    compileStats.ms += performance.now() - t0;
  } as typeof proto.compileAsync;
}

/**
 * Compile everything in the scene, not only what the camera sees now (three culls by the frustum while compiling),
 * so walking into new areas doesn't hitch on first sight. Meant for after the first frame, in the background.
 */
export async function compileEverything(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const culled: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
  try { await renderer.compileAsync(scene, camera); }
  finally { for (const o of culled) o.frustumCulled = true; }
}

/**
 * Walk one real frame (shadow maps, post passes, everything three only compiles when it first draws) with every
 * render pipeline created asynchronously and nothing drawn (three skips draws whose pipeline isn't ready), then wait
 * for those pipelines together. The real first frame after it finds them all cached instead of compiling them one
 * by one on the GPU while the page hangs. `draw` renders the frame the way the game does (post or plain render).
 */
export async function warmFrame(renderer: THREE.WebGPURenderer, draw: () => void, progress?: (ready: number, total: number) => void) {
  const r = renderer as unknown as { _pipelines?: { updateForRender: (ro: unknown) => void; getForRender: (ro: unknown, p: Promise<unknown>[] | null) => unknown } };
  const pipes = r._pipelines;
  if (!pipes || typeof pipes.getForRender !== 'function') { draw(); return 0; }
  const pending: Promise<unknown>[] = [];
  const own = Object.prototype.hasOwnProperty.call(pipes, 'updateForRender');
  const before = pipes.updateForRender;
  pipes.updateForRender = function (ro: unknown) { pipes.getForRender.call(this, ro, pending); };
  try { draw(); } finally { if (own) pipes.updateForRender = before; else delete (pipes as { updateForRender?: unknown }).updateForRender; }
  let done = 0;
  progress?.(0, pending.length);
  await Promise.all(pending.map((p) => p.catch(() => undefined).then(() => { done++; if (done % 4 === 0) progress?.(done, pending.length); })));
  progress?.(pending.length, pending.length);
  return pending.length;
}
