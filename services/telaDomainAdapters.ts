import type {
  TelaBaseDevice, TelaBlock, TelaDoc, TelaDomainBinding, TelaField, TelaNoteEntry,
  TelaNotesDevice, TelaWriterDevice, OraEntry,
} from '../types';
import {
  BLOCK_KINDS, fetchSongs, parseLyrics, patchSong, type BlockKind, type LyricBlock, type MelosSong,
} from './melosService';
import { deleteEntry as deleteNotebookEntry, loadNotebook, putEntry, type SyncableEntry } from './notebookService';
import { deleteEntry as deleteOraEntry, listEntries as listOraEntries, saveEntry as saveOraEntry } from './oraService';
import { loadTelaDoc, saveTelaDoc } from './telaStore';

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const validLyricKinds = new Set(BLOCK_KINDS.map(kind => kind.key));
const plain = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const inline = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
const blockId = (source: string) => `blk_${source.replace(/[^a-z0-9_-]/gi, '_')}`;

function domain(provider: TelaDomainBinding['provider'], entity: TelaDomainBinding['entity'], patch: Omit<TelaDomainBinding, 'provider' | 'entity' | 'direction'>): TelaDomainBinding {
  return { provider, entity, direction: 'BIDIRECTIONAL', ...patch };
}

export function melosLyricsToTelaWriter(productionId: string, song: MelosSong, existingId?: string): TelaWriterDevice {
  const blocks: TelaBlock[] = (song.lyrics || []).map(section => ({
    id: blockId(section.id),
    kind: 'p',
    text: inline(section.lines.join('\n')),
    textRole: section.kind === 'NOTE' ? 'NOTE' : 'LYRIC',
    semanticLabel: section.label || BLOCK_KINDS.find(kind => kind.key === section.kind)?.label || section.kind,
    domainBlockId: section.id,
    domainBlockKind: section.kind,
    domainBlockLocked: section.locked,
  }));
  return {
    id: existingId || id('dev'), type: 'WRITER', mode: 'SONGWRITING',
    blocks: blocks.length ? blocks : [{ id: id('blk'), kind: 'p', text: '', textRole: 'LYRIC', semanticLabel: 'Verse', domainBlockKind: 'VERSE' }],
    domainBinding: domain('MELOS', 'SONG', { productionId, recordId: song.id, field: 'lyrics', label: `${song.title} · lyrics` }),
  };
}

export function telaWriterToMelosLyrics(writer: TelaWriterDevice): LyricBlock[] {
  return writer.blocks.map((block, index) => {
    const requested = block.domainBlockKind as BlockKind | undefined;
    const kind: BlockKind = requested && validLyricKinds.has(requested) ? requested : block.textRole === 'NOTE' ? 'NOTE' : 'VERSE';
    return {
      id: block.domainBlockId || `lb_tela_${block.id}`,
      kind,
      label: block.semanticLabel || (kind === 'VERSE' ? `Verse ${index + 1}` : undefined),
      lines: plain(block.text).split('\n'),
      locked: block.domainBlockLocked,
    };
  });
}

export function melosSongsToTelaTracklist(productionId: string, songs: MelosSong[], existingId?: string): TelaBaseDevice {
  const field = (domainField: string, name: string, type: TelaField['type'], options?: string[]): TelaField => ({ id: `melos_${domainField}`, name, type, options, domainField });
  return {
    id: existingId || id('dev'), type: 'BASE', name: 'Melos tracklist',
    domainBinding: domain('MELOS', 'TRACKLIST', { productionId, field: 'songs', label: 'Melos · live tracklist' }),
    fields: [
      field('title', 'Song', 'TEXT'),
      field('state', 'Stage', 'SELECT', ['SPARK', 'WRITING', 'DEMO', 'TRACKING', 'MIXING', 'FINISHED']),
      field('commitment', 'Commitment', 'SELECT', ['DEFINITE', 'LIKELY', 'MAYBE', 'CUT']),
      field('love', 'Love', 'NUMBER'), field('confidence', 'Confidence', 'NUMBER'),
      field('durationSec', 'Seconds', 'NUMBER'), field('order', 'Order', 'NUMBER'),
    ],
    rows: songs.map(song => ({ id: song.id, values: {
      melos_title: song.title, melos_state: song.state, melos_commitment: song.commitment,
      melos_love: String(song.love ?? 0), melos_confidence: String(song.confidence ?? 0),
      melos_durationSec: song.durationSec ? String(song.durationSec) : '', melos_order: String(song.order ?? 0),
    } })),
  };
}

function songNotesDevice(productionId: string, song: MelosSong, existingId?: string): TelaNotesDevice {
  const now = Date.now();
  return {
    id: existingId || id('dev'), type: 'NOTES', name: `${song.title} notebook`, defaultKind: 'LYRIC_IDEA',
    domainBinding: domain('MELOS', 'SONG', { productionId, recordId: song.id, field: 'notes', label: `${song.title} · notebook` }),
    entries: [{ id: `song_note_${song.id}`, domainRecordId: song.id, kind: 'LYRIC_IDEA', title: `${song.title} · making notes`, blocks: [{ id: id('blk'), kind: 'p', text: inline(song.notes || ''), textRole: 'NOTE' }], tags: ['melos', 'songwriting'], createdAt: song.createdAt || now, updatedAt: song.updatedAt || now, privacy: 'PRIVATE' }],
    activeEntryId: `song_note_${song.id}`,
  };
}

function noteEntryFromSync(entry: SyncableEntry): TelaNoteEntry {
  const content = String(entry.content || entry.text || entry.body || '');
  const kind = entry.type === 'JOURNAL' ? 'JOURNAL' : entry.type === 'LYRIC_IDEA' ? 'LYRIC_IDEA' : entry.type === 'OBSERVATION' ? 'OBSERVATION' : entry.type === 'RESEARCH' || entry.type === 'EXPERIMENT' || entry.type === 'DATA' ? 'RESEARCH' : entry.type === 'POEM' ? 'POEM' : 'NOTE';
  return {
    id: entry.id, domainRecordId: entry.id, kind,
    title: String(entry.title || 'Untitled note'),
    blocks: [{ id: blockId(`${entry.id}_body`), kind: 'p', text: inline(content), textRole: kind === 'JOURNAL' ? 'JOURNAL' : kind === 'POEM' ? 'POETRY' : 'NOTE' }],
    tags: Array.isArray(entry.tags) ? entry.tags : [], createdAt: entry.createdAt || Date.now(), updatedAt: entry.updatedAt || Date.now(), pinned: !!entry.isPinned, privacy: 'PRIVATE',
  };
}

function syncFromNoteEntry(entry: TelaNoteEntry): SyncableEntry {
  const content = entry.blocks.map(block => plain(block.text)).join('\n\n');
  return {
    id: entry.domainRecordId || entry.id,
    type: entry.kind === 'JOURNAL' ? 'JOURNAL' : entry.kind === 'LYRIC_IDEA' ? 'LYRIC_IDEA' : entry.kind === 'OBSERVATION' ? 'OBSERVATION' : entry.kind === 'RESEARCH' ? 'NOTE' : entry.kind === 'POEM' ? 'POEM' : 'NOTE',
    title: entry.title, content, text: content, tags: entry.tags,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt, isPinned: !!entry.pinned,
  };
}

export function notebookEntriesToTelaDevice(storageKey: string, entries: SyncableEntry[], name = 'Plajah Notes', existingId?: string): TelaNotesDevice {
  const converted = entries.map(noteEntryFromSync);
  return { id: existingId || id('dev'), type: 'NOTES', name, entries: converted, activeEntryId: converted[0]?.id, defaultKind: 'NOTE', domainBinding: domain('NOTEBOOK', 'NOTEBOOK', { storageKey, label: `${name} · account sync` }) };
}

function oraEntriesToTelaDevice(entries: OraEntry[], ownerId: string, existingId?: string): TelaNotesDevice {
  const converted: TelaNoteEntry[] = entries.map(entry => ({
    id: entry.id, domainRecordId: entry.id, kind: 'JOURNAL', title: entry.title || 'Untitled',
    blocks: [{ id: blockId(`${entry.id}_body`), kind: 'p', text: inline(entry.body), textRole: 'JOURNAL', semanticLabel: 'Journal' }],
    tags: [], createdAt: entry.createdAt, updatedAt: entry.updatedAt, privacy: 'PRIVATE',
  }));
  return { id: existingId || id('dev'), type: 'NOTES', name: 'Ora Longhand', entries: converted, activeEntryId: converted[0]?.id, defaultKind: 'JOURNAL', domainBinding: domain('PLAJAH', 'JOURNAL', { recordId: ownerId, field: 'ora_entries', label: 'Ora Longhand · encrypted', encryptedAtRest: true }) };
}

function melosDocId(productionId: string, suffix: string) { return `tela_melos_${productionId}_${suffix}`.replace(/[^a-z0-9_-]/gi, '_'); }

export async function openMelosSongInTela(productionId: string, song: MelosSong, songs: MelosSong[], ownerId: string) {
  const docId = melosDocId(productionId, song.id);
  const prior = await loadTelaDoc(docId);
  const writer = melosLyricsToTelaWriter(productionId, song, prior?.frames[0]?.deviceIds.map(deviceId => prior.devices[deviceId]).find(device => device?.type === 'WRITER')?.id);
  const tracklist = melosSongsToTelaTracklist(productionId, songs, prior?.frames.flatMap(frame => frame.deviceIds).map(deviceId => prior?.devices[deviceId]).find(device => device?.type === 'BASE')?.id);
  const notes = songNotesDevice(productionId, song, prior?.frames.flatMap(frame => frame.deviceIds).map(deviceId => prior?.devices[deviceId]).find(device => device?.type === 'NOTES')?.id);
  const now = Date.now();
  const doc: TelaDoc = {
    id: docId, ownerId, title: `${song.title} · Melos writing`, createdAt: prior?.createdAt || now, updatedAt: now, bindings: prior?.bindings || [],
    frames: [
      { id: prior?.frames[0]?.id || id('frame'), kind: 'PAPER', preset: 'LETTER', orientation: 'PORTRAIT', x: 0, y: 0, w: 816, h: 1056, deviceIds: [writer.id], label: `${song.title} · lyrics` },
      { id: prior?.frames[1]?.id || id('frame'), kind: 'BOARD', preset: 'FREE', x: 912, y: 0, w: 760, h: 560, deviceIds: [tracklist.id], label: 'Tracklist' },
      { id: prior?.frames[2]?.id || id('frame'), kind: 'BOARD', preset: 'FREE', x: 912, y: 650, w: 760, h: 560, deviceIds: [notes.id], label: 'Song notebook' },
    ], devices: { [writer.id]: writer, [tracklist.id]: tracklist, [notes.id]: notes },
  };
  await saveTelaDoc(doc);
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }));
  return doc;
}

export async function openMelosTracklistInTela(productionId: string, songs: MelosSong[], ownerId: string) {
  const docId = melosDocId(productionId, 'tracklist'); const prior = await loadTelaDoc(docId); const base = melosSongsToTelaTracklist(productionId, songs, prior?.frames[0]?.deviceIds.map(deviceId => prior.devices[deviceId]).find(device => device?.type === 'BASE')?.id); const now = Date.now();
  const doc: TelaDoc = { id: docId, ownerId, title: 'Melos tracklist', createdAt: prior?.createdAt || now, updatedAt: now, bindings: [], frames: [{ id: prior?.frames[0]?.id || id('frame'), kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: 980, h: 620, deviceIds: [base.id], label: 'Tracklist' }], devices: { [base.id]: base } };
  await saveTelaDoc(doc); window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } })); return doc;
}

export async function openNotebookInTela(storageKey: string, entries: SyncableEntry[], ownerId: string, title = 'Plajah Notes') {
  const docId = `tela_notes_${ownerId}_${storageKey.split('_')[0]}`.replace(/[^a-z0-9_-]/gi, '_'); const prior = await loadTelaDoc(docId); const notes = notebookEntriesToTelaDevice(storageKey, entries, title, prior?.frames[0]?.deviceIds.map(deviceId => prior.devices[deviceId]).find(device => device?.type === 'NOTES')?.id); const now = Date.now();
  const doc: TelaDoc = { id: docId, ownerId, title, createdAt: prior?.createdAt || now, updatedAt: now, bindings: [], frames: [{ id: prior?.frames[0]?.id || id('frame'), kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: 980, h: 680, deviceIds: [notes.id], label: title }], devices: { [notes.id]: notes } };
  await saveTelaDoc(doc); window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } })); return doc;
}

export async function openOraJournalInTela(entries: OraEntry[], ownerId: string) {
  const docId = `tela_ora_journal_${ownerId}`.replace(/[^a-z0-9_-]/gi, '_'); const prior = await loadTelaDoc(docId); const notes = oraEntriesToTelaDevice(entries, ownerId, prior?.frames[0]?.deviceIds.map(deviceId => prior.devices[deviceId]).find(device => device?.type === 'NOTES')?.id); const now = Date.now();
  const doc: TelaDoc = { id: docId, ownerId, title: 'Ora Longhand · private journal', createdAt: prior?.createdAt || now, updatedAt: now, bindings: [], frames: [{ id: prior?.frames[0]?.id || id('frame'), kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: 980, h: 680, deviceIds: [notes.id], label: 'Longhand' }], devices: { [notes.id]: notes } };
  await saveTelaDoc(doc); window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } })); return doc;
}

/** Refresh domain-bound components when a Tela document opens. */
export async function hydrateTelaDomainDoc(doc: TelaDoc): Promise<TelaDoc> {
  const devices = { ...doc.devices }; let changed = false;
  const songCache = new Map<string, Promise<MelosSong[]>>();
  const songsFor = (productionId: string) => { let request = songCache.get(productionId); if (!request) { request = fetchSongs(productionId); songCache.set(productionId, request); } return request; };
  for (const [deviceId, device] of Object.entries(devices)) {
    const binding = 'domainBinding' in device ? device.domainBinding : undefined; if (!binding) continue;
    if (binding.provider === 'MELOS' && binding.productionId) {
      const songs = await songsFor(binding.productionId);
      if (device.type === 'WRITER' && binding.entity === 'SONG' && binding.field === 'lyrics') { const song = songs.find(item => item.id === binding.recordId); if (song) { devices[deviceId] = melosLyricsToTelaWriter(binding.productionId, song, device.id); changed = true; } }
      if (device.type === 'BASE' && binding.entity === 'TRACKLIST') { devices[deviceId] = melosSongsToTelaTracklist(binding.productionId, songs, device.id); changed = true; }
      if (device.type === 'NOTES' && binding.entity === 'SONG') { const song = songs.find(item => item.id === binding.recordId); if (song) { devices[deviceId] = songNotesDevice(binding.productionId, song, device.id); changed = true; } }
    }
    if (binding.provider === 'NOTEBOOK' && device.type === 'NOTES' && binding.storageKey) { devices[deviceId] = notebookEntriesToTelaDevice(binding.storageKey, await loadNotebook(binding.storageKey), device.name, device.id); changed = true; }
    if (binding.provider === 'PLAJAH' && binding.entity === 'JOURNAL' && device.type === 'NOTES') { devices[deviceId] = oraEntriesToTelaDevice(await listOraEntries(100), binding.recordId || doc.ownerId, device.id); changed = true; }
  }
  return changed ? { ...doc, devices, updatedAt: Math.max(doc.updatedAt, Date.now()) } : doc;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function queue(key: string, work: () => void | Promise<void>) { const current = timers.get(key); if (current) clearTimeout(current); timers.set(key, setTimeout(() => { timers.delete(key); void work(); }, 550)); }

export function syncTelaWriterToDomain(writer: TelaWriterDevice, blocks: TelaBlock[]) {
  const binding = writer.domainBinding; if (!binding || binding.provider !== 'MELOS' || !binding.productionId || !binding.recordId) return;
  const next = { ...writer, blocks };
  queue(`writer:${writer.id}`, () => patchSong(binding.productionId!, binding.recordId!, binding.field === 'lyrics' ? { lyrics: telaWriterToMelosLyrics(next) } : { notes: blocks.map(block => plain(block.text)).join('\n\n') }));
}

export function syncTelaBaseCellToDomain(base: TelaBaseDevice, rowId: string, fieldId: string, value: string) {
  const binding = base.domainBinding; const field = base.fields.find(item => item.id === fieldId); if (!binding || binding.provider !== 'MELOS' || binding.entity !== 'TRACKLIST' || !binding.productionId || !field?.domainField) return;
  const numeric = ['love', 'confidence', 'durationSec', 'order'].includes(field.domainField);
  queue(`base:${base.id}:${rowId}:${fieldId}`, () => patchSong(binding.productionId!, rowId, { [field.domainField!]: numeric ? Number(value || 0) : value }));
}

export function syncTelaNotesToDomain(before: TelaNotesDevice, after: TelaNotesDevice) {
  const binding = after.domainBinding; if (!binding) return;
  if (binding.provider === 'MELOS' && binding.productionId && binding.recordId && binding.field === 'notes') {
    const text = after.entries[0]?.blocks.map(block => plain(block.text)).join('\n\n') || '';
    queue(`notes:${after.id}`, () => patchSong(binding.productionId!, binding.recordId!, { notes: text }));
  }
  if (binding.provider === 'NOTEBOOK' && binding.storageKey) {
    const key = binding.storageKey; const rows = after.entries.map(syncFromNoteEntry); const removed = before.entries.filter(entry => !after.entries.some(next => next.id === entry.id));
    try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* browser storage unavailable */ }
    queue(`notes:${after.id}`, async () => { await Promise.all(rows.map(entry => putEntry(key, entry))); await Promise.all(removed.map(entry => deleteNotebookEntry(key, entry.domainRecordId || entry.id))); });
  }
  if (binding.provider === 'PLAJAH' && binding.entity === 'JOURNAL') {
    const removed = before.entries.filter(entry => !after.entries.some(next => next.id === entry.id));
    queue(`notes:${after.id}`, async () => {
      await Promise.all(after.entries.map(entry => saveOraEntry({ id: entry.domainRecordId || entry.id, title: entry.title || undefined, body: entry.blocks.map(block => plain(block.text)).join('\n\n'), createdAt: entry.createdAt, visibility: 'PRIVATE' })));
      await Promise.all(removed.map(entry => deleteOraEntry(entry.domainRecordId || entry.id)));
    });
  }
}
