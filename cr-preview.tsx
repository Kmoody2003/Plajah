import React from 'react';
import { createRoot } from 'react-dom/client';
import './cr-preview.css';
import CreatorCoursesHub from './components/academia/creator/CreatorCoursesHub';
import { setMotionPref } from './services/motionPref';
setMotionPref('on');
createRoot(document.getElementById('root')!).render(<div style={{ background: '#07070c', color: '#fff', minHeight: '100vh' }}><CreatorCoursesHub profile={{ uid: 'u', displayName: 'Maya', motionPref: 'on' } as any} user={{ uid: 'u' }} onNavigate={() => {}} onBack={() => {}} /></div>);
