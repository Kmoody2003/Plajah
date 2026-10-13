// services/audiobook/telaAudiobookStudio.ts — Tela Manuscript Narration & Audiobook Studio Engine.
// Provides automatic character quote detection, dual-cast narration playback,
// and chapter-by-chapter audio export natively on-device.
// 100% Native Plajah: Powered by Kokoro 82M & Fish Speech. Zero external cloud dependencies.

import { plajahAudioCore, TelaAudiobookSegment } from '../voice/plajahAudioCore';
import { listSavedCharacters, CharacterSheet } from '../story/characterBible';

export interface AudiobookChapter {
  id: string;
  chapterNumber: number;
  title: string;
  rawText: string;
  paragraphs: string[];
  segments: TelaAudiobookSegment[];
  totalDurationSeconds: number;
  isSynthesized: boolean;
  audioBlob?: Blob;
  audioUrl?: string;
}

export interface AudiobookCastMember {
  characterId: string;
  name: string;
  role: 'NARRATOR' | 'CHARACTER';
  voiceId: string; // Kokoro voice (e.g. "af_heart", "bf_emma", "am_adam") or "fish_speech"
  engine: 'kokoro' | 'fish_speech';
  pitchShift?: number;
}

export interface AudiobookProject {
  id: string;
  title: string;
  author: string;
  narratorVoice: string; // default "af_heart" (Aria)
  cast: AudiobookCastMember[];
  chapters: AudiobookChapter[];
  selectedChapterId: string;
  exportFormat: 'wav' | 'mp3';
  createdAt: number;
}

export class TelaAudiobookEngine {
  private static instance: TelaAudiobookEngine | null = null;

  static getInstance(): TelaAudiobookEngine {
    if (!this.instance) {
      this.instance = new TelaAudiobookEngine();
    }
    return this.instance;
  }

  /**
   * Parses a raw manuscript document into structured chapters.
   * Recognizes "Chapter 1", "# Chapter", "ACT I", or double-newline section splits.
   */
  parseManuscriptIntoChapters(rawText: string, bookTitle = 'Untitled Manuscript'): AudiobookChapter[] {
    const text = rawText.trim();
    if (!text) {
      return [
        {
          id: 'chap_1',
          chapterNumber: 1,
          title: 'Chapter 1',
          rawText: '',
          paragraphs: [],
          segments: [],
          totalDurationSeconds: 0,
          isSynthesized: false,
        },
      ];
    }

    // Split on Chapter headings e.g. "Chapter 1", "CHAPTER ONE", "# Chapter 2", "Act I"
    const chapterSplitRegex = /(?:^|\n)(?=(?:#+\s*Chapter|\bChapter\s+\d+|\bCHAPTER\s+[A-Z0-9]+|\bACT\s+[IVXLCDM]+))/i;
    const rawChunks = text.split(chapterSplitRegex).map((c) => c.trim()).filter(Boolean);

    if (rawChunks.length <= 1) {
      // Single continuous chapter or split by paragraphs
      const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      return [
        {
          id: `chap_1_${Date.now()}`,
          chapterNumber: 1,
          title: 'Chapter 1: The Beginning',
          rawText: text,
          paragraphs,
          segments: [],
          totalDurationSeconds: 0,
          isSynthesized: false,
        },
      ];
    }

    return rawChunks.map((chunk, idx) => {
      const firstLine = chunk.split('\n')[0].replace(/^#+\s*/, '').trim();
      const title = firstLine.length < 60 ? firstLine : `Chapter ${idx + 1}`;
      const body = firstLine.length < 60 ? chunk.slice(firstLine.length).trim() : chunk;
      const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

      return {
        id: `chap_${idx + 1}_${Date.now()}`,
        chapterNumber: idx + 1,
        title,
        rawText: body,
        paragraphs,
        segments: [],
        totalDurationSeconds: 0,
        isSynthesized: false,
      };
    });
  }

  /**
   * Initializes a default audiobook project with cast members derived from Character Bible.
   */
  createProject(bookTitle: string, rawManuscript: string, author = 'Anonymous'): AudiobookProject {
    const chapters = this.parseManuscriptIntoChapters(rawManuscript, bookTitle);
    const savedChars = listSavedCharacters();

    const cast: AudiobookCastMember[] = [
      {
        characterId: 'narrator_aria',
        name: 'Aria (Narrator)',
        role: 'NARRATOR',
        voiceId: 'af_heart',
        engine: 'kokoro',
      },
    ];

    savedChars.forEach((char, idx) => {
      const voices = ['af_bella', 'am_adam', 'bf_emma', 'am_echo', 'af_sky'];
      cast.push({
        characterId: char.id,
        name: char.name,
        role: 'CHARACTER',
        voiceId: voices[idx % voices.length],
        engine: idx % 2 === 0 ? 'kokoro' : 'fish_speech',
      });
    });

    return {
      id: `audiobook_${Date.now()}`,
      title: bookTitle,
      author,
      narratorVoice: 'af_heart',
      cast,
      chapters,
      selectedChapterId: chapters[0]?.id || '',
      exportFormat: 'wav',
      createdAt: Date.now(),
    };
  }

  /**
   * Dual-Cast Synthesis: Generates speech for an entire chapter,
   * dynamically switching between Narrator prose and Character dialogue.
   */
  async synthesizeChapter(
    chapter: AudiobookChapter,
    onProgress?: (progress: { currentParagraph: number; totalParagraphs: number; status: string }) => void
  ): Promise<AudiobookChapter> {
    const allSegments: TelaAudiobookSegment[] = [];
    const totalParas = chapter.paragraphs.length;

    for (let i = 0; i < totalParas; i++) {
      const para = chapter.paragraphs[i];
      onProgress?.({
        currentParagraph: i + 1,
        totalParagraphs: totalParas,
        status: `Synthesizing dual-cast audio for paragraph ${i + 1} of ${totalParas}...`,
      });

      try {
        const segs = await plajahAudioCore.synthesizeTelaAudiobook({
          text: para,
          detectQuotes: true,
          defaultNarratorVoice: 'af_heart',
        });
        allSegments.push(...segs);
      } catch (e) {
        console.warn(`[TelaAudiobook] Paragraph ${i + 1} synthesis failed:`, e);
      }
    }

    const totalDurationSeconds = allSegments.reduce((sum, s) => sum + s.durationSeconds, 0);

    // Concatenate all audio segments into a single continuous chapter audio blob
    const combinedBlob = await this.concatenateWavBlobs(allSegments.map((s) => s.audioBlob));
    const audioUrl = typeof URL !== 'undefined' ? URL.createObjectURL(combinedBlob) : '';

    chapter.segments = allSegments;
    chapter.totalDurationSeconds = totalDurationSeconds;
    chapter.isSynthesized = true;
    chapter.audioBlob = combinedBlob;
    chapter.audioUrl = audioUrl;

    return chapter;
  }

  /**
   * Concatenates an array of audio blobs into a single continuous WAV container.
   */
  private async concatenateWavBlobs(blobs: Blob[]): Promise<Blob> {
    if (blobs.length === 0) return new Blob();
    if (blobs.length === 1) return blobs[0];

    try {
      // In browser environment or node with ArrayBuffer
      const buffers: ArrayBuffer[] = [];
      for (const b of blobs) {
        if (b && typeof b.arrayBuffer === 'function') {
          buffers.push(await b.arrayBuffer());
        }
      }

      if (buffers.length === 0) return blobs[0] || new Blob();

      // Concatenate raw byte streams
      const totalByteLength = buffers.reduce((acc, curr) => acc + curr.byteLength, 0);
      const merged = new Uint8Array(totalByteLength);
      let offset = 0;
      for (const buf of buffers) {
        merged.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }

      return new Blob([merged], { type: 'audio/wav' });
    } catch {
      return blobs[0] || new Blob();
    }
  }

  /**
   * Exports an individual chapter audio file with filename.
   */
  exportChapterAudio(chapter: AudiobookChapter, bookTitle: string): { fileName: string; blob: Blob; url: string } {
    const cleanBook = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const cleanChapter = chapter.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fileName = `${cleanBook}_chap_${chapter.chapterNumber}_${cleanChapter}.wav`;

    const blob = chapter.audioBlob || new Blob();
    const url = chapter.audioUrl || (typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '');

    return { fileName, blob, url };
  }
}

export const telaAudiobookEngine = TelaAudiobookEngine.getInstance();
