// Dieline path helpers: absolute M/L/C/Z path data in inches (the only commands wrap.ts emits).

/** Parse absolute M/L/C/Z path data into commands (inches). */
export function parsePath(d: string): Array<{ op: 'M' | 'L' | 'C' | 'Z'; pts: number[] }> {
  const out: Array<{ op: 'M' | 'L' | 'C' | 'Z'; pts: number[] }> = [];
  const re = /([MLCZ])([^MLCZ]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const op = m[1].toUpperCase() as 'M' | 'L' | 'C' | 'Z';
    const nums = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    const n = op === 'C' ? 6 : op === 'Z' ? 0 : 2;
    if (!n) { out.push({ op, pts: [] }); continue; }
    for (let i = 0; i + n <= nums.length; i += n) out.push({ op: i === 0 || op !== 'M' ? op : 'L', pts: nums.slice(i, i + n) });
  }
  return out;
}

/** Shift an absolute M/L/C/Z path by (dx, dy) inches. */
export function translatePath(d: string, dx: number, dy: number): string {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return parsePath(d).map(c => c.op === 'Z' ? 'Z' : `${c.op} ${c.pts.map((v, i) => r(v + (i % 2 ? dy : dx))).join(' ')}`).join(' ');
}
