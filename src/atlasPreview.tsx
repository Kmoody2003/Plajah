// Dev-only: renders the Machine Atlas viewer directly (no sign-in gate, no Firestore). Delete freely.
//   /atlas-preview.html                          viewer (whole brake system)
//   /atlas-preview.html?scenario=abs|heat|apply  simulation scenarios
//   /atlas-preview.html?fault=stuck-slide-pin    fault drill (any fault id, dashes allowed)
//   /atlas-preview.html?view=disc|drum|compare|circuit&part=caliper
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import AtlasViewer from '../components/atlas/AtlasViewer';

const q = new URLSearchParams(window.location.search);
const fault = q.get('fault')?.replace(/-/g, '_');
const scenario = q.get('scenario') || (fault ? `fault_${fault}` : undefined);
createRoot(document.getElementById('root')!).render(
  <AtlasViewer systemId="brakes" scenarioId={scenario} faultId={fault} viewId={q.get('view') || undefined} partId={q.get('part')?.replace(/-/g, '_') || undefined} />,
);
