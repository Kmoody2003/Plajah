// Verovio (RISM, LGPLv3) ships no TypeScript types — declare the entry points we use so
// the lazy dynamic imports type-check cleanly. We drive it through a thin `any` surface.
declare module 'verovio/wasm' {
  const createVerovioModule: (moduleArg?: any) => Promise<any>;
  export default createVerovioModule;
}
declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: any);
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page: number, options?: any): string;
    renderToMIDI(): string;
    setOptions(options: any): void;
  }
}
