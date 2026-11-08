// occt-import-js ships no types; the shape we use is OcctApi in services/cad/step.ts.
declare module 'occt-import-js' {
  const factory: (opts?: { locateFile?: (path: string) => string }) => Promise<import('../services/cad/step').OcctApi>;
  export default factory;
}
