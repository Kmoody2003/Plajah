import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERR, dateToSerial, formatGeneral, formatValue, guessInput, isDateFormat, parseDateTime, serialToYMD } from '../services/tela/sheet';

const fmt = (v: number | string | boolean | null, f: string) => formatValue(v, f).text;

describe('number formats', () => {
  it('numbers, thousands, scaling, percent, scientific', () => {
    assert.equal(fmt(1234.567, '#,##0.00'), '1,234.57');
    assert.equal(fmt(1234567, '#,##0,'), '1,235');
    assert.equal(fmt(1234567, '0.0,,"M"'), '1.2M');
    assert.equal(fmt(0.256, '0.0%'), '25.6%');
    assert.equal(fmt(12345.678, '0.00E+00'), '1.23E+04');
    assert.equal(fmt(0.00012, '0.0E-0'), '1.2E-4');
    assert.equal(fmt(12345, '##0.0E+0'), '12.3E+3');
    assert.equal(fmt(5, '000'), '005');
    assert.equal(fmt(0.5, '#.##'), '.5');
    assert.equal(fmt(1, '0.0#'), '1.0');
    assert.equal(fmt(5551234567, '(000) 000-0000'), '(555) 123-4567');
    assert.equal(fmt(-0.001, '0.00'), '-0.00');
  });
  it('sections, colours and conditions', () => {
    const f = '#,##0.00;[Red](#,##0.00);"zero";"text: "@';
    assert.equal(formatValue(-5, f).text, '(5.00)');
    assert.equal(formatValue(-5, f).color, '#FF0000');
    assert.equal(fmt(0, f), 'zero');
    assert.equal(fmt('hi', f), 'text: hi');
    assert.equal(fmt(50, '[<100]"low";[>=100]"high"'), 'low');
    assert.equal(fmt(150, '[<100]"low";[>=100]"high"'), 'high');
    assert.equal(formatValue(3, '[Color10]0').color, '#008000');
  });
  it('fractions', () => {
    assert.equal(fmt(1.5, '# ?/?'), '1 1/2');
    assert.equal(fmt(0.5, '# ?/?'), ' 1/2');
    assert.equal(fmt(3.14159, '# ??/??'), '3 14/99');
    assert.equal(fmt(0.75, '?/?'), '3/4');
    assert.equal(fmt(0.333, '# ?/8'), ' 3/8');
  });
  it('currency and accounting expose fill + alignment', () => {
    assert.equal(fmt(1234.5, '"$"#,##0.00'), '$1,234.50');
    const acc = formatValue(1234.5, '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)');
    assert.equal(acc.text, ' $1,234.50 ');
    assert.deepEqual(acc.fill, { char: ' ', index: 2 });
    assert.equal(formatValue(-1234.5, '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)').text, ' $(1,234.50)');
    assert.equal(formatValue(5, '0').align, 'right');
    assert.equal(formatValue('x', '0').align, 'left');
  });
  it('dates and times', () => {
    const d = dateToSerial(2026, 3, 15) + 0.75 + 30 / 86400;
    assert.equal(fmt(d, 'yyyy-mm-dd'), '2026-03-15');
    assert.equal(fmt(d, 'dddd, mmmm d, yyyy'), 'Sunday, March 15, 2026');
    assert.equal(fmt(d, 'h:mm AM/PM'), '6:00 PM');
    assert.equal(fmt(d, 'hh:mm:ss'), '18:00:30');
    assert.equal(fmt(d, 'm/d/yy h:mm'), '3/15/26 18:00');
    assert.equal(fmt(d, 'mmm-yy'), 'Mar-26');
    assert.equal(fmt(d, 'mmmmm'), 'M');
    assert.equal(fmt(1.5, '[h]:mm:ss'), '36:00:00');
    assert.equal(fmt(0.5 / 86400 + 1 / 1440, 'mm:ss.0'), '01:00.5');
    assert.equal(fmt(0.99999999, 'h:mm:ss'), '0:00:00'); // rounds to the next midnight, like Excel
    assert.ok(isDateFormat('d-mmm-yy'));
    assert.ok(!isDateFormat('0.00'));
  });
  it('General fits the column', () => {
    assert.equal(formatGeneral(1 / 3), '0.333333333');
    assert.equal(formatGeneral(123456789012), '1.23457E+11');
    assert.equal(formatGeneral(-0.5), '-0.5');
    assert.equal(formatGeneral(1e-10), '1E-10');
    assert.equal(formatValue(ERR.DIV0, 'General').text, '#DIV/0!');
    assert.equal(formatValue(true, '0.00').text, 'TRUE');
  });
});

describe('typed input guessing', () => {
  it('recognizes Excel input forms', () => {
    assert.deepEqual(guessInput('$1,200'), { kind: 'number', value: 1200, numFmt: '"$"#,##0' });
    assert.deepEqual(guessInput('($5.25)'), { kind: 'number', value: -5.25, numFmt: '"$"#,##0.00' });
    assert.deepEqual(guessInput('12%'), { kind: 'number', value: 0.12, numFmt: '0%' });
    assert.deepEqual(guessInput('1.5%'), { kind: 'number', value: 0.015, numFmt: '0.0%' });
    assert.deepEqual(guessInput('1,234'), { kind: 'number', value: 1234, numFmt: '#,##0' });
    assert.deepEqual(guessInput('1e3'), { kind: 'number', value: 1000, numFmt: '0.00E+00' });
    assert.deepEqual(guessInput('(42)'), { kind: 'number', value: -42 });
    assert.deepEqual(guessInput('1 1/2'), { kind: 'number', value: 1.5, numFmt: '# ?/?' });
    assert.deepEqual(guessInput('3/4/2026'), { kind: 'number', value: dateToSerial(2026, 3, 4), numFmt: 'm/d/yyyy' });
    assert.deepEqual(guessInput('2026-03-04'), { kind: 'number', value: dateToSerial(2026, 3, 4), numFmt: 'yyyy-mm-dd' });
    assert.deepEqual(guessInput('10:30 PM'), { kind: 'number', value: 22.5 / 24, numFmt: 'h:mm AM/PM' });
    assert.deepEqual(guessInput('10:30'), { kind: 'number', value: 10.5 / 24, numFmt: 'h:mm' });
    assert.deepEqual(guessInput('true'), { kind: 'bool', value: true });
    assert.deepEqual(guessInput('#N/A'), { kind: 'error', code: '#N/A' });
    assert.deepEqual(guessInput('=A1'), { kind: 'formula', formula: 'A1' });
    assert.deepEqual(guessInput("'=A1"), { kind: 'text', value: '=A1' });
    assert.deepEqual(guessInput('hello'), { kind: 'text', value: 'hello' });
    assert.deepEqual(guessInput('2026-02-30'), { kind: 'text', value: '2026-02-30' });
    assert.deepEqual(guessInput('123', '@'), { kind: 'text', value: '123' });
  });
  it('1900 date system incl. the leap-year bug', () => {
    assert.equal(dateToSerial(1900, 1, 1), 1);
    assert.equal(dateToSerial(1900, 2, 28), 59);
    assert.equal(dateToSerial(1900, 2, 29), 60);
    assert.equal(dateToSerial(1900, 3, 1), 61);
    assert.deepEqual(serialToYMD(60), { y: 1900, m: 2, d: 29 });
    assert.deepEqual(serialToYMD(2958465), { y: 9999, m: 12, d: 31 });
    assert.equal(parseDateTime('March 4, 2026')?.serial, dateToSerial(2026, 3, 4));
  });
});
