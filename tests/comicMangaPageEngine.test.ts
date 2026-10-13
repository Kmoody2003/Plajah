import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  comicMangaPageEngine,
  ComicMangaPage,
  LAYOUT_PRESETS,
} from '../services/comic/comicMangaPageEngine';
import {
  createDefaultCharacter,
  saveCharacter,
} from '../services/story/characterBible';

test('Comic & Manga Page Engine: Creates page with dynamic Shonen 5-panel layout', () => {
  const page = comicMangaPageEngine.createPage({
    title: 'Episode 1: Awakening',
    layoutId: 'dynamic_manga_5',
    stylePreset: 'manga',
  });

  assert.equal(page.title, 'Episode 1: Awakening');
  assert.equal(page.layoutId, 'dynamic_manga_5');
  assert.equal(page.readingDirection, 'rtl'); // Manga is RTL
  assert.equal(page.panels.length, 5);

  // Check top banner panel geometry
  const topPanel = page.panels[0];
  assert.equal(topPanel.box.panelIndex, 0);
  assert.ok(topPanel.box.widthPct > 90, 'Top action panel should span page width');
  assert.equal(topPanel.screentone.enabled, true);
  assert.equal(topPanel.screentone.pattern, 'dots_fine');
});

test('Comic & Manga Page Engine: All layout presets generate valid non-overlapping bounds', () => {
  const layouts: (keyof typeof LAYOUT_PRESETS)[] = [
    'grid_6_classic',
    'dynamic_manga_5',
    'yonkoma_4',
    'splash_heroic',
    'widescreen_cinematic_3',
  ];

  for (const layoutId of layouts) {
    const page = comicMangaPageEngine.createPage({ layoutId });
    assert.equal(page.panels.length, LAYOUT_PRESETS[layoutId].defaultPanels);

    for (const panel of page.panels) {
      assert.ok(panel.box.xPct >= 0 && panel.box.xPct <= 100, `Panel ${panel.id} xPct within 0..100`);
      assert.ok(panel.box.yPct >= 0 && panel.box.yPct <= 100, `Panel ${panel.id} yPct within 0..100`);
      assert.ok(panel.box.widthPct > 0 && panel.box.widthPct <= 100, `Panel ${panel.id} widthPct within 0..100`);
      assert.ok(panel.box.heightPct > 0 && panel.box.heightPct <= 100, `Panel ${panel.id} heightPct within 0..100`);
    }
  }
});

test('Comic & Manga Page Engine: Compiles sequential tasks locking Character Bible likeness anchor', () => {
  const char = createDefaultCharacter('Ren Takahashi', 'angular jaw, raven spiked hair, high-collared shadow shinobi uniform');
  char.turnaroundUrls.closeUp = 'blob:http://localhost/ren_close.png';
  saveCharacter(char);

  const page = comicMangaPageEngine.createPage({
    layoutId: 'dynamic_manga_5',
    stylePreset: 'manga',
    primaryCharacterId: char.id,
  });

  const tasks = comicMangaPageEngine.compilePageTasks(page, char);

  assert.equal(tasks.length, 5);
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    assert.equal(task.taskType, 'comic_panel');
    assert.equal(task.modelId, 'flux2_klein_4b');
    assert.equal(task.lora?.id, 'flux_lora_manga_screentone');
    assert.ok(task.prompt.includes('Ren Takahashi'));
    assert.ok(task.prompt.includes('raven spiked hair'));
    assert.equal(task.identity?.characterRef, 'blob:http://localhost/ren_close.png');
    assert.equal(task.identity?.likenessStrength, 0.85);
  }
});

test('Comic & Manga Page Engine: Generates procedural SVG screentone shader patterns', () => {
  const defs = comicMangaPageEngine.generateSvgDefs();

  assert.ok(defs.includes('id="screentone-dots-fine"'), 'Must define fine halftone dot pattern');
  assert.ok(defs.includes('id="screentone-dots-coarse"'), 'Must define coarse halftone dot pattern');
  assert.ok(defs.includes('id="screentone-speed-lines"'), 'Must define dynamic speed lines pattern');
  assert.ok(defs.includes('id="screentone-crosshatch"'), 'Must define crosshatch shader pattern');
  assert.ok(defs.includes('id="screentone-radial-burst"'), 'Must define radial burst focus gradient');
  assert.ok(defs.includes('id="balloon-shadow"'), 'Must define balloon drop shadow filter');
});

test('Comic & Manga Page Engine: Renders vector speech balloons and SFX', () => {
  // Test Speech Balloon
  const speechBalloon = comicMangaPageEngine.renderBalloonSvg(
    {
      id: 'b_test_1',
      type: 'speech',
      text: 'Stand back, the core is overloading!',
      xPct: 15,
      yPct: 20,
      tailDirection: 'bottom_left',
    },
    800,
    600
  );
  assert.ok(speechBalloon.includes('Stand back, the core is overloading!'));
  assert.ok(speechBalloon.includes('<rect'), 'Speech balloon must have rectangular body');
  assert.ok(speechBalloon.includes('<path'), 'Speech balloon must have tail path');

  // Test SFX
  const sfx = comicMangaPageEngine.renderBalloonSvg(
    {
      id: 'b_sfx_1',
      type: 'sfx',
      text: 'DOOOOM!',
      xPct: 50,
      yPct: 50,
      sfxColor: '#FF1493',
      sfxScale: 1.5,
    },
    800,
    600
  );
  assert.ok(sfx.includes('DOOOOM!'));
  assert.ok(sfx.includes('fill="#FF1493"'));
  assert.ok(sfx.includes('filter="url(#sfx-glow)"'));
});

test('Comic & Manga Page Engine: Full page SVG rendering produces valid standalone document', () => {
  const page = comicMangaPageEngine.createPage({
    title: 'The Cybernetic Ronin',
    layoutId: 'widescreen_cinematic_3',
    stylePreset: 'graphic_novel_noir',
  });

  const svg = comicMangaPageEngine.renderPageToSvg(page);

  assert.ok(svg.startsWith('<svg'), 'Document must start with <svg');
  assert.ok(svg.endsWith('</svg>'), 'Document must terminate with </svg>');
  assert.ok(svg.includes('viewBox="0 0 1200 1600"'));
  assert.ok(svg.includes('clip-path="url(#clip_panel_'));
  assert.ok(svg.includes('stroke="#000000"') && svg.includes('stroke-width="3"'), 'Must render heavy panel ink borders');
});

test('Comic & Manga Page Engine: Multi-voice audio casting binds dialogue bubbles', async () => {
  const page = comicMangaPageEngine.createPage({ layoutId: 'yonkoma_4' });
  for (const p of page.panels) {
    p.balloons = [];
  }
  page.panels[0].balloons = [
    {
      id: 'b_aria_1',
      type: 'speech',
      text: 'The dock will not hold another gravitational wave.',
      xPct: 10,
      yPct: 10,
      speakerName: 'Aria',
    },
  ];

  const results = await comicMangaPageEngine.synthesizePageDialogueAudio(page, 'Aria');

  assert.equal(results.length, 1);
  assert.equal(results[0].balloonId, 'b_aria_1');
  assert.equal(results[0].take.speakerName, 'Aria');
  assert.ok(results[0].take.durationSeconds > 0);
  assert.ok(results[0].take.audioBlob);
});
