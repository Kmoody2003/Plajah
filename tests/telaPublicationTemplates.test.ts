import test from 'node:test';
import assert from 'node:assert/strict';
import { COMIC_LAYOUTS } from '../data/comicLayouts';
import { instantiatePublicationPage, TELA_PUBLICATION_TEMPLATES } from '../services/telaPublicationTemplates';

test('publication library covers campaigns, periodicals, books, albums, comics and manga',()=>{
  const counts=new Map<string,number>();for(const template of TELA_PUBLICATION_TEMPLATES)counts.set(template.category,(counts.get(template.category)||0)+1);
  assert.ok((counts.get('EMAIL BLAST')||0)>=6);assert.ok((counts.get('NEWSLETTER')||0)>=6);assert.ok((counts.get('MAGAZINE')||0)>=6);assert.ok((counts.get('CHILDREN’S BOOK')||0)>=6);assert.ok((counts.get('PHOTO BOOK')||0)>=6);assert.ok((counts.get('COMIC & MANGA')||0)>=8);
});

test('multi-page publications contain coordinated, distinct page types',()=>{
  for(const template of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category!=='EMAIL BLAST')){assert.ok(template.pages.length>=4,template.name);assert.ok(new Set(template.pages).size>=3,template.name);for(let i=0;i<template.pages.length;i++){const objects=instantiatePublicationPage(template,template.pages[i],i);assert.ok(objects.length>=4,`${template.name} ${template.pages[i]}`);assert.ok(objects.every(object=>object.w>=0&&object.h>=0));}}
});

test('magazines include expected editorial page presets',()=>{for(const magazine of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='MAGAZINE'))for(const page of ['COVER','CONTENTS','FEATURE OPENER','ARTICLE','INTERVIEW','PHOTO ESSAY','BACK COVER'])assert.ok(magazine.pages.includes(page as any),`${magazine.name}: ${page}`)});
test('children books and photo books have medium-specific pacing',()=>{for(const story of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='CHILDREN’S BOOK'))assert.ok(story.pages.some(p=>['STORY SPREAD','BOARD PAGE','COLOURING PAGE'].includes(p)),story.name);for(const album of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='PHOTO BOOK'))for(const page of ['FULL BLEED','PHOTO GRID','CAPTIONED PHOTO'])assert.ok(album.pages.includes(page as any),`${album.name}: ${page}`)});

test('Lorea comic designer receives expanded comic, manga and webtoon panel presets',()=>{assert.ok(COMIC_LAYOUTS.length>=22);for(const id of ['cinematic-5','inset-reveal','action-diagonal','kids-open-4','manga-silence','manga-reaction','manga-romance','webtoon-reveal'])assert.ok(COMIC_LAYOUTS.some(layout=>layout.id===id),id);for(const layout of COMIC_LAYOUTS){assert.ok(layout.panels.length>0,layout.name);for(const panel of layout.panels){assert.ok(panel.x>=0&&panel.y>=0&&panel.width>0&&panel.height>0);assert.ok(panel.x+panel.width<=100.01&&panel.y+panel.height<=100.01,layout.name)}}});

test('comic publication packs generate editable panels, balloons and reading cues',()=>{for(const template of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='COMIC & MANGA')){const pageType=template.pages.find(page=>page==='COMIC PAGE'||page==='MANGA PAGE'||page==='WEBTOON EPISODE');if(!pageType)continue;const objects=instantiatePublicationPage(template,pageType,2);assert.ok(objects.filter(object=>/image well/i.test(object.objectLabel||'')).length>=3,template.name);assert.ok(objects.some(object=>/balloon|dialogue/i.test(object.objectLabel||'')),template.name)}});

// ── Registry integrity: fail loudly instead of silently falling back to the legacy composers ──
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pubCampaigns from '../services/tela/designs/publications/campaigns';
import * as pubEditorial from '../services/tela/designs/publications/editorial';
import * as pubBooks from '../services/tela/designs/publications/books';
import * as pubComics from '../services/tela/designs/publications/comics';
import * as pubArticles from '../services/tela/designs/publications/articles';
import * as pubCatalogs from '../services/tela/designs/publications/catalogs';
import * as pubMagazines from '../services/tela/designs/publications/magazines';
import { PUBLICATION_DESIGNS, PUBLICATION_LESSONS } from '../services/tela/designs/publications';

const PUB_GROUPS: Record<string, any> = { campaigns: pubCampaigns, editorial: pubEditorial, books: pubBooks, comics: pubComics, articles: pubArticles, catalogs: pubCatalogs, magazines: pubMagazines };

test('every publication group module exports DESIGNS and LESSONS objects', () => {
  for (const [name, mod] of Object.entries(PUB_GROUPS)) {
    assert.ok(mod.DESIGNS && typeof mod.DESIGNS === 'object', `${name}.ts must export DESIGNS`);
    assert.ok(mod.LESSONS && typeof mod.LESSONS === 'object', `${name}.ts must export LESSONS`);
  }
});

test('book and comic templates all have a registered designer and a lesson', () => {
  const ids = TELA_PUBLICATION_TEMPLATES.filter(t => /^(story|photo|comic|manga)-/.test(t.id)).map(t => t.id);
  assert.ok(ids.length >= 20, 'expected the 12 book + 8 comic templates');
  for (const id of ids) {
    assert.equal(typeof PUBLICATION_DESIGNS[id], 'function', `${id} has no designer`);
    assert.ok(PUBLICATION_LESSONS[id]?.principle, `${id} has no lesson`);
  }
});

test('book designers cover every page type each template lists', () => {
  for (const t of TELA_PUBLICATION_TEMPLATES.filter(t => /^(story|photo)-/.test(t.id))) {
    t.pages.forEach((pageType, i) => {
      const objs = PUBLICATION_DESIGNS[t.id]({ template: t, pageType, pageIndex: i, pageCount: t.pages.length, W: t.width, H: t.height, fr: { W: t.width, H: t.height, m: 0, x: 0, y: 0, w: t.width, h: t.height, right: t.width, bottom: t.height, cx: t.width / 2, cy: t.height / 2 }, paper: t.palette[0], ink: t.palette[1], accent: t.palette[2], secondary: t.palette[3], seed: 7 });
      assert.ok(objs.length >= 10, `${t.id} ${pageType} #${i} is nearly empty`);
    });
  }
});

test('no publication group file contains a __PART placeholder', () => {
  const dir = join(process.cwd(), 'services/tela/designs/publications');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.ts'))) assert.ok(!/__PART\d*__/.test(readFileSync(join(dir, f), 'utf8')), `${f} still has a __PART placeholder`);
});
