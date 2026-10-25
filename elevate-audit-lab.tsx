// Elevate phone audit lab: backend-free Elevate screens at phone width.
//   http://127.0.0.1:3171/elevate-audit-lab.html?v=member|admin   (window.__audit() lists overflow + small tap targets)
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ChurchDemoView from './components/ChurchDemoView';
import ChurchAdminDemoView from './components/ChurchAdminDemoView';

(window as any).__audit = () => {
  const vw = window.innerWidth;
  const root = document.getElementById('root')!;
  const over: string[] = [], small: string[] = [], tiny: string[] = [];
  const tag = (el: Element) => `${el.tagName.toLowerCase()}${(el as HTMLElement).className && typeof (el as HTMLElement).className === 'string' ? '.' + (el as HTMLElement).className.split(' ').slice(0, 2).join('.') : ''} "${((el as HTMLElement).innerText || (el as HTMLElement).getAttribute('aria-label') || '').trim().slice(0, 28)}"`;
  root.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') over.push(tag(el) + ` right=${Math.round(r.right)}`);
    if (el.matches('button, a[href], [role=button], input, select, textarea') && (r.height < 40 || r.width < 40)) small.push(tag(el) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 10 && (el as HTMLElement).innerText && el.children.length === 0) tiny.push(tag(el) + ` ${fs}px`);
  });
  return { docScrollW: root.scrollWidth, vw, over: over.slice(0, 15), overCount: over.length, smallCount: small.length, small: small.slice(0, 25), tinyCount: tiny.length };
};

const v = new URLSearchParams(location.search).get('v') || 'member';
createRoot(document.getElementById('root')!).render(v === 'admin' ? <ChurchAdminDemoView onCreate={() => {}} /> : <ChurchDemoView onCreate={() => {}} />);
