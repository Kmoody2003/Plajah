# Tela sheet engine

Wave-1 engine for the Grid device (see `GAUNTLET.md`). It is pure TypeScript in `services/tela/sheet/**`, with no UI and no new dependencies. `fflate`, which the project already uses, handles the xlsx zip. The Grid UI in wave 2 builds on the API below.

Tests: `npm run test:sheet` runs 76 tests in 7 files.

## Decision: GridCraft as reference and oracle, not a dependency

We evaluated [storytold/gridcraft](https://github.com/storytold/gridcraft) at rev `9f896c1249f40d18bf182199dc03042959be5f3f` (v0.5.0, 2026-10-10). It is MIT OR Apache-2.0 and pure Rust, with an alpha UI.

- **Wasm.** It builds to wasm. The calc, xlsx and numfmt crates and their dependencies compiled to `wasm32-unknown-unknown` with no changes in about 2 minutes. Only `apps/gridcraft` and `crates/ui-egui` have a `build.rs`, and we would not use either.
- **Maturity.** Its own ROADMAP says "Stage: alpha", with 501 of 523 functions present and 492 working.
- **Ownership.** Kenne decided that GridCraft is a reference and test oracle only. No crate is added and no code is vendored. The reason is that Tela integrates deeply with Fabula and The Post Man, and nothing may make that harder. So there is **no NOTICE entry**, because nothing was adopted.

The evidence would have supported this choice anyway:

- **Correctness.** A scratch oracle linked `gridcraft-calc` natively in the scratchpad. It is not in the repo.
  - It agreed with every one of our 416 Excel-verified cases in `tests/sheetFixtures.ts`.
  - On 293 extra edge formulas there were 11 differences. Eight were our bugs and are now fixed:
    - `TEXT(0.5,"# ?/?")` must be `" 1/2"`.
    - `TEXT(-0.001,"0.00")` must be `"-0.00"`.
    - A format section with no digit placeholders shows only its literal.
    - `TEXT(x,"General")` is 11 characters.
    - `(-8)^(1/3)` is `#NUM!`.
    - `YEAR("2026-02-29")` is `#VALUE!`.
    - `BINOM.DIST.RANGE` was missing.
  - Three differences remain, and on those we follow Excel 365's documentation rather than GridCraft:
    - `CHOOSE({1,2},…)` spills.
    - `TEXTBEFORE(…,match_end=1)` treats the end of the text as a delimiter.
    - `RANDARRAY` is random, so it cannot match.
- **xlsx fidelity.** GridCraft's independent reader opened our exported xlsx with no warnings and recalculated it to the same values. The one exception is `_xlfn.SINGLE` (our `@`), which GridCraft does not evaluate. Its function list also confirmed one file-format fact we had wrong: only FILTER and SORT take `_xlfn._xlws.`.
- **Performance.** The TS engine recalculates 100k formulas in about 120 ms, inside the same JS heap as the UI. There is no per-cell wasm boundary and no second copy of the workbook to keep in sync.

## Architecture

| File | Role |
|---|---|
| `model.ts` | Persisted JSON `Workbook` / `Sheet` / `Cell` / `CellStyle`, CF/DV/filter/table types, grid helpers, legacy migration |
| `address.ts`, `values.ts` | A1 helpers. Runtime values: `Scalar`, `CellError` (interned), `Matrix`, `Ref`, `Lambda`, `OMITTED` |
| `parser.ts`, `ast.ts`, `serialize.ts` | Tokenizer with positions, Pratt parser, serializer, ref transforms (copy, insert/delete, move, sheet rename/delete, R1C1) |
| `coerce.ts` | Excel coercion, comparison, criteria (`">=5"`, wildcards), broadcasting |
| `functions/*` | Registry plus categories: math, stat, logical, lookup, text, date, financial, info, engineering, database. `statcore.ts` holds the numerics |
| `engine.ts` | Compiler (AST → closures), dependency graph, incremental recalc, spills, cycles, external resolver |
| `numfmt.ts`, `dates.ts` | Number-format engine and input guessing. 1900 serials, including the leap-year bug |
| `ops.ts`, `fill.ts` | Pure operations that return `{workbook, patch}`. Autofill, sort, filter, find/replace |
| `conditional.ts` | Conditional-format visuals and data-validation checks |
| `clipboard.ts`, `csv.ts`, `xlsx.ts`, `xml.ts` | I/O |
| `tela.ts` | Legacy grids, Tela resolver (`GridName!A1`, `SUM(Base.field)`, `COUNT(Base)`), chart access |

### Model

`Workbook = { version, sheets, names, styles, activeSheet, calc?, date1904? }`.

`Sheet.cells` is a sparse grid `cells[row][col]`, 0-based, with numeric-string keys. The first version used a flat A1-keyed record, and it was dropped. V8 turns a 300k-key string record into a dictionary, and one `{...spread}` of it took about 750 ms, so every edit paid that. Integer-keyed rows stay in fast element storage and copy one row per edit. The engine diffs on row identity.

`Cell = { v?: literal, f?: formula without '=', c?: cached value, s?: style id, link?, note? }`.

`styles[0]` is always `{}`. Styles are interned, so cells share ids.

The model is Firestore-safe:
- There are no `undefined` fields; use `clean()`.
- There are no nested arrays.
- Merges and ranges are A1 strings.

`TelaGridDevice.workbook?` is the one field added to `types.ts`. Legacy `cells` remains the fallback view.

### Engine

**Compiling.** Each formula compiles once to a closure. Plain local refs in operators read cells directly, with no `Ref` allocation.

**Precedents.** There are two indexes:
- Single cells: a key → dependents map.
- Ranges: one segment tree over 8-row blocks per column. Wide ranges (more than 32 columns) go in a per-sheet set.

Identical ranges share one entry. For example, 10k VLOOKUPs into `$A$1:$B$10000` cost one index entry. Finding the dependents of a cell is O(log rows), with no scan of all ranges.

**Recalculation is pull-based.** Reading a dirty precedent computes it first, with recursion up to depth 48. Beyond that, a `NeedDep` signal hands over to an explicit stack, so 50k chains in either direction are safe. Only dirty cells and volatile cells are computed: RAND, NOW, OFFSET, INDIRECT, CELL and INFO.

**Dynamic arrays.**
- Results spill into empty cells.
- A blocked spill gives `#SPILL!` and re-spills when the blocker is cleared.
- `A1#` references a spill.
- `@` is implicit intersection.
- Lifted functions broadcast over arrays, for example `=LEN(A1:A5)` and `=A1:A3*2`.
- When a spill grows, the readers of the cells it newly covers are recomputed in an extra pass.

**Circular references.** Cycles are detected and reported by `getCircularRefs()`, and their cells show 0, as in Excel. When `workbook.calc.iterative` is set, they are iterated instead.

**Range values.** Range matrices are cached for each pass. Whole-column aggregates are clamped to the sheet's used extent.

**Cross-sheet references.** These work, including 3D refs (`Sheet1:Sheet3!A1`), defined names (sheet-scoped too, including LAMBDA names), and structured refs (`Table[Col]`, `[#All]`, `[@Col]`).

**External resolver** (`ExternalResolver`):
- `sheet(name)` serves other Grids.
- `table(name, column)` serves Base columns.
- `aggregate(fn, name, column)` keeps the legacy semantics, where `COUNT(Base)` is the row count.
- `name(n)` covers any other unknown name.

### Excel semantics covered

- **Literals and errors.** All 14 error codes. Errors propagate.
- **Blanks.** A blank is 0, `""` or `FALSE` depending on context.
- **Text to number.** `"3"+1` is 4. `"$1,000"`, `"50%"`, dates and times all coerce.
- **Comparison.** Numbers < text < logicals, and text comparison is case-insensitive.
- **Snapping.** Tiny binary noise on `+` and `-` is snapped to 0, so `0.1+0.2-0.3` is 0.
- **Display.** 15 significant digits.
- **Rounding.** Half away from zero, after fixing 15-digit noise, so `ROUND(2.675,2)` is 2.68.
- **Precedence.** Unary minus binds tighter than `^`, and `^` is left-associative: `-2^2` is 4 and `2^3^2` is 64.

## Function library: 432 names

That is 391 implementations plus 41 legacy and modern aliases. The registry carries `{name, category, sig, desc, min, max, volatile}` for autocomplete; use `listFunctions()` and `suggestFunctions('xl')`.

- **math** (81): ABS, ACOS, ACOSH, ACOT, ACOTH, AGGREGATE, ARABIC, ASIN, ASINH, ATAN, ATAN2, ATANH, BASE, CEILING, CEILING.MATH, CEILING.PRECISE, COMBIN, COMBINA, COS, COSH, COT, COTH, CSC, CSCH, DECIMAL, DEGREES, EVEN, EXP, FACT, FACTDOUBLE, FLOOR, FLOOR.MATH, FLOOR.PRECISE, GCD, INT, ISO.CEILING, LCM, LN, LOG, LOG10, MDETERM, MINVERSE, MMULT, MOD, MROUND, MULTINOMIAL, MUNIT, ODD, PI, POWER, PRODUCT, QUOTIENT, RADIANS, RAND, RANDARRAY, RANDBETWEEN, ROMAN, ROUND, ROUNDDOWN, ROUNDUP, SEC, SECH, SEQUENCE, SERIESSUM, SIGN, SIN, SINH, SQRT, SQRTPI, SUBTOTAL, SUM, SUMIF, SUMIFS, SUMPRODUCT, SUMSQ, SUMX2MY2, SUMX2PY2, SUMXMY2, TAN, TANH, TRUNC
- **stat** (145): AVEDEV, AVERAGE, AVERAGEA, AVERAGEIF, AVERAGEIFS, BETA.DIST, BETA.INV, BETADIST, BETAINV, BINOM.DIST, BINOM.DIST.RANGE, BINOM.INV, BINOMDIST, CHIDIST, CHIINV, CHISQ.DIST, CHISQ.DIST.RT, CHISQ.INV, CHISQ.INV.RT, CHISQ.TEST, CHITEST, CONFIDENCE, CONFIDENCE.NORM, CONFIDENCE.T, CORREL, COUNT, COUNTA, COUNTBLANK, COUNTIF, COUNTIFS, COVAR, COVARIANCE.P, COVARIANCE.S, CRITBINOM, DEVSQ, EXPON.DIST, EXPONDIST, F.DIST, F.DIST.RT, F.INV, F.INV.RT, F.TEST, FDIST, FINV, FISHER, FISHERINV, FORECAST, FORECAST.LINEAR, FREQUENCY, FTEST, GAMMA, GAMMA.DIST, GAMMA.INV, GAMMADIST, GAMMAINV, GAMMALN, GAMMALN.PRECISE, GAUSS, GEOMEAN, GROWTH, HARMEAN, HYPGEOM.DIST, HYPGEOMDIST, INTERCEPT, KURT, LARGE, LINEST, LOGEST, LOGINV, LOGNORM.DIST, LOGNORM.INV, LOGNORMDIST, MAX, MAXA, MAXIFS, MEDIAN, MIN, MINA, MINIFS, MODE, MODE.MULT, MODE.SNGL, NEGBINOM.DIST, NEGBINOMDIST, NORM.DIST, NORM.INV, NORM.S.DIST, NORM.S.INV, NORMDIST, NORMINV, NORMSDIST, NORMSINV, PEARSON, PERCENTILE, PERCENTILE.EXC, PERCENTILE.INC, PERCENTRANK, PERCENTRANK.EXC, PERCENTRANK.INC, PERMUT, PERMUTATIONA, PHI, POISSON, POISSON.DIST, PROB, QUARTILE, QUARTILE.EXC, QUARTILE.INC, RANK, RANK.AVG, RANK.EQ, RSQ, SKEW, SKEW.P, SLOPE, SMALL, STANDARDIZE, STDEV, STDEV.P, STDEV.S, STDEVA, STDEVP, STDEVPA, STEYX, T.DIST, T.DIST.2T, T.DIST.RT, T.INV, T.INV.2T, T.TEST, TDIST, TINV, TREND, TRIMMEAN, TTEST, VAR, VAR.P, VAR.S, VARA, VARP, VARPA, WEIBULL, WEIBULL.DIST, Z.TEST, ZTEST
- **logical** (20): AND, BYCOL, BYROW, FALSE, IF, IFERROR, IFNA, IFS, ISOMITTED, LAMBDA, LET, MAKEARRAY, MAP, NOT, OR, REDUCE, SCAN, SWITCH, TRUE, XOR
- **lookup** (34): ADDRESS, AREAS, CHOOSE, CHOOSECOLS, CHOOSEROWS, COLUMN, COLUMNS, DROP, EXPAND, FILTER, FORMULATEXT, HLOOKUP, HSTACK, HYPERLINK, INDEX, INDIRECT, LOOKUP, MATCH, OFFSET, ROW, ROWS, SORT, SORTBY, TAKE, TOCOL, TOROW, TRANSPOSE, UNIQUE, VLOOKUP, VSTACK, WRAPCOLS, WRAPROWS, XLOOKUP, XMATCH
- **text** (43): ARRAYTOTEXT, CHAR, CLEAN, CODE, CONCAT, CONCATENATE, DOLLAR, EXACT, FIND(B), FIXED, LEFT(B), LEN(B), LOWER, MID(B), NUMBERVALUE, PROPER, REGEXEXTRACT, REGEXREPLACE, REGEXTEST, REPLACE(B), REPT, RIGHT(B), SEARCH(B), SUBSTITUTE, T, TEXT, TEXTAFTER, TEXTBEFORE, TEXTJOIN, TEXTSPLIT, TRIM, UNICHAR, UNICODE, UPPER, VALUE, VALUETOTEXT
- **date** (25): DATE, DATEDIF, DATEVALUE, DAY, DAYS, DAYS360, EDATE, EOMONTH, HOUR, ISOWEEKNUM, MINUTE, MONTH, NETWORKDAYS(.INTL), NOW, SECOND, TIME, TIMEVALUE, TODAY, WEEKDAY, WEEKNUM, WORKDAY(.INTL), YEAR, YEARFRAC
- **financial** (27): CUMIPMT, CUMPRINC, DB, DDB, DOLLARDE, DOLLARFR, EFFECT, FV, FVSCHEDULE, IPMT, IRR, ISPMT, MIRR, NOMINAL, NPER, NPV, PDURATION, PMT, PPMT, PV, RATE, RRI, SLN, SYD, VDB, XIRR, XNPV
- **info** (20): CELL, ERROR.TYPE, INFO, ISBLANK, ISERR, ISERROR, ISEVEN, ISFORMULA, ISLOGICAL, ISNA, ISNONTEXT, ISNUMBER, ISODD, ISREF, ISTEXT, N, NA, SHEET, SHEETS, TYPE
- **engineering** (24): BIN/OCT/DEC/HEX conversions in every direction (10-digit two's complement), BITAND/OR/XOR/LSHIFT/RSHIFT, CONVERT (mass, distance, time, pressure, force, energy, power, volume, area, information, speed, temperature), DELTA, GESTEP, ERF(.PRECISE), ERFC(.PRECISE)
- **database** (12): DAVERAGE, DCOUNT, DCOUNTA, DGET, DMAX, DMIN, DPRODUCT, DSTDEV, DSTDEVP, DSUM, DVAR, DVARP
- **compat**: `AVG`, the legacy Tela alias of AVERAGE

## Grid UI API (wave 2)

```ts
import * as Sheet from 'services/tela/sheet';

// Load and migrate a Grid device
const wb = Sheet.workbookFromGrid(device);                  // device.workbook, or a migration of the legacy cells (+ space-name fixups)
const engine = new Sheet.SheetEngine(wb, { resolver: Sheet.createTelaResolver({ resolveGrid, resolveBase }) });
// or: Sheet.engineForGrid(device, ctx)

// Every edit is a pure op; keep `patch` for undo/redo
let { workbook, patch } = Sheet.setCellInput(wb, sheetId, 'B3', userText);   // guesses $, %, dates, formulas
engine.update(workbook);                                    // diffs by row identity → incremental recalc
workbook = Sheet.applyPatch(workbook, patch, 'undo');       // and 'redo'

// Reading for rendering
engine.getValue(sheetId, row, col);                         // Scalar
engine.getDisplay(sheetId, row, col, maxChars);             // { text, color, align, fill } via the number format
engine.getCellInfo(sheetId, row, col);                      // formula, parseError, spill, spillAnchor, spillBlocked, circular
engine.getSpills(sheetId);                                  // spill borders
engine.getPrecedents / getDependents / getCircularRefs;
engine.evaluate('=SUM(A1:A3)', sheetId, row, col);          // preview / ad-hoc
Sheet.evaluateConditionalFormats(engine, wb, sheetId, viewport);  // Map<A1, {style, scaleColor, dataBar, icon}>
Sheet.validateValue(engine, wb, sheetId, row, col, value);  // { ok, title, message, style }
Sheet.listOptions(engine, wb, sheetId, row, col);           // dropdown items
Sheet.getStyleAt(wb, sheetId, 'A1'); Sheet.mergeAt(sheet, r, c); Sheet.getCell(sheet.cells, r, c);

// Formula bar
Sheet.tokenize(text);            // tokens with start/end, for ref colouring
Sheet.suggestFunctions(prefix);  // {name, sig, desc}
Sheet.tryParseFormula(text);     // { ast } | { error with pos }

// Operations (all return { workbook, patch })
setCellInputs, setCellValues, clearRange(all|contents|formats|notes),
setStyle(ranges, patch with null-to-remove), setNumberFormat,
insertRows/deleteRows/insertCols/deleteCols, moveRange (cut), copyRange (paste, values/formulas/formats, transpose, tiling),
fillRange (autofill), sortRange (multi-key, header, stable), setFilter / reapplyFilter / filterColumnValues,
mergeCells/unmergeCells, freezePanes, setColWidths/setRowHeights, setRowsHidden/setColsHidden, setSheetProps,
addSheet/renameSheet/deleteSheet/moveSheet/duplicateSheet/setActiveSheet,
setName/deleteName/renameName, addTable,
add/update/removeConditionalFormat, add/removeDataValidation,
findAll / replaceAll (wildcards or regex, formulas or values)

// Clipboard
const { tsv, html } = Sheet.copyToClipboard(engine, wb, sheetId, 'A1:C9');
const clip = Sheet.parseClipboard({ html, text }, { row, col });   // Excel x:num / x:fmla / <style>, Google data-sheets-* (R1C1)
Sheet.pasteClipboard(wb, sheetId, { row, col }, clip, 'all' | 'values' | 'formulas' | 'formats');

// IO
Sheet.importXlsx(bytes) → { workbook, warnings };  Sheet.exportXlsx(wb, { engine }) → Uint8Array
Sheet.workbookFromDelimited(text); Sheet.importDelimitedInto(wb, sheetId, text, at); Sheet.exportDelimited(engine, wb, sheetId, opts)

// Charts (same reading order as telaChartData)
Sheet.rangeLabels(engine, sheetId, 'A2:A8'); Sheet.rangeNumbers(engine, sheetId, 'B2:B8');
engine.getRangeValues(sheetId, 'A1:C10');

// Persist the computed values (optional): engine.snapshot() → workbook with `c` filled
```

## Performance

These are `tests/sheetBench.ts` results on the dev machine (Windows, Node 24). The first figure is plain JS, bundled with esbuild. The figure in brackets runs under `tsx`, whose keep-names wrapper adds overhead to every closure. Times are milliseconds.

| Scenario | Load + first calc | Full recalc | One edit | Cells computed by the edit |
|---|---|---|---|---|
| 100k `=A*2+B` row formulas (300k cells) | 1162 (≈1900) | **123** | 57 | 1 |
| 100k running-total chain | 828 (≈1500) | **137** | 146 | 100,000 |
| 10k `SUM(A r:r+99)` windows | 371 | 99 | 1.8 | 50 |
| 10k exact VLOOKUP into a 10k table | 160 | 56 | 22 | 10,000 |
| 1k `SUMIFS(B:B,A:A,k)` over 10k rows | 312 | 276 | 262 | 1,000 |

Full recalc of 100k formula cells stays well under the one-second target. Load is dominated by parsing and closure compilation. A relative-signature compile cache would cut it further, and is the next step if it starts to matter.

## Limits and known gaps

**Formulas and calculation**
- Structured references cover `Table[Col]`, `[[A]:[B]]`, `[#All|#Data|#Headers|#Totals]` and `[@Col]`. Tables do not auto-expand.
- Defined names with *relative* refs are treated as absolute.
- Iterative calculation iterates only the cells found in the cycle.
- In non-iterative mode, cells in a cycle show 0 (Excel's display).
- A 3D reference such as `SUM(Sheet1:Sheet3!A1)` evaluates as an array of values. That is right for aggregates; a 3D ref passed to a non-aggregate behaves as an array.
- Whole-column refs are clamped to the used extent. Ranges of 2M cells or more are clamped even when not aggregated, so `=A:A*2` spills only the used rows.
- Locale is US only: `.` decimals and English function names.
- The 1904 date system is converted to 1900 on import.
- These are not implemented: complex-number functions, bond and security functions (PRICE, YIELD, ACCRINT…), CUBE*, WEBSERVICE, GETPIVOTDATA, IMAGE, PY, and FORECAST.ETS. Unknown functions return `#NAME?`.

**xlsx**
- Export is limited in several ways:
  - Notes and comments are imported but not exported, because Excel needs VML.
  - Charts, images, pivots, sparklines, print settings, rich-text runs and themes are not written.
  - Fonts are written as explicit RGB.
  - Column and row default styles are not round-tripped.
- On import, gradient fills become their first stop colour.
- No LibreOffice (`soffice`) is installed here. Export was checked structurally in the tests (every part parses, every relationship resolves, content types are complete, elements follow schema order). It was also checked by GridCraft's independent xlsx reader plus recalculation, which gave the same values.

**Model and API**
- `setStyle` on whole columns or rows styles only the used extent. There are no column or row default styles yet.
- Firestore's 1 MB document limit means very large workbooks need off-document storage. Wave 2 should decide where.
- Ops validate sheet and defined names but do not enforce protection.
