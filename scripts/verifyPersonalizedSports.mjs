import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.PLAJAH_TEST_ORIGIN || 'http://localhost:3000';
const output = process.env.PLAJAH_TEST_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {PersonalizedSportsLanding} from './components/sports/PersonalizedSportsLanding';
    import {FollowSportsTeamsDialog} from './components/sports/FollowSportsTeamsDialog';
    function Harness() {
      const [favorites,setFavorites]=useState([]),[open,setOpen]=useState(false);
      window.setTestFavorites=setFavorites;
      return <><PersonalizedSportsLanding favorites={favorites} onExplore={league=>window.exploredLeague=league} onFollow={()=>setOpen(true)} />
        {open&&<FollowSportsTeamsDialog favorites={favorites} onChange={setFavorites} onClose={()=>setOpen(false)} />}</>;
    }
    window.addEventListener('plajah:open-fanroom',e=>window.testFanRoom=e.detail);
    createRoot(document.getElementById('root')).render(<Harness />);
  ` }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
});

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/New_York' });
    await page.clock.install({ time: new Date('2026-09-13T18:00:00Z') });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let scenario = 'today';
    let requests = 0;
    await page.route('**/__sports_bundle', route => route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }));
    await page.route('**/__personalized_sports', route => route.fulfill({ contentType: 'text/html', body: `<html><head><link rel="stylesheet" href="/index.css?direct"></head><body style="margin:0;padding:20px;background:var(--bg-color);color:var(--text-primary)"><div id="root"></div><script src="/__sports_bundle"></script></body></html>` }));
    await page.route('**/scoreboard?*', route => {
      requests++;
      if (scenario === 'failed') return route.fulfill({ status: 503, body: 'Unavailable' });
      const baseball = route.request().url().includes('/baseball/');
      const event = {
        id: baseball ? 'baseball-game' : 'football-game', name: baseball ? 'New York Yankees at Opponent' : 'Green Bay Packers at Opponent',
        date: scenario === 'offday' ? '2026-09-14T18:00:00Z' : '2026-09-13T18:00:00Z',
        status: { type: { state: scenario === 'final' ? 'post' : scenario === 'offday' ? 'pre' : 'in', name: scenario === 'postponed' ? 'STATUS_POSTPONED' : undefined, shortDetail: scenario === 'final' ? 'Final' : 'Game status' } },
        competitions: [{ competitors: [
          { homeAway: 'away', team: { id: '9', displayName: baseball ? 'New York Yankees' : 'Green Bay Packers', abbreviation: baseball ? 'NYY' : 'GB' }, score: '0' },
          { homeAway: 'home', team: { id: '16', displayName: 'Opponent', abbreviation: 'OPP' }, score: { displayValue: '7' } },
        ] }], links: [{ rel: ['summary'], href: 'https://www.espn.com/nfl/game/_/gameId/football-game' }],
      };
      return route.fulfill({ json: { events: [event] } });
    });
    await page.goto(`${origin}/__personalized_sports`, { waitUntil: 'domcontentloaded' });
    const landing = page.locator('[data-sports-mode]');
    await page.getByRole('button', { name: 'Follow teams', exact: true }).waitFor();
    assert.equal(await landing.getAttribute('data-sports-mode'), 'hub');
    assert.equal(requests, 0, 'No favorites must not request team schedules');
    await page.getByRole('button', { name: 'Follow teams', exact: true }).click();
    await page.getByLabel('Find a team').fill('Green Bay Packers');
    await page.getByRole('button', { name: 'Follow Green Bay Packers', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('[data-sports-mode="gameday"]').waitFor();
    assert.equal(await page.getByText('0', { exact: true }).count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Fan room', exact: true }).click();
    assert.equal(await page.evaluate(() => window.testFanRoom.match.sportsLeague), 'NFL');
    if (output) await page.screenshot({ path: path.join(output, `sports-gameday-${width}.png`), fullPage: true });

    scenario = 'offday';
    await page.getByRole('button', { name: 'Refresh followed team schedules' }).click();
    await page.getByRole('heading', { name: 'Next for your teams' }).waitFor();
    assert.equal(await landing.getAttribute('data-sports-mode'), 'hub');
    if (output) await page.screenshot({ path: path.join(output, `sports-hub-${width}.png`), fullPage: true });

    scenario = 'today';
    await page.evaluate(() => window.setTestFavorites([{ name: 'Green Bay Packers', league: 'NFL' }, { name: 'New York Yankees', league: 'MLB' }]));
    await page.getByLabel('MLB New York Yankees at Opponent', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Fan room', exact: true }).count(), 2);

    scenario = 'failed';
    await page.getByRole('button', { name: 'Refresh followed team schedules' }).click();
    await page.getByText(/Schedule updates unavailable for/).waitFor();
    assert.equal(await landing.getAttribute('data-sports-mode'), 'hub');
    assert.equal(await page.getByRole('button', { name: 'Fan room', exact: true }).count(), 0);

    scenario = 'final';
    await page.getByRole('button', { name: 'Refresh followed team schedules' }).click();
    await page.getByRole('link', { name: 'Recap & box score' }).first().waitFor();
    assert.equal(await landing.getAttribute('data-sports-mode'), 'gameday');
    await page.clock.setSystemTime(new Date('2026-09-14T04:01:00Z'));
    await page.clock.fastForward(15_000);
    await page.locator('[data-sports-mode="hub"]').waitFor();
    await page.evaluate(() => window.setTestFavorites([]));
    await page.getByRole('button', { name: 'Follow teams', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${width}px: follow picker, game day, off day, multi-league, failure, recap and midnight rollover passed`);
    await page.close();
  }
} finally { await browser.close(); }
