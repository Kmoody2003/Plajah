/** ESPN returns a competitor `score` as a STRING on scoreboard endpoints but as
 *  an OBJECT `{ value, displayValue }` on schedule/standings endpoints. Rendering
 *  that object as a React child throws minified React error #31 and takes down
 *  the page. Always coerce scores through this before rendering. */
export const scoreText = (s: unknown): string =>
  s && typeof s === 'object'
    ? String((s as any).displayValue ?? (s as any).value ?? '')
    : s == null ? '' : String(s);
