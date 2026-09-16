export interface CubeLutData { id: string; name: string; size: number; bytes: number[]; strength: number; }

/** Strict, serializable 3D .cube parser shared by import, preview and export. */
export function parseCubeLut(text: string, name = 'Imported LUT', id = `lut-${Date.now()}`): CubeLutData {
  let size = 0; const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^(TITLE|DOMAIN_)/i.test(line)) continue;
    const match = line.match(/^LUT_3D_SIZE\s+(\d+)/i);
    if (match) { size = Number(match[1]); continue; }
    if (/^LUT_1D_SIZE/i.test(line)) throw new Error('Fabula currently requires a 3D .cube LUT.');
    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) values.push(...parts);
  }
  if (size < 2 || size > 65) throw new Error('Invalid or unsupported LUT_3D_SIZE (2–65).');
  if (values.length !== size ** 3 * 3) throw new Error(`Expected ${size ** 3} RGB entries, found ${values.length / 3}.`);
  return { id, name, size, strength: 1, bytes: values.map((value) => Math.max(0, Math.min(255, Math.round(value * 255)))) };
}
