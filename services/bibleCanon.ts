import { BOOKS, type BibleBook } from './bibleService';

export type BibleCanon = 'protestant' | 'catholic' | 'orthodox';
const extra = (num: number, name: string, chapters: number): BibleBook => ({ num, name, chapters, testament: 'OT' });
export const DEUTEROCANONICAL = [extra(69,'Tobit',14),extra(70,'Judith',16),extra(73,'Wisdom',19),extra(74,'Sirach',51),extra(75,'Baruch',6),extra(80,'1 Maccabees',16),extra(81,'2 Maccabees',15)];
const catholicOrder = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,69,70,17,18,19,20,21,22,73,74,23,24,25,75,26,27,28,29,30,31,32,33,34,35,36,37,38,39,80,81,...BOOKS.filter(b=>b.testament==='NT').map(b=>b.num)];
export const CATHOLIC_BOOKS = catholicOrder.map(num => ({ ...[...BOOKS,...DEUTEROCANONICAL].find(b=>b.num===num)!, ...(num===17?{chapters:16}:num===27?{chapters:14}:{}) }));
// Provider's Septuagint collection: separate additions are shared Catholic material,
// while appendices and anthologies must not be advertised as universally canonical.
export const ORTHODOX_BOOKS = [...CATHOLIC_BOOKS.filter(b=>b.testament==='OT').map(b=>({...b,...(b.num===19?{chapters:151}:b.num===29?{chapters:4}:b.num===75?{chapters:5}:b.num===27?{chapters:12}:{})})),extra(67,'1 Esdras',9),extra(82,'3 Maccabees',7),extra(84,'Letter of Jeremiah',1),extra(77,'Susanna',1),extra(78,'Bel and the Dragon',1),extra(83,'4 Maccabees',18),extra(85,'Psalms of Solomon',18),extra(86,'Odes (includes Prayer of Manasseh)',14),...BOOKS.filter(b=>b.testament==='NT')];
export function canonBooks(canon: BibleCanon) { return canon==='catholic'?CATHOLIC_BOOKS:canon==='orthodox'?ORTHODOX_BOOKS:BOOKS; }
export function canonMark(book: BibleBook): { color: string; label: string } {
  if ([83,85].includes(book.num)) return {color:'#c4b5fd',label:book.num===83?'Orthodox appendix · varies':'Septuagint appendix'};
  if ([67,82,86].includes(book.num)) return {color:'#c084fc',label:book.num===86?'Orthodox collection · Prayer of Manasseh':'Additional Orthodox · varies'};
  if ([69,70,73,74,75,80,81,77,78,84].includes(book.num)) return {color:'#fbbf24',label:'Catholic & Orthodox'};
  if ([17,27].includes(book.num) && book.chapters>BOOKS.find(b=>b.num===book.num)!.chapters) return {color:'#fbbf24',label:'Shared book · Catholic & Orthodox additions'};
  if (book.num===19 && book.chapters===151) return {color:'#c084fc',label:'Shared book · Orthodox Psalm 151'};
  return {color:'#e2e8f0',label:'Shared book'};
}
export function editionBooks(slug: string): BibleBook[] {
  if (slug==='douayrheims') return CATHOLIC_BOOKS;
  if (slug==='lxx') return ORTHODOX_BOOKS.filter(b=>b.testament==='OT');
  return BOOKS.filter(b=>slug==='codex'?b.testament==='OT':slug==='textusreceptus'?b.testament==='NT':true);
}
