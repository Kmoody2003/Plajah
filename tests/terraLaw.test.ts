import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMclChapter, decodeMclBytes, bodyBlocks, chapterStats, searchRowsForChapter, walkSections } from '../services/terra/law/michiganMcl';
import { parseConstitutionArticle, preambleFrom, currentThroughOf } from '../services/terra/law/michiganConstitution';
import { parseXml, textOf } from '../services/terra/law/miniXml';
import { officialUrlFor } from '../services/terra/law/lawTypes';
import { searchLaw } from '../services/terra/law/lawSearch';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CHAPTER = `<?xml version="1.0" encoding="utf-16"?>
<MCLChapterInfo>
  <DocumentID>1</DocumentID><Repealed>false</Repealed><Name>125</Name><Title>PLANNING, HOUSING, AND ZONING</Title>
  <MCLDocumentInfoCollection>
    <MCLStatuteInfo>
      <Repealed>false</Repealed><Name>Act 110 of 2006</Name><Heading>MICHIGAN ZONING ENABLING ACT</Heading>
      <LongTitle>AN ACT to codify the laws regarding local units of government regulating the development and use of land.</LongTitle>
      <ShortTitle>Michigan zoning enabling act</ShortTitle>
      <MCLDocumentInfoCollection>
        <MCLDivisionInfo>
          <Repealed>false</Repealed><DivisionTitle>GENERAL PROVISIONS</DivisionTitle><DivisionNumber>I</DivisionNumber><DivisionType>ARTICLE</DivisionType>
          <MCLDocumentInfoCollection>
            <MCLSectionInfo>
              <Repealed>false</Repealed>
              <EditorsNotes><EditorsNoteInfo><Type>Compiler</Type><Text>${esc('<Paragraph><P>Catchlines were enacted.</P></Paragraph>')}</Text></EditorsNoteInfo></EditorsNotes>
              <HistoryText>${esc('<HistoryData>2006, Act 110, Eff. July 1, 2006</HistoryData><HistoryData>Am. 2008, Act 12</HistoryData>')}</HistoryText>
              <MCLNumber>125.3201</MCLNumber><Label>201</Label><CatchLine>Regulation of land development.</CatchLine>
              <BodyText>${esc('<Section-Number>Sec. 201.</Section-Number><Paragraph><Paragraph-Number>(1)</Paragraph-Number><P>A local unit of government <Emph>may</Emph> provide by zoning ordinance &amp; more.</P></Paragraph><Paragraph><P><table><tr><td><p>Capacity</p></td><td>Thickness</td></tr><tr><td>500</td><td>12</td></tr></table></P></Paragraph>')}</BodyText>
            </MCLSectionInfo>
            <MCLSectionInfo>
              <Repealed>true</Repealed><MCLNumber>125.3202</MCLNumber><Label>202</Label><CatchLine>Repealed.</CatchLine><BodyText /><HistoryText />
            </MCLSectionInfo>
          </MCLDocumentInfoCollection>
        </MCLDivisionInfo>
      </MCLDocumentInfoCollection>
    </MCLStatuteInfo>
  </MCLDocumentInfoCollection>
</MCLChapterInfo>`;

test('parses an MCL chapter into acts, divisions and sections with verbatim text', () => {
  const ch = parseMclChapter(CHAPTER);
  assert.equal(ch.n, '125');
  assert.equal(ch.title, 'PLANNING, HOUSING, AND ZONING');
  const act = ch.children[0];
  assert.equal(act.k, 'act');
  if (act.k !== 'act') return;
  assert.equal(act.shortTitle, 'Michigan zoning enabling act');
  const div = act.children[0];
  assert.equal(div.k, 'div');
  const secs = [...walkSections(ch.children)].map((x) => x.sec);
  assert.equal(secs.length, 2);
  const s = secs[0];
  assert.equal(s.id, 'mcl-125.3201');
  assert.equal(s.label, '201');
  assert.deepEqual(s.hist, ['2006, Act 110, Eff. July 1, 2006', 'Am. 2008, Act 12']);
  assert.deepEqual(s.notes, ['Catchlines were enacted.']);
  assert.deepEqual(s.body[0], { t: 'p', num: '(1)', text: 'A local unit of government may provide by zoning ordinance & more.' });
  assert.deepEqual(s.body[1], { t: 'table', rows: [['Capacity', 'Thickness'], ['500', '12']] });
  assert.equal(secs[1].repealed, true);
  assert.deepEqual(chapterStats(ch), { acts: 1, sections: 2 });
  // Repealed sections are left out of search.
  assert.deepEqual(searchRowsForChapter(ch), [['mcl-125.3201', '125.3201', 'Regulation of land development.', 'Michigan zoning enabling act', '125']]);
});

test('decodes the Legislature UTF-16LE export with BOM', () => {
  const s = '<MCLChapterInfo><Name>1</Name></MCLChapterInfo>';
  const bytes = new Uint8Array(2 + s.length * 2);
  bytes[0] = 0xff; bytes[1] = 0xfe;
  for (let i = 0; i < s.length; i++) bytes[2 + i * 2] = s.charCodeAt(i);
  assert.equal(decodeMclBytes(bytes), s);
});

test('tolerant parser survives unbalanced HTML in section bodies', () => {
  const tree = parseXml('<P>one <b>two</P> three</i>');
  assert.equal(textOf(tree), 'one two three');
  assert.deepEqual(bodyBlocks(''), []);
});

const ARTICLE = `STATE CONSTITUTION (EXCERPT)
CONSTITUTION OF MICHIGAN OF 1963
Article IX
FINANCE AND TAXATION
§ 1 Taxes; collection
and disposition.
Sec. 1.
The legislature shall impose taxes sufficient with other resources to pay the
expenses of state government.
History: Const. 1963, Art. IX, § 1, Eff. Jan. 1, 1964 ;-- Am. H.J.R. A, approved Nov. 2, 1982
Former Constitution: See Const. 1908, Art. X, § 1.

Rendered Tuesday, November 10, 2026

Page 1 of 9

Michigan Compiled Laws Complete Through PA 114 of 2026
Courtesy of legislature.mi.gov

§ 6 Property tax limits.
Section 6.
(1) Except as otherwise provided in this constitution, the total amount shall not exceed 15
mills.
(2) The foregoing limitations shall not apply.
History: Const. 1963, Art. IX, § 6, Eff. Jan. 1, 1964
`;

test('parses a Constitution article from PDF text, dropping page furniture', () => {
  const art = parseConstitutionArticle(ARTICLE, 'IX');
  assert.equal(art.title, 'FINANCE AND TAXATION');
  assert.equal(art.sections.length, 2);
  const [s1, s6] = art.sections;
  assert.equal(s1.id, 'const-IX-1');
  assert.equal(s1.catch, 'Taxes; collection and disposition.');
  assert.deepEqual(s1.body, [{ t: 'p', text: 'The legislature shall impose taxes sufficient with other resources to pay the expenses of state government.' }]);
  assert.deepEqual(s1.hist, ['Const. 1963, Art. IX, § 1, Eff. Jan. 1, 1964', 'Am. H.J.R. A, approved Nov. 2, 1982']);
  assert.deepEqual(s1.notes, ['Former Constitution: See Const. 1908, Art. X, § 1.']);
  assert.deepEqual(s6.body, [
    { t: 'p', num: '(1)', text: 'Except as otherwise provided in this constitution, the total amount shall not exceed 15 mills.' },
    { t: 'p', num: '(2)', text: 'The foregoing limitations shall not apply.' },
  ]);
  assert.equal(currentThroughOf(ARTICLE), 'PA 114 of 2026');
});

test('extracts the preamble', () => {
  const t = 'x\nPreamble.\nWe, the people of the State of Michigan, grateful,\ndo ordain and establish this constitution.\n\nARTICLE I';
  assert.equal(preambleFrom(t), 'We, the people of the State of Michigan, grateful, do ordain and establish this constitution.');
});

test('official source links', () => {
  assert.equal(officialUrlFor('mcl-125.3201'), 'https://legislature.mi.gov/Laws/MCL?objectName=mcl-125-3201');
  assert.equal(officialUrlFor('const-IX-6'), 'https://legislature.mi.gov/Laws/MCL?objectName=mcl-Article-IX-6');
});

test('search ranks citation, catchline and title matches', () => {
  const rows: [string, string, string, string, string][] = [
    ['mcl-436.1501', '436.1501', 'Retail license; application.', 'Michigan liquor control code of 1998', '436'],
    ['mcl-125.3201', '125.3201', 'Regulation of land development.', 'Michigan zoning enabling act', '125'],
    ['mcl-408.934', '408.934', 'Minimum hourly wage rates.', 'Improved workforce opportunity wage act', '408'],
  ];
  assert.equal(searchLaw(rows, '125.3201')[0][0], 'mcl-125.3201');
  assert.equal(searchLaw(rows, 'liquor license')[0][0], 'mcl-436.1501');
  assert.equal(searchLaw(rows, 'minimum wage')[0][0], 'mcl-408.934');
  assert.equal(searchLaw(rows, 'MCL 408.934')[0][0], 'mcl-408.934');
  assert.deepEqual(searchLaw(rows, 'zzzz'), []);
});

test('titles read naturally: caps and sentence case become title case, roman numerals survive', async () => {
  const { titleCase } = await import('../components/terra/TerraLawLibrary');
  assert.equal(titleCase('PLANNING, HOUSING, AND ZONING'), 'Planning, Housing, and Zoning');
  assert.equal(titleCase('Michigan zoning enabling act'), 'Michigan Zoning Enabling Act');
  assert.equal(titleCase('ARTICLE II — ZONING AUTHORIZATION'), 'Article II — Zoning Authorization');
  assert.equal(titleCase('CIVIL RIGHTS'), 'Civil Rights');
  assert.equal(titleCase('E.R.O. No. 1999-1'), 'E.R.O. No. 1999-1');
});
