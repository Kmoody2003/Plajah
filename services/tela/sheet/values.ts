// values — the runtime value types of the Tela sheet engine.
//
// A formula evaluates to a Value: a Scalar (number, string, boolean, error, or
// blank), a Matrix (dynamic-array result), a Ref (a reference not yet
// dereferenced, so ROW/OFFSET/INDEX/ISBLANK/SUBTOTAL can see cells rather than
// values), or a Lambda. Errors are interned singletons so `===` works and the
// hot path never allocates for them.

export type ErrorCode =
  | '#NULL!' | '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#NUM!' | '#N/A'
  | '#GETTING_DATA' | '#SPILL!' | '#CONNECT!' | '#BLOCKED!' | '#UNKNOWN!' | '#FIELD!' | '#CALC!';

export class CellError {
  constructor(public readonly code: ErrorCode, public readonly detail?: string) {}
  toString() { return this.code; }
}

const mk = (c: ErrorCode) => new CellError(c);
export const ERR = {
  NULL: mk('#NULL!'), DIV0: mk('#DIV/0!'), VALUE: mk('#VALUE!'), REF: mk('#REF!'), NAME: mk('#NAME?'),
  NUM: mk('#NUM!'), NA: mk('#N/A'), DATA: mk('#GETTING_DATA'), SPILL: mk('#SPILL!'), CONNECT: mk('#CONNECT!'),
  BLOCKED: mk('#BLOCKED!'), UNKNOWN: mk('#UNKNOWN!'), FIELD: mk('#FIELD!'), CALC: mk('#CALC!'),
} as const;

export const ERROR_CODES: ErrorCode[] = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA', '#SPILL!', '#CONNECT!', '#BLOCKED!', '#UNKNOWN!', '#FIELD!', '#CALC!'];
const BY_CODE = new Map<string, CellError>(Object.values(ERR).map(e => [e.code, e]));
export const errorFromCode = (code: string): CellError | null => BY_CODE.get(code.toUpperCase()) ?? null;
/** ERROR.TYPE numbering. */
export const errorTypeNumber = (e: CellError) => ERROR_CODES.indexOf(e.code) + 1;

/** null is the blank cell. */
export type Scalar = number | string | boolean | CellError | null;

export class Matrix {
  constructor(public readonly data: Scalar[][]) {}
  get rows() { return this.data.length; }
  get cols() { return this.data.length ? this.data[0].length : 0; }
  get(r: number, c: number): Scalar { return this.data[r]?.[c] ?? null; }
  static fill(rows: number, cols: number, v: Scalar = null) {
    const d: Scalar[][] = new Array(rows);
    for (let r = 0; r < rows; r++) d[r] = new Array(cols).fill(v);
    return new Matrix(d);
  }
  static col(values: Scalar[]) { return new Matrix(values.map(v => [v])); }
  static row(values: Scalar[]) { return new Matrix([values]); }
}

export interface Area { r1: number; c1: number; r2: number; c2: number }

/** A live reference. `sheet` is the engine's sheet index; `ext` names an external grid. */
export class Ref {
  constructor(public readonly sheet: number, public readonly areas: Area[], public readonly ext?: string) {}
  get single() { return this.areas.length === 1 ? this.areas[0] : null; }
  get isCell() { const a = this.single; return !!a && a.r1 === a.r2 && a.c1 === a.c2; }
  get rows() { const a = this.areas[0]; return a.r2 - a.r1 + 1; }
  get cols() { const a = this.areas[0]; return a.c2 - a.c1 + 1; }
}

export class Lambda {
  constructor(
    public readonly params: string[],
    public readonly invoke: (args: Value[]) => Value,
  ) {}
}

/** Marker for an omitted argument: `=IF(A1,,2)`. */
export const OMITTED: unique symbol = Symbol('omitted');
export type Omitted = typeof OMITTED;

export type Value = Scalar | Matrix | Ref | Lambda | Omitted;

export const isErr = (v: unknown): v is CellError => v instanceof CellError;
export const isMatrix = (v: unknown): v is Matrix => v instanceof Matrix;
export const isRef = (v: unknown): v is Ref => v instanceof Ref;
export const isLambda = (v: unknown): v is Lambda => v instanceof Lambda;

/** Excel keeps 15 significant digits. Round the binary noise off a result. */
export function round15(n: number): number {
  if (!Number.isFinite(n) || n === 0 || Number.isInteger(n)) return n;
  return Number(n.toPrecision(15));
}

/** Plain-JSON form of a computed scalar for persistence (cached values). */
export type StoredScalar = number | string | boolean | { e: string } | null;
export const toStored = (v: Scalar): StoredScalar => (v instanceof CellError ? { e: v.code } : v);
export const fromStored = (v: StoredScalar | undefined): Scalar => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return errorFromCode(v.e) ?? ERR.VALUE;
  return v;
};
