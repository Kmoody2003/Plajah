// Year Curriculum lab (no Firebase sign-in): ?view=year (default) the planner · ?view=council the Education Council.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../index.css';
import YearCurriculumView from '../YearCurriculumView';
import EducationCouncilView from '../EducationCouncilView';

const view = new URLSearchParams(location.search).get('view') || 'year';
createRoot(document.getElementById('root')!).render(view === 'council' ? <EducationCouncilView /> : <YearCurriculumView onNavigate={v => { if (v === 'EDUCATION_COUNCIL') location.search = '?view=council'; }} />);
