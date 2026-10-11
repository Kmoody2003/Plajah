// Shared fixture + Excel-verified expectations for the sheet engine tests.
// Expected values are Microsoft Excel results (documentation examples or
// computed by hand from Excel's definitions). Arrays are row-major 2D.

import { createWorkbook, gridFromA1, SheetEngine, type Scalar, type Value, Matrix, Ref, CellError, type Workbook } from '../services/tela/sheet';

/** A1:A10 = 1..10, B1:B5 fruit, C1:C5 = 10..50, D1:D3 logicals, F1:F6 = 3,1,4,1,5,9. */
export const FIXTURE: [string, string | number | boolean][] = [
  ...Array.from({ length: 10 }, (_, i) => [`A${i + 1}`, i + 1] as [string, number]),
  ['B1', 'apple'], ['B2', 'Banana'], ['B3', 'cherry'], ['B4', 'apple'], ['B5', 'date'],
  ['C1', 10], ['C2', 20], ['C3', 30], ['C4', 40], ['C5', 50],
  ['D1', true], ['D2', false], ['D3', true],
  ['F1', 3], ['F2', 1], ['F3', 4], ['F4', 1], ['F5', 5], ['F6', 9],
];

export function fixtureWorkbook(): Workbook {
  const wb = createWorkbook();
  wb.sheets[0].cells = gridFromA1(Object.fromEntries(FIXTURE.map(([a1, v]) => [a1, { v }])));
  return wb;
}

export type Expect = number | string | boolean | Expect[][];
/** [formula, expected, category]. Strings starting with '#' are errors. */
export const CASES: [string, Expect, string][] = [
  // ── operators & coercion ──
  ['2^3^2', 64, 'op'], ['-2^2', 4, 'op'], ['2-3*4', -10, 'op'], ['"a"<"b"', true, 'op'], ['"A"="a"', true, 'op'], ['1="1"', false, 'op'],
  ['TRUE>1', true, 'op'], ['10%', 0.1, 'op'], ['3&4', '34', 'op'], ['SUM(A1:A3 A2:C2)', 2, 'op'], ['0.1+0.2-0.3', 0, 'op'], ['"abc"+1', '#VALUE!', 'op'],
  ['1/0', '#DIV/0!', 'op'], ['{1,2}+{10;20}', [[11, 12], [21, 22]], 'op'], ['"3"+4', 7, 'op'], ['A1:A3*2', [[2], [4], [6]], 'op'], ['1/3&""', '0.333333333333333', 'op'],
  ['"a"&1&TRUE', 'a1TRUE', 'op'], ['-"2"', -2, 'op'], ['A20+1', 1, 'op'], ['A20&"x"', 'x', 'op'], ['1E+21&""', '1E+21', 'op'],
  // ── math ──
  ['SUM(A1:A10)', 55, 'math'], ['SUM(1,2,"3")', 6, 'math'], ['SUM(A1:A3,TRUE)', 7, 'math'], ['SUM(B1:B5)', 0, 'math'],
  ['SUMIF(A1:A10,">5")', 40, 'math'], ['SUMIF(B1:B5,"apple",C1:C5)', 50, 'math'], ['SUMIF(B1:B5,"a*",C1:C5)', 50, 'math'], ['SUMIFS(C1:C5,B1:B5,"apple",C1:C5,">15")', 40, 'math'],
  ['SUMPRODUCT(A1:A3,C1:C3)', 140, 'math'], ['SUMPRODUCT((A1:A10>5)*1)', 5, 'math'],
  ['ROUND(2.675,2)', 2.68, 'math'], ['ROUND(-2.5,0)', -3, 'math'], ['ROUND(1234.567,-2)', 1200, 'math'], ['ROUNDUP(3.2,0)', 4, 'math'], ['ROUNDUP(-3.2,0)', -4, 'math'], ['ROUNDDOWN(-3.7,0)', -3, 'math'],
  ['MROUND(10,3)', 9, 'math'], ['MROUND(-10,-3)', -9, 'math'], ['MROUND(5,-2)', '#NUM!', 'math'],
  ['CEILING(2.5,1)', 3, 'math'], ['CEILING(-2.5,2)', -2, 'math'], ['FLOOR(-2.5,2)', -4, 'math'], ['CEILING.MATH(-5.5,2,-1)', -6, 'math'], ['CEILING.MATH(-5.5,2)', -4, 'math'], ['FLOOR.MATH(-5.5,2)', -6, 'math'], ['FLOOR.MATH(-5.5,2,-1)', -4, 'math'],
  ['INT(-3.5)', -4, 'math'], ['TRUNC(-3.5)', -3, 'math'], ['MOD(-3,2)', 1, 'math'], ['MOD(3,-2)', -1, 'math'], ['MOD(5,0)', '#DIV/0!', 'math'], ['ABS(-4)', 4, 'math'], ['POWER(2,10)', 1024, 'math'],
  ['SQRT(16)', 4, 'math'], ['SQRT(-1)', '#NUM!', 'math'], ['EXP(1)', 2.718281828459045, 'math'], ['LN(EXP(2))', 2, 'math'], ['LOG(8,2)', 3, 'math'], ['LOG10(1000)', 3, 'math'], ['PRODUCT(A1:A5)', 120, 'math'],
  ['QUOTIENT(7,2)', 3, 'math'], ['QUOTIENT(-7,2)', -3, 'math'], ['GCD(12,18)', 6, 'math'], ['LCM(4,6)', 12, 'math'], ['FACT(5)', 120, 'math'], ['FACT(0)', 1, 'math'], ['COMBIN(5,2)', 10, 'math'], ['PERMUT(5,2)', 20, 'math'],
  ['SIGN(-2)', -1, 'math'], ['EVEN(3)', 4, 'math'], ['EVEN(-1)', -2, 'math'], ['ODD(2)', 3, 'math'], ['ODD(-2)', -3, 'math'], ['DEGREES(PI())', 180, 'math'], ['RADIANS(180)', Math.PI, 'math'],
  ['SIN(PI()/2)', 1, 'math'], ['COS(0)', 1, 'math'], ['TAN(PI()/4)', 1, 'math'], ['ATAN2(1,1)', Math.PI / 4, 'math'], ['SINH(0)', 0, 'math'], ['COSH(0)', 1, 'math'], ['ACOS(2)', '#NUM!', 'math'],
  ['SUBTOTAL(9,A1:A10)', 55, 'math'], ['SUBTOTAL(1,A1:A10)', 5.5, 'math'], ['AGGREGATE(9,6,A1:A10)', 55, 'math'], ['AGGREGATE(14,6,A1:A10,2)', 9, 'math'],
  ['SEQUENCE(2,3)', [[1, 2, 3], [4, 5, 6]], 'math'], ['MMULT({1,2;3,4},{5;6})', [[17], [39]], 'math'], ['MDETERM({1,2;3,4})', -2, 'math'], ['MINVERSE({4,7;2,6})', [[0.6, -0.7], [-0.2, 0.4]], 'math'],
  ['SUMSQ(3,4)', 25, 'math'], ['ROMAN(1999)', 'MCMXCIX', 'math'], ['ARABIC("MCMXCIX")', 1999, 'math'], ['BASE(255,16)', 'FF', 'math'], ['DECIMAL("FF",16)', 255, 'math'], ['COMBINA(4,3)', 20, 'math'],
  ['FACTDOUBLE(7)', 105, 'math'], ['MULTINOMIAL(2,3,4)', 1260, 'math'], ['SUMX2MY2({2,3},{1,2})', 8, 'math'], ['SERIESSUM(2,0,1,{1,1,1})', 7, 'math'], ['MUNIT(2)', [[1, 0], [0, 1]], 'math'],
  // ── statistical ──
  ['AVERAGE(A1:A10)', 5.5, 'stat'], ['AVERAGEA(D1:D3)', 2 / 3, 'stat'], ['COUNT(A1:A10,B1:B5)', 10, 'stat'], ['COUNTA(B1:B5)', 5, 'stat'], ['COUNTBLANK(A1:A12)', 2, 'stat'],
  ['COUNTIF(B1:B5,"apple")', 2, 'stat'], ['COUNTIF(A1:A10,"<=3")', 3, 'stat'], ['COUNTIFS(B1:B5,"apple",C1:C5,">20")', 1, 'stat'], ['COUNTIF(B1:B5,"<>apple")', 3, 'stat'], ["COUNTIF(B1:B5,\"?????\")", 2, "stat"],
  ['AVERAGEIF(C1:C5,">20")', 40, 'stat'], ['AVERAGEIFS(C1:C5,B1:B5,"apple")', 25, 'stat'], ['MAXIFS(C1:C5,B1:B5,"apple")', 40, 'stat'], ['MINIFS(C1:C5,B1:B5,"apple")', 10, 'stat'],
  ['MEDIAN(F1:F6)', 3.5, 'stat'], ['MODE(F1:F6)', 1, 'stat'], ['MODE.MULT({1,2,2,3,3})', [[2], [3]], 'stat'], ['STDEV.S(A1:A10)', 3.0276503540974917, 'stat'], ['STDEV.P(A1:A10)', 2.8722813232690143, 'stat'],
  ['VAR.S(A1:A10)', 9.166666666666666, 'stat'], ['VAR.P(A1:A10)', 8.25, 'stat'], ['PERCENTILE.INC(A1:A10,0.25)', 3.25, 'stat'], ['PERCENTILE.EXC(A1:A10,0.25)', 2.75, 'stat'], ['QUARTILE.INC(A1:A10,3)', 7.75, 'stat'],
  ['QUARTILE.EXC(A1:A10,1)', 2.75, 'stat'], ['RANK.EQ(7,A1:A10)', 4, 'stat'], ['RANK.EQ(7,A1:A10,1)', 7, 'stat'], ['RANK.AVG(1,F1:F6,1)', 1.5, 'stat'], ['LARGE(A1:A10,2)', 9, 'stat'], ['SMALL(F1:F6,3)', 3, 'stat'],
  ['CORREL(A1:A5,C1:C5)', 1, 'stat'], ['COVARIANCE.P(A1:A5,C1:C5)', 20, 'stat'], ['COVARIANCE.S(A1:A5,C1:C5)', 25, 'stat'], ['SLOPE(C1:C5,A1:A5)', 10, 'stat'], ['INTERCEPT(C1:C5,A1:A5)', 0, 'stat'], ['RSQ(C1:C5,A1:A5)', 1, 'stat'],
  ['FORECAST.LINEAR(6,C1:C5,A1:A5)', 60, 'stat'], ['TREND(C1:C5,A1:A5,6)', 60, 'stat'], ['GROWTH({2,4,8},{1,2,3},4)', 16, 'stat'], ['LINEST(C1:C5,A1:A5)', [[10, 0]], 'stat'],
  ['NORM.DIST(1,0,1,TRUE)', 0.8413447460685429, 'stat'], ['NORM.DIST(1,0,1,FALSE)', 0.24197072451914337, 'stat'], ['NORM.INV(0.95,0,1)', 1.6448536269514722, 'stat'], ['NORM.S.INV(0.975)', 1.959963984540054, 'stat'],
  ['NORM.S.DIST(0,TRUE)', 0.5, 'stat'], ['T.DIST(2,10,TRUE)', 0.9633059826146299, 'stat'], ['T.INV(0.975,10)', 2.228138851986274, 'stat'], ['T.DIST.2T(2,10)', 0.07338803477074019, 'stat'], ['T.INV.2T(0.05,10)', 2.228138851986274, 'stat'],
  ['CHISQ.DIST.RT(3.84,1)', 0.05004352124870519, 'stat'], ['CHISQ.INV.RT(0.05,1)', 3.841458820694124, 'stat'], ['BINOM.DIST(3,10,0.5,FALSE)', 0.1171875, 'stat'], ['BINOM.DIST(3,10,0.5,TRUE)', 0.171875, 'stat'],
  ['POISSON.DIST(2,3,FALSE)', 0.22404180765538775, 'stat'], ['POISSON.DIST(2,3,TRUE)', 0.42319008112684353, 'stat'], ['EXPON.DIST(1,2,TRUE)', 0.8646647167633873, 'stat'], ['GAMMA(5)', 24, 'stat'],
  ['GAMMALN(10)', 12.801827480081469, 'stat'], ['BETA.DIST(0.5,2,3,TRUE)', 0.6875, 'stat'], ['GAMMA.DIST(2,2,1,TRUE)', 0.5939941502901619, 'stat'], ['WEIBULL.DIST(1,2,1,TRUE)', 0.6321205588285577, 'stat'],
  ['LOGNORM.DIST(1,0,1,TRUE)', 0.5, 'stat'], ['HYPGEOM.DIST(1,4,8,20,FALSE)', 0.3632610939112487, 'stat'], ['NEGBINOM.DIST(2,3,0.5,FALSE)', 0.1875, 'stat'], ['CONFIDENCE.NORM(0.05,2.5,50)', 0.6929519121748391, 'stat'],
  ['FISHER(0.5)', 0.5493061443340548, 'stat'], ['GEOMEAN(2,8)', 4, 'stat'], ['HARMEAN(1,2,4)', 1.7142857142857142, 'stat'], ['AVEDEV(A1:A5)', 1.2, 'stat'], ['DEVSQ(A1:A5)', 10, 'stat'], ['STANDARDIZE(5,3,2)', 1, 'stat'],
  ['PERMUTATIONA(3,2)', 9, 'stat'], ['FREQUENCY(F1:F6,{2,5})', [[2], [3], [1]], 'stat'], ['TRIMMEAN(A1:A10,0.2)', 5.5, 'stat'], ['PERCENTRANK.INC(A1:A10,4)', 0.333, 'stat'], ['PROB({1,2,3},{0.2,0.3,0.5},2)', 0.3, 'stat'],
  ['F.DIST(2,5,10,TRUE)', 0.8358050491686236, 'stat'], ['F.INV(0.95,5,10)', 3.3258345304130112, 'stat'], ['BINOM.INV(10,0.5,0.5)', 5, 'stat'], ['MAX(A1:A10)', 10, 'stat'], ['MIN(F1:F6)', 1, 'stat'], ['MAXA(D1:D3)', 1, 'stat'],
  // ── logical ──
  ['IF(A1>0,"y","n")', 'y', 'logical'], ['IF(FALSE,1)', false, 'logical'], ['IFS(A1>5,"a",A1>0,"b")', 'b', 'logical'], ['IFERROR(1/0,"x")', 'x', 'logical'], ['IFNA(NA(),"x")', 'x', 'logical'], ['IFNA(1/0,"x")', '#DIV/0!', 'logical'],
  ['AND(TRUE,1)', true, 'logical'], ['OR(FALSE,0)', false, 'logical'], ['XOR(TRUE,TRUE,TRUE)', true, 'logical'], ['NOT(0)', true, 'logical'], ['SWITCH(2,1,"a",2,"b","z")', 'b', 'logical'], ['SWITCH(9,1,"a","z")', 'z', 'logical'],
  ['LET(x,2,y,x*3,x+y)', 8, 'logical'], ['LAMBDA(a,a*a)(5)', 25, 'logical'], ['MAP({1,2,3},LAMBDA(x,x*2))', [[2, 4, 6]], 'logical'], ['REDUCE(0,{1,2,3},LAMBDA(a,b,a+b))', 6, 'logical'],
  ['SCAN(0,{1,2,3},LAMBDA(a,b,a+b))', [[1, 3, 6]], 'logical'], ['BYROW({1,2;3,4},LAMBDA(r,SUM(r)))', [[3], [7]], 'logical'], ['BYCOL({1,2;3,4},LAMBDA(c,SUM(c)))', [[4, 6]], 'logical'],
  ['MAKEARRAY(2,2,LAMBDA(r,c,r*c))', [[1, 2], [2, 4]], 'logical'], ['AND(B1:B5)', '#VALUE!', 'logical'], ['IF({1,0},"a","b")', [['a', 'b']], 'logical'], ['IFERROR({1,#N/A},0)', [[1, 0]], 'logical'],
  // ── lookup ──
  ['VLOOKUP(3,A1:C5,3,FALSE)', 30, 'lookup'], ['VLOOKUP("cherry",B1:C5,2,FALSE)', 30, 'lookup'], ['VLOOKUP("CHERRY",B1:C5,2,FALSE)', 30, 'lookup'], ['VLOOKUP(2.5,A1:C5,3)', 20, 'lookup'],
  ['VLOOKUP(99,A1:C5,3,FALSE)', '#N/A', 'lookup'], ['VLOOKUP(1,A1:C5,4,FALSE)', '#REF!', 'lookup'], ['HLOOKUP(2,{1,2,3;"a","b","c"},2,FALSE)', 'b', 'lookup'], ['VLOOKUP("ch*",B1:C5,2,FALSE)', 30, 'lookup'],
  ['XLOOKUP("date",B1:B5,C1:C5)', 50, 'lookup'], ['XLOOKUP("zzz",B1:B5,C1:C5,"none")', 'none', 'lookup'], ['XLOOKUP(25,C1:C5,B1:B5,,-1)', 'Banana', 'lookup'], ['XLOOKUP(25,C1:C5,B1:B5,,1)', 'cherry', 'lookup'],
  ['XLOOKUP("apple",B1:B5,C1:C5,,0,-1)', 40, 'lookup'], ['MATCH(30,C1:C5,0)', 3, 'lookup'], ['MATCH(35,C1:C5)', 3, 'lookup'], ['MATCH(35,{50,40,30,20},-1)', 2, 'lookup'], ['XMATCH("cherry",B1:B5)', 3, 'lookup'],
  ['XMATCH(35,C1:C5,1)', 4, 'lookup'], ['INDEX(C1:C5,4)', 40, 'lookup'], ['INDEX(A1:C5,2,3)', 20, 'lookup'], ['INDEX({1,2;3,4},2,2)', 4, 'lookup'], ['SUM(INDEX(A1:C5,0,3))', 150, 'lookup'],
  ['LOOKUP(4.5,A1:A10)', 4, 'lookup'], ['LOOKUP(3,A1:A5,C1:C5)', 30, 'lookup'], ['CHOOSE(2,"a","b","c")', 'b', 'lookup'], ['OFFSET(A1,2,2)', 30, 'lookup'], ['SUM(OFFSET(A1,0,0,3,1))', 6, 'lookup'],
  ['INDIRECT("C2")', 20, 'lookup'], ['SUM(INDIRECT("A1:A4"))', 10, 'lookup'], ['ROW(C5)', 5, 'lookup'], ['COLUMN(C5)', 3, 'lookup'], ['ROWS(A1:C5)', 5, 'lookup'], ['COLUMNS(A1:C5)', 3, 'lookup'], ['ROW()', 30, 'lookup'],
  ['FILTER(A1:A10,A1:A10>8)', [[9], [10]], 'lookup'], ['FILTER(A1:A3,A1:A3>99,"none")', 'none', 'lookup'], ['SORT({3;1;2})', [[1], [2], [3]], 'lookup'], ['SORT({3;1;2},1,-1)', [[3], [2], [1]], 'lookup'],
  ['SORTBY({"a";"b";"c"},{3;1;2})', [['b'], ['c'], ['a']], 'lookup'], ['UNIQUE({1;2;2;3})', [[1], [2], [3]], 'lookup'], ['UNIQUE({1;2;2;3},,TRUE)', [[1], [3]], 'lookup'], ['TRANSPOSE({1,2,3})', [[1], [2], [3]], 'lookup'],
  ['ADDRESS(2,3)', '$C$2', 'lookup'], ['ADDRESS(2,3,4)', 'C2', 'lookup'], ['ADDRESS(2,3,1,FALSE)', 'R2C3', 'lookup'], ['ADDRESS(1,1,1,TRUE,"My Sheet")', "'My Sheet'!$A$1", 'lookup'],
  ['TAKE({1;2;3;4},2)', [[1], [2]], 'lookup'], ['TAKE({1;2;3;4},-1)', 4, 'lookup'], ['DROP({1;2;3},1)', [[2], [3]], 'lookup'], ['VSTACK({1,2},{3})', [[1, 2], [3, '#N/A']], 'lookup'], ['HSTACK({1;2},{3;4})', [[1, 3], [2, 4]], 'lookup'],
  ['TOCOL({1,2;3,4})', [[1], [2], [3], [4]], 'lookup'], ['WRAPROWS({1,2,3,4,5},2)', [[1, 2], [3, 4], [5, '#N/A']], 'lookup'], ['CHOOSECOLS({1,2,3;4,5,6},3,1)', [[3, 1], [6, 4]], 'lookup'], ['EXPAND({1},2,2,0)', [[1, 0], [0, 0]], 'lookup'],
  ['HYPERLINK("http://x","site")', 'site', 'lookup'], ['AREAS((A1,B2))', 2, 'lookup'],
  // ── text ──
  ['LEN("hello")', 5, 'text'], ['LEFT("hello",2)', 'he', 'text'], ['RIGHT("hello",3)', 'llo', 'text'], ['MID("hello",2,3)', 'ell', 'text'], ['FIND("l","hello")', 3, 'text'], ['FIND("L","hello")', '#VALUE!', 'text'],
  ['SEARCH("L","hello")', 3, 'text'], ['SEARCH("h?l","ahello")', 2, 'text'], ['SUBSTITUTE("a-b-c","-","+")', 'a+b+c', 'text'], ['SUBSTITUTE("a-b-c","-","+",2)', 'a-b+c', 'text'], ['REPLACE("abcdef",2,3,"X")', 'aXef', 'text'],
  ['UPPER("abc")', 'ABC', 'text'], ['LOWER("ABC")', 'abc', 'text'], ['PROPER("hello WORLD o\'neil")', "Hello World O'Neil", 'text'], ['TRIM("  a   b  ")', 'a b', 'text'], ['CLEAN(CHAR(7)&"x")', 'x', 'text'],
  ['REPT("ab",3)', 'ababab', 'text'], ['EXACT("a","A")', false, 'text'], ['CHAR(65)', 'A', 'text'], ['CODE("A")', 65, 'text'], ['UNICHAR(9731)', '☃', 'text'], ['UNICODE("☃")', 9731, 'text'],
  ['CONCAT(B1:B2)', 'appleBanana', 'text'], ['CONCATENATE("a",1,TRUE)', 'a1TRUE', 'text'], ['TEXTJOIN(",",TRUE,"a","","b")', 'a,b', 'text'], ['TEXTJOIN("-",FALSE,A1:A3)', '1-2-3', 'text'],
  ['TEXT(1234.567,"#,##0.00")', '1,234.57', 'text'], ['TEXT(0.256,"0.0%")', '25.6%', 'text'], ['TEXT(DATE(2026,3,15),"dddd, mmmm d, yyyy")', 'Sunday, March 15, 2026', 'text'], ['TEXT(TIME(13,5,0),"h:mm AM/PM")', '1:05 PM', 'text'],
  ['TEXT(-1234.5,"$#,##0.00;($#,##0.00)")', '($1,234.50)', 'text'], ['TEXT(1.5,"# ?/?")', '1 1/2', 'text'], ['TEXT(1234.5678,"0.00E+00")', '1.23E+03', 'text'], ['TEXT(5,"000")', '005', 'text'],
  ['VALUE("$1,000")', 1000, 'text'], ['VALUE("12%")', 0.12, 'text'], ['NUMBERVALUE("1.234,5",",",".")', 1234.5, 'text'], ['FIXED(1234.567,1)', '1,234.6', 'text'], ['FIXED(1234.567,1,TRUE)', '1234.6', 'text'],
  ['DOLLAR(1234.567)', '$1,234.57', 'text'], ['DOLLAR(-5)', '($5.00)', 'text'], ['TEXTBEFORE("a-b-c","-")', 'a', 'text'], ['TEXTBEFORE("a-b-c","-",-1)', 'a-b', 'text'], ['TEXTAFTER("a-b-c","-",2)', 'c', 'text'],
  ['TEXTSPLIT("a,b,c",",")', [['a', 'b', 'c']], 'text'], ['TEXTSPLIT("a,b;c,d",",",";")', [['a', 'b'], ['c', 'd']], 'text'], ['T(123)', '', 'text'], ['T("x")', 'x', 'text'],
  ['VALUETOTEXT("a",1)', '"a"', 'text'], ['ARRAYTOTEXT({1,2;3,4},1)', '{1,2;3,4}', 'text'],
  // ── date ──
  ['DATE(2026,3,15)', 46096, 'date'], ['DATE(2026,14,1)', 46419, 'date'], ['DATE(1900,2,29)', 60, 'date'], ['DATE(1900,3,1)', 61, 'date'], ['YEAR(46096)', 2026, 'date'], ['MONTH(46096)', 3, 'date'], ['DAY(46096)', 15, 'date'],
  ['WEEKDAY(46096)', 1, 'date'], ['WEEKDAY(46096,2)', 7, 'date'], ['WEEKDAY(46096,3)', 6, 'date'], ['WEEKNUM(46096)', 12, 'date'], ['ISOWEEKNUM(46096)', 11, 'date'],
  ['EDATE(DATE(2026,1,31),1)', 46081, 'date'], ['EOMONTH(DATE(2026,1,15),1)', 46081, 'date'], ['EOMONTH(DATE(2026,1,15),-1)', 46022, 'date'],
  ['DATEDIF(DATE(2020,1,15),DATE(2026,3,10),"Y")', 6, 'date'], ['DATEDIF(DATE(2020,1,15),DATE(2026,3,10),"M")', 73, 'date'], ['DATEDIF(DATE(2020,1,15),DATE(2026,3,10),"MD")', 23, 'date'],
  ['DATEDIF(DATE(2020,1,15),DATE(2026,3,10),"YM")', 1, 'date'], ['DATEDIF(DATE(2020,1,15),DATE(2026,3,10),"YD")', 54, 'date'], ['DAYS(DATE(2026,3,15),DATE(2026,1,1))', 73, 'date'], ['DAYS360(DATE(2026,1,31),DATE(2026,3,31))', 60, 'date'],
  ['NETWORKDAYS(DATE(2026,3,2),DATE(2026,3,13))', 10, 'date'], ['NETWORKDAYS.INTL(DATE(2026,3,2),DATE(2026,3,13),11)', 11, 'date'], ['WORKDAY(DATE(2026,3,13),1)', 46097, 'date'], ['WORKDAY(DATE(2026,3,16),-1)', 46094, 'date'],
  ['YEARFRAC(DATE(2026,1,1),DATE(2026,7,1))', 0.5, 'date'], ['YEARFRAC(DATE(2026,1,1),DATE(2026,7,1),3)', 0.4958904109589041, 'date'], ['DATEVALUE("2026-03-15")', 46096, 'date'], ['TIMEVALUE("6:00 PM")', 0.75, 'date'],
  ['TIME(25,0,0)', 1 / 24, 'date'], ['HOUR(0.75)', 18, 'date'], ['MINUTE(TIME(1,30,0))', 30, 'date'], ['SECOND(TIME(1,2,3))', 3, 'date'], ['DATEVALUE("3/15/2026")', 46096, 'date'],
  // ── financial ──
  ['PMT(0.05/12,360,200000)', -1073.6432460242797, 'financial'], ['FV(0.06/12,10,-200,-500,1)', 2581.4033740601185, 'financial'], ['NPER(0.12/12,-100,-1000,10000,1)', 59.67386567429457, 'financial'],
  ['IPMT(0.1/12,1,36,8000)', -66.66666666666667, 'financial'], ['PPMT(0.1/12,1,24,2000)', -75.62318600836664, 'financial'], ['NPV(0.1,-10000,3000,4200,6800)', 1188.4434123352207, 'financial'],
  ['IRR({-70000,12000,15000,18000,21000,26000})', 0.08663094803653171, 'financial'], ['XNPV(0.09,{-10000,2750,4250,3250,2750},{39448,39508,39751,39859,39904})', 2086.6476020315354, 'financial'],
  ['XIRR({-10000,2750,4250,3250,2750},{39448,39508,39751,39859,39904})', 0.37336253351883136, 'financial'], ['RATE(48,-200,8000)', 0.007701472488246008, 'financial'], ['SLN(30000,7500,10)', 2250, 'financial'],
  ['SYD(30000,7500,10,1)', 4090.909090909091, 'financial'], ['DDB(2400,300,10,1)', 480, 'financial'], ['DB(1000000,100000,6,1,7)', 186083.33333333334, 'financial'], ['EFFECT(0.0525,4)', 0.053542667370758, 'financial'],
  ['CUMIPMT(0.09/12,360,125000,13,24,0)', -11135.232130750845, 'financial'], ['CUMPRINC(0.09/12,360,125000,13,24,0)', -934.1071234208765, 'financial'], ['VDB(2400,300,10,0,0.875,1.5)', 315, 'financial'],
  ['MIRR({-120000,39000,30000,21000,37000,46000},0.1,0.12)', 0.1260941303659051, 'financial'], ['FVSCHEDULE(1,{0.09,0.11,0.1})', 1.33089, 'financial'], ['PDURATION(0.025,2000,2200)', 3.859866162622655, 'financial'],
  ['PV(0.08/12,240,500)', -59777.14585118, 'financial'],
  // ── information ──
  ['ISBLANK(A20)', true, 'info'], ['ISBLANK(A1)', false, 'info'], ['ISNUMBER(A1)', true, 'info'], ['ISTEXT(B1)', true, 'info'], ['ISLOGICAL(D1)', true, 'info'], ['ISERROR(1/0)', true, 'info'],
  ['ISERR(NA())', false, 'info'], ['ISNA(NA())', true, 'info'], ['ISEVEN(4)', true, 'info'], ['ISODD(3)', true, 'info'], ['N(TRUE)', 1, 'info'], ['N("x")', 0, 'info'], ['TYPE("a")', 2, 'info'], ['TYPE({1,2})', 64, 'info'],
  ['ERROR.TYPE(1/0)', 2, 'info'], ['ISREF(A1)', true, 'info'], ['ISFORMULA(A1)', false, 'info'], ['ISNONTEXT(1)', true, 'info'], ['CELL("address",C3)', '$C$3', 'info'], ['CELL("col",C3)', 3, 'info'], ['SHEET()', 1, 'info'], ['SHEETS()', 1, 'info'],
  // ── engineering ──
  ['DEC2BIN(10)', '1010', 'engineering'], ['DEC2BIN(-1)', '1111111111', 'engineering'], ['DEC2HEX(255,4)', '00FF', 'engineering'], ['HEX2DEC("FFFFFFFFFF")', -1, 'engineering'], ['BIN2DEC("1111111111")', -1, 'engineering'],
  ['OCT2DEC("777")', 511, 'engineering'], ['BITAND(12,10)', 8, 'engineering'], ['BITOR(12,10)', 14, 'engineering'], ['BITXOR(12,10)', 6, 'engineering'], ['BITLSHIFT(1,4)', 16, 'engineering'], ['DELTA(5,5)', 1, 'engineering'],
  ['GESTEP(4,5)', 0, 'engineering'], ['ERF(1)', 0.8427007929497149, 'engineering'], ['ERFC(1)', 0.15729920705028513, 'engineering'], ['CONVERT(1,"mi","km")', 1.609344, 'engineering'], ['CONVERT(100,"C","F")', 212, 'engineering'],
  ['CONVERT(1,"lbm","kg")', 0.45359237, 'engineering'],
  // ── database ──
  ['DSUM({"Name","Qty";"a",1;"b",2;"a",3},"Qty",{"Name";"a"})', 4, 'database'], ['DCOUNT({"Name","Qty";"a",1;"b",2;"a",3},"Qty",{"Qty";">1"})', 2, 'database'],
  ['DGET({"Name","Qty";"a",1;"b",2;"a",3},"Qty",{"Name";"b"})', 2, 'database'], ['DAVERAGE({"Name","Qty";"a",1;"b",2;"a",3},"Qty",{"Name";"a"})', 2, 'database'], ['DMAX({"Name","Qty";"a",1;"b",2;"a",3},2,{"Name";"a"})', 3, 'database'],
];

/** Evaluate a formula in Sheet1!Z30 of the fixture. */
export function makeEvaluator() {
  const engine = new SheetEngine(fixtureWorkbook(), { now: () => new Date(2026, 2, 15, 12, 0, 0), random: () => 0.5 });
  return (formula: string): Value => engine.evaluate(formula, 0, 29, 25);
}

/** Normalize a Value for comparison. */
export function normalize(v: Value): Expect | null {
  if (v instanceof Matrix) {
    if (v.rows === 1 && v.cols === 1) return normalize(v.data[0][0]);
    return v.data.map(r => r.map(x => normalize(x) as Expect));
  }
  if (v instanceof Ref) return null;
  if (v instanceof CellError) return v.code;
  if (v === null) return 0;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return null;
}

export function approxEqual(a: Expect | null, b: Expect): boolean {
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((row, i) => Array.isArray(a[i]) && (a[i] as Expect[]).length === row.length && row.every((x, j) => approxEqual((a[i] as Expect[])[j], x)));
  if (typeof b === 'number') return typeof a === 'number' && (Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));
  return a === b;
}

export type { Scalar };
