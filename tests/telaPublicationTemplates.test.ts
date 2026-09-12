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
test('children books and photo books have medium-specific pacing',()=>{for(const story of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='CHILDREN’S BOOK'))assert.ok(story.pages.includes('STORY SPREAD'));for(const album of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='PHOTO BOOK'))for(const page of ['FULL BLEED','PHOTO GRID','CAPTIONED PHOTO'])assert.ok(album.pages.includes(page as any),`${album.name}: ${page}`)});

test('Lorea comic designer receives expanded comic, manga and webtoon panel presets',()=>{assert.ok(COMIC_LAYOUTS.length>=22);for(const id of ['cinematic-5','inset-reveal','action-diagonal','kids-open-4','manga-silence','manga-reaction','manga-romance','webtoon-reveal'])assert.ok(COMIC_LAYOUTS.some(layout=>layout.id===id),id);for(const layout of COMIC_LAYOUTS){assert.ok(layout.panels.length>0,layout.name);for(const panel of layout.panels){assert.ok(panel.x>=0&&panel.y>=0&&panel.width>0&&panel.height>0);assert.ok(panel.x+panel.width<=100.01&&panel.y+panel.height<=100.01,layout.name)}}});

test('comic publication packs generate editable panels, balloons and reading cues',()=>{for(const template of TELA_PUBLICATION_TEMPLATES.filter(t=>t.category==='COMIC & MANGA')){const pageType=template.pages.find(page=>page==='COMIC PAGE'||page==='MANGA PAGE'||page==='WEBTOON EPISODE');if(!pageType)continue;const objects=instantiatePublicationPage(template,pageType,2);assert.ok(objects.filter(object=>/image well/i.test(object.objectLabel||'')).length>=3,template.name);assert.ok(objects.some(object=>/balloon|dialogue/i.test(object.objectLabel||'')),template.name)}});
