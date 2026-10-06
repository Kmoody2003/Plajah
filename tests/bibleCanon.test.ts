import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATHOLIC_BOOKS, ORTHODOX_BOOKS, canonMark, editionBooks } from '../services/bibleCanon';
import { parseBundledCatholic } from '../services/bundledBibleCore';
import { parseRef } from '../services/scriptureRef';
import { buildConcordanceIndex, searchConcordanceIndex } from '../services/lectioConcordance';
const raw = JSON.parse(readFileSync('public/sacred/bible-douayrheims.json','utf8'));
test('complete Catholic edition has all 73 books and embedded additions',()=>{
  const chapters=parseBundledCatholic(raw);
  assert.equal(chapters.length,1334);
  assert.equal(chapters.reduce((n,c)=>n+c.verses.length,0),35808);
  for(const [book,chapter] of [[17,16],[27,14],[75,6],[69,14],[81,15]]) assert.ok(chapters.find(c=>c.book===book&&c.chapter===chapter));
  assert.equal(editionBooks('kjv').find(b=>b.num===27)?.chapters,12);
  assert.equal(CATHOLIC_BOOKS.length,73);
  assert.throws(()=>parseBundledCatholic({...raw,books:raw.books.slice(1)}));
});
test('dropdown distinctions preserve shared additions and qualify Orthodox appendices',()=>{
  for(const id of [69,70,73,74,75,80,81,77,78,84]) assert.equal(canonMark(ORTHODOX_BOOKS.find(b=>b.num===id)!).color,'#fbbf24');
  assert.equal(canonMark(ORTHODOX_BOOKS.find(b=>b.num===82)!).color,'#c084fc');
  assert.match(canonMark(ORTHODOX_BOOKS.find(b=>b.num===83)!).label,/appendix/);
  assert.equal(canonMark(CATHOLIC_BOOKS.find(b=>b.num===40)!).label,'Shared book');
});
test('Catholic book references and concordance testament filters',()=>{
  assert.equal(parseRef('Tobit 1:1')?.book,69);
  assert.equal(parseRef('2 Maccabees 15:1')?.book,81);
  assert.equal(parseRef('Daniel 14:1')?.chapter,14);
  const index=buildConcordanceIndex([{ref:{book:69,bookName:'Tobit',chapter:1,verse:1},label:'Tobit 1:1',text:'Tobias'}]);
  assert.equal(searchConcordanceIndex(index,'Tobias','word',{testament:'OT'}).matches.length,1);
  assert.equal(searchConcordanceIndex(index,'Tobias','word',{testament:'NT'}).matches.length,0);
});
