// Lectio lab: the real Sacred Library / Bible reader, no app boot.
//   npx vite --config lectio-lab.vite.config.mjs -> http://127.0.0.1:3171/lectio-lab.html  (?ref=<refId> deep-links; ?follow=lab drives window.__cue(refId,label))
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import BibleExperience from './components/BibleExperience';

const ref = new URLSearchParams(location.search).get('ref');
createRoot(document.getElementById('root')!).render(<BibleExperience onBack={() => {}} initialRefId={ref} followSessionId={new URLSearchParams(location.search).get('follow')} />);
