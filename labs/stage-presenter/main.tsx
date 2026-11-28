// Stage presenter lab: mounts the real AmboProPresenter (Plajah Stage) by itself, for testing the
// operator UI — e.g. dragging slide cards to reorder the deck — without the app shell or sign-in.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AmboProPresenter from '../../components/scripture/AmboProPresenter';

createRoot(document.getElementById('root')!).render(<AmboProPresenter />);
