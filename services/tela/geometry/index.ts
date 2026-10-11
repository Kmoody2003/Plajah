// geometry — Plajah's vector geometry engine (Illustrator-grade core) for Tela.
// See docs/tela/GEOMETRY_ENGINE.md. Pure TypeScript, no DOM, runs in node and browser.
export * from './vec';
export * from './model';
export * from './pathData';
export * from './shapes';
export * as bezier from './bezier';
export { pathBounds, pathLength, flattenPath, flattenSubpath, arcTable, pointAtLength, nearest } from './bezier';
export * from './intersect';
export * from './boolean';
export * from './offset';
export * from './stroke';
export * from './fit';
export * as affine from './transform';
export { transformPath, translatePath, transformEach, align, distribute, parseTransform } from './transform';
export * from './pathOps';
export * from './brushes';
export * from './color';
export * from './paint';
export { MATERIALS, materialFilter, material } from './materials/filters';
export * from './clip';
export * from './tela';
export * from './scene';
export { objectToSvg, objectsToSvg, deviceToSvg } from './serialize';
export { importSvg } from './svgImport';
export * from './hittest';
export * as procedural from './procedural';
