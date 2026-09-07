type Health = { message: string; updated: number };
const records = new Map<string,Health>();
const listeners = new Set<()=>void>();
export function reportMediaHealth(id: string, message: string) {
  if (!id || records.get(id)?.message === message) return;
  records.set(id,{message,updated:Date.now()});listeners.forEach(fn=>fn());
}
export function mediaHealth(id: string) { return records.get(id); }
export function subscribeMediaHealth(fn:()=>void) { listeners.add(fn);return ()=>{listeners.delete(fn);}; }
