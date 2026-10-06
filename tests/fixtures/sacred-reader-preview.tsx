import React, { useState } from 'react';
import CanonBookPicker from '../../components/scripture/CanonBookPicker';
import { canonBooks, type BibleCanon } from '../../services/bibleCanon';
import { createRoot } from 'react-dom/client';
import SacredTextReader from '../../components/faith/SacredTextReader';
import LectioHistory from '../../components/scripture/LectioHistory';
import LectioLexicon from '../../components/scripture/LectioLexicon';
import LectioComparativeSearch from '../../components/scripture/LectioComparativeSearch';
import LectioConcordance from '../../components/scripture/LectioConcordance';
import ResearchNotebook from '../../components/faith/ResearchNotebook';
import LectioOriginals from '../../components/scripture/LectioOriginals';
import { BOOKS } from '../../services/bibleService';
import type { FaithId } from '../../data/sacredLibrary/readerCatalog';
import './sacred-reader-preview.css';
function CanonPreview() {
 const [canon,setCanon]=useState<BibleCanon>('catholic');const [book,setBook]=useState(canonBooks('catholic')[0]);
 return <CanonBookPicker canon={canon} book={book} onBook={setBook} onCanon={c=>{setCanon(c);setBook(canonBooks(c)[0]);}} />;
}
const params = new URLSearchParams(location.search);
const faith = (params.get('faith') || 'islam') as FaithId;
const tool = params.get('tool');
const originalBook = Number(params.get('book') || 1), originalChapter = Number(params.get('chapter') || 1), originalVerse = Number(params.get('verse') || 1);
createRoot(document.getElementById('root')!).render(tool ? <div className="mx-auto max-w-lg p-6 text-white">
  {tool === 'canon' ? <CanonPreview /> : tool === 'originals' ? <LectioOriginals current={{ book: originalBook, bookName: BOOKS.find(b => b.num === originalBook)?.name || 'Unknown', chapter: originalChapter, verse: originalVerse }} slug="kjv" translationText={originalBook === 1 && originalChapter === 1 ? 'In the beginning God created the heaven and the earth.' : undefined} onNavigate={ref => { document.body.dataset.navigation = JSON.stringify(ref); }} onStrong={id => { document.body.dataset.strong = id; }} /> : tool === 'concordance' ? <LectioConcordance slug="kjv" corpusVersion={0} onNavigate={() => {}} /> : tool === 'history' ? <LectioHistory current={{ book: 12, bookName: '2 Kings', chapter: 18 }} onNavigate={() => {}} /> : tool === 'words' ? <LectioLexicon current={{ book: 43, bookName: 'John', chapter: 1, verse: 1 }} onNavigate={() => {}} /> : tool === 'compare' ? <LectioComparativeSearch /> : <ResearchNotebook />}
</div> : <SacredTextReader key={faith} faith={faith} name={faith.charAt(0).toUpperCase() + faith.slice(1)} accent="#e3c57e" onBack={() => {}} />);
