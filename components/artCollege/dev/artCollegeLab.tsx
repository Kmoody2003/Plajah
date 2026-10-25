// Dev lab for the Art College without booting the app.
// npx vite --config art-college-lab.vite.config.mjs -> http://127.0.0.1:3173/art-college-lab.html?tab=CATALOG&adult=1
// ?adult=1 simulates a verified-adult profile (birthYear 1990); default is the fail-closed minor path.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ArtCollegeView from '../ArtCollegeView';

const adult = new URLSearchParams(location.search).get('adult') === '1';
createRoot(document.getElementById('root')!).render(<ArtCollegeView profile={adult ? { birthYear: 1990 } : {}} />);
