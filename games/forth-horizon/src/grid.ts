// The world's height grid is no longer assumed to be centred on the origin: GRID.ox/oz is the world position of the grid's centre (height2.json "ox", "oz",
// default 0). Every world<->grid conversion adds it, so the map can grow in any direction (2026-11-18: 10 km north for wine country and the Superior Range)
// without moving a single existing coordinate.
export const GRID = { ox: 0, oz: 0 };
