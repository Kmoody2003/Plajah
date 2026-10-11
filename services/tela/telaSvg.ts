// telaSvg — serialize Tela vector objects to an SVG string.
//
// Now a thin re-export of the canonical serializer in services/tela/geometry/serialize.ts,
// which is byte-identical for every object without engine finish (`geom`) — proven over the
// whole template gallery by tests/geometrySerialize.test.ts against a frozen copy of the old
// implementation (tests/fixtures/legacyTelaSvg.ts) — and additionally renders fill rules,
// engine paints, stroke styles, materials and clips. Import from here or from the engine.
export { objectToSvg, objectsToSvg, type SvgOptions } from './geometry/serialize';
