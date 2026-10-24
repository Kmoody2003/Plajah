/// <reference lib="webworker" />
// workerImportScripts — lets MediaPipe tasks run inside MODULE workers.
//
// MediaPipe loads its WASM glue with importScripts(), which module workers forbid ("Module scripts
// don't support importScripts()"), so createFromOptions always failed in our workers and every
// caller fell back to the blocking main-thread trackers (~11 Hz). This stands in for it: fetch
// synchronously and run the script in global scope — what importScripts does in a classic worker.
// Import it (for its side effect) at the top of a worker, before MediaPipe is loaded.

(self as any).importScripts = (...urls: string[]) => {
  for (const u of urls) {
    const x = new XMLHttpRequest();
    x.open('GET', u, false);
    x.send();
    if (x.status >= 400) throw new Error(`importScripts ${x.status} ${u}`);
    (0, eval)(`${x.responseText}\n//# sourceURL=${u}`);
  }
};

export {};
