import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessFilm, filmReleaseClearance, usWorkCutoffYear } from '../services/publicDomainRights';
import { FILM_RIGHTS, filmClearanceFor } from '../data/filmRights';
import { ALL_CURATED_ARCHIVE_FILMS } from '../services/archiveContentService';

const NOW = new Date(Date.UTC(2026, 10, 9));
const NEXT_YEAR = new Date(Date.UTC(2027, 0, 2));

test('a film from 1930 or earlier is free in the US on its year alone', () => {
  const c = filmReleaseClearance({ releaseYear: 1930, country: 'SU' }, NOW);
  assert.equal(c.level, 'CLEAR');
  assert.equal(c.film.freeFrom, 2026);
});

test('a 1931 film waits for 1 Jan 2027, then clears', () => {
  const before = filmReleaseClearance({ releaseYear: 1931, country: 'DE' }, NOW);
  assert.equal(before.level, 'WAIT');
  assert.equal(before.film.freeFrom, 2027);
  assert.equal(filmReleaseClearance({ releaseYear: 1931, country: 'DE' }, NEXT_YEAR).level, 'CLEAR');
});

test('a US film that lapsed is free; a foreign one was restored in 1996', () => {
  assert.equal(filmReleaseClearance({ releaseYear: 1968, country: 'US', lapse: 'NO_NOTICE' }, NOW).level, 'CLEAR');
  const foreign = filmReleaseClearance({ releaseYear: 1960, country: 'IT', lapse: 'NOT_RENEWED' }, NOW);
  assert.equal(foreign.level, 'WAIT');
  assert.equal(foreign.film.freeFrom, 2056);
  assert.equal(filmReleaseClearance({ releaseYear: 1960, country: 'IT', lapse: 'NOT_RENEWED', notRestored: true }, NOW).level, 'CLEAR');
  assert.equal(filmReleaseClearance({ releaseYear: 1960, lapse: 'NOT_RENEWED' }, NOW).level, 'CHECK');
});

test('US government films are free; unknown years and flagged titles need a check', () => {
  assert.equal(filmReleaseClearance({ releaseYear: 1944, lapse: 'US_GOVERNMENT' }, NOW).level, 'CLEAR');
  assert.equal(filmReleaseClearance({}, NOW).level, 'CHECK');
  assert.equal(filmReleaseClearance({ releaseYear: 1972, country: 'US', lapse: 'NO_NOTICE', needsCheck: 'disputed.' }, NOW).level, 'CHECK');
});

test('hazards: held music and source works caution, free ones drop away, trademarks always stay', () => {
  const charade = filmReleaseClearance({ releaseYear: 1963, country: 'US', lapse: 'NO_NOTICE', hazards: [{ kind: 'MUSIC', what: 'score', publishedYear: 1963 }] }, NOW);
  assert.equal(charade.level, 'CAUTION');
  const freeSource = filmReleaseClearance({ releaseYear: 1932, country: 'US', lapse: 'NOT_RENEWED', hazards: [{ kind: 'UNDERLYING_WORK', what: 'story', publishedYear: 1924 }] }, NOW);
  assert.equal(freeSource.level, 'CLEAR');
  assert.equal(freeSource.hazards.length, 0);
  const mark = filmReleaseClearance({ releaseYear: 1928, hazards: [{ kind: 'TRADEMARK', what: 'Mickey Mouse' }] }, NOW);
  assert.equal(mark.level, 'CAUTION');
});

test('EU/UK count from the last creator to die', () => {
  const [eu] = assessFilm({ releaseYear: 1922, lastCreatorDeathYear: 1931 }, ['EU'], NOW);
  assert.equal(eu.status, 'PUBLIC_DOMAIN');
  assert.equal(eu.freeFrom, 2002);
  const [uk] = assessFilm({ releaseYear: 1968, lastCreatorDeathYear: 2017 }, ['UK'], NOW);
  assert.equal(uk.status, 'PROTECTED');
  assert.equal(assessFilm({ releaseYear: 1968 }, ['EU'], NOW)[0].status, 'UNKNOWN');
});

test('every vault film released after the US cutoff has a rights entry', () => {
  const cutoff = usWorkCutoffYear(NOW);
  const missing = ALL_CURATED_ARCHIVE_FILMS
    .filter(f => Number(String(f.year).slice(0, 4)) > cutoff && !FILM_RIGHTS[f.identifier])
    .map(f => `${f.identifier} (${f.year})`);
  assert.deepEqual(missing, []);
});

test('every rights entry points at a real vault film', () => {
  const ids = new Set(ALL_CURATED_ARCHIVE_FILMS.map(f => f.identifier));
  assert.deepEqual(Object.keys(FILM_RIGHTS).filter(id => !ids.has(id)), []);
});

test('the vault titles discussed land where expected', () => {
  const level = (id: string) => {
    const f = ALL_CURATED_ARCHIVE_FILMS.find(x => x.identifier === id);
    assert.ok(f, id);
    return filmClearanceFor(f, NOW).level;
  };
  assert.equal(level('Night.Of.The.Living.Dead_1080p'), 'CLEAR');
  assert.equal(level('europeana-nosferatu-1922'), 'CLEAR');
  assert.equal(level('Horror_Express'), 'CHECK');
  assert.equal(level('ia-charade-1963'), 'CAUTION');
  assert.equal(level('lang-m-1931'), 'WAIT');
  assert.equal(level('intl-rashomon-1950'), 'WAIT');
  assert.equal(level('wwf_prelude_to_war'), 'CLEAR');
});
