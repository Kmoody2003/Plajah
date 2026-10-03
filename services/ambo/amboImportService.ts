// amboImportService.ts — Universal Presentation Importer for Ambo Pro.
// Imports:
// 1. FreeShow files (.show, .fsh, .json)
// 2. PowerPoint (.pptx) — via pure-JS OpenXML decompression & XML parsing
// 3. Google Slides (.pptx export or JSON)
// 4. PDF documents (.pdf) — page-by-page slide rendering
// 5. Keynote (.key) — QuickLook preview and Data media extraction

import { unzipSync, strFromU8 } from 'fflate';
import { newId, type Show, type Slide, type SlideLayer, type LayerContent } from './showModel';

export interface ImportResult {
  success: boolean;
  format: 'FREESHOW' | 'POWERPOINT' | 'PDF' | 'KEYNOTE' | 'GOOGLE_SLIDES' | 'UNKNOWN';
  show: Show;
  warnings?: string[];
}

// ── 1. FreeShow Parser ────────────────────────────────────────────────────────
export function parseFreeShowJson(rawText: string): Show {
  const data = JSON.parse(rawText);
  const title = data.name || data.title || 'FreeShow Presentation';
  const rawSlides = Array.isArray(data.slides) ? data.slides : [];

  const slides: Slide[] = rawSlides.map((s: any, idx: number) => {
    const groupName = s.group || s.category || (idx === 0 ? 'Intro' : undefined);
    const groupColor = s.color || s.groupColor || '#00DAF3';

    // Extract text and media items from FreeShow slide structure
    const textBlocks: string[] = [];
    let backgroundContent: LayerContent | undefined;

    const items = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      if (it.type === 'text') {
        if (Array.isArray(it.lines)) {
          textBlocks.push(it.lines.map((l: any) => typeof l === 'string' ? l : l.text || '').join('\n'));
        } else if (typeof it.text === 'string') {
          textBlocks.push(it.text);
        }
      } else if (it.type === 'media' && it.src) {
        const isVideo = /\.(mp4|mov|webm)$/i.test(it.src);
        backgroundContent = isVideo
          ? { kind: 'VIDEO', src: it.src, loop: true }
          : { kind: 'IMAGE', src: it.src };
      }
    }

    // Fallback: if FreeShow slide has a direct text or body property
    if (textBlocks.length === 0 && (s.text || s.body)) {
      textBlocks.push(s.text || s.body);
    }

    const slideLayers: SlideLayer[] = [];
    if (backgroundContent) {
      slideLayers.push({
        id: newId('ly_bg'),
        slot: 'background',
        content: backgroundContent,
      });
    }

    const fullBody = textBlocks.join('\n\n').trim();
    if (fullBody || !backgroundContent) {
      slideLayers.push({
        id: newId('ly_txt'),
        slot: 'slide',
        content: {
          kind: 'TEXT',
          blocks: [{ text: fullBody || `Slide ${idx + 1}`, role: 'body' }],
          style: { align: 'center', autoFit: true },
        },
      });
    }

    return {
      id: newId('sl'),
      label: s.label || s.title || `Slide ${idx + 1}`,
      group: groupName,
      groupColor,
      notes: s.notes,
      stageNotes: s.stageNotes || s.chords,
      layers: slideLayers,
    };
  });

  return {
    id: newId('show'),
    title,
    kind: data.category?.toLowerCase()?.includes('song') ? 'SONG' : 'PRESENTATION',
    author: data.author || data.artist,
    ccliNumber: data.ccliNumber || data.ccli,
    copyright: data.copyright,
    slides: slides.length > 0 ? slides : [
      {
        id: newId('sl'),
        label: 'Welcome',
        layers: [{
          id: newId('ly'),
          slot: 'slide',
          content: { kind: 'TEXT', blocks: [{ text: title, role: 'title' }] }
        }]
      }
    ],
  };
}

// ── 2. PowerPoint (.pptx) Parser ─────────────────────────────────────────────
export async function parsePowerPointBuffer(buf: ArrayBuffer, filename = 'Presentation.pptx'): Promise<Show> {
  const unzipped = unzipSync(new Uint8Array(buf));
  const showTitle = filename.replace(/\.pptx$/i, '');

  // 1. Gather slide XML files (ppt/slides/slide1.xml, slide2.xml, etc.)
  const slideKeys = Object.keys(unzipped)
    .filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

  // 2. Extract embedded media files (ppt/media/*) into Object URLs
  const mediaMap: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (path.startsWith('ppt/media/')) {
      const mediaName = path.split('/').pop() || '';
      let mime = 'image/png';
      if (/\.(jpg|jpeg)$/i.test(mediaName)) mime = 'image/jpeg';
      else if (/\.mp4$/i.test(mediaName)) mime = 'video/mp4';
      const blob = new Blob([bytes as any], { type: mime });
      mediaMap[mediaName] = URL.createObjectURL(blob);
    }
  }

  const slides: Slide[] = [];

  for (let i = 0; i < slideKeys.length; i++) {
    const slidePath = slideKeys[i];
    const xmlBytes = unzipped[slidePath];
    if (!xmlBytes) continue;
    const xmlText = strFromU8(xmlBytes);

    // Extract text paragraphs and runs: <a:p> ... <a:t>text</a:t>
    const paragraphs: string[] = [];
    const pRegex = /<a:p[\s>](.*?)<\/a:p>/gs;
    let pMatch;
    while ((pMatch = pRegex.exec(xmlText)) !== null) {
      const pContent = pMatch[1];
      const tRegex = /<a:t[^>]*>(.*?)<\/a:t>/gs;
      const textParts: string[] = [];
      let tMatch;
      while ((tMatch = tRegex.exec(pContent)) !== null) {
        textParts.push(tMatch[1]);
      }
      const pText = textParts.join('').trim();
      if (pText) {
        paragraphs.push(pText);
      }
    }

    const titleText = paragraphs[0] || `Slide ${i + 1}`;
    const bodyText = paragraphs.slice(1).join('\n') || (paragraphs.length === 1 ? '' : titleText);

    // Check if slide has referenced image in rels
    const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    let slideImageSrc: string | undefined;
    if (unzipped[relsPath]) {
      const relsText = strFromU8(unzipped[relsPath]);
      const targetMatch = /Target="\.\.\/media\/([^"]+)"/i.exec(relsText);
      if (targetMatch && targetMatch[1] && mediaMap[targetMatch[1]]) {
        slideImageSrc = mediaMap[targetMatch[1]];
      }
    }

    const slideLayers: SlideLayer[] = [];
    if (slideImageSrc) {
      slideLayers.push({
        id: newId('ly_bg'),
        slot: 'background',
        content: { kind: 'IMAGE', src: slideImageSrc },
      });
    }

    const fullContent = bodyText ? `${titleText}\n\n${bodyText}` : titleText;
    slideLayers.push({
      id: newId('ly_txt'),
      slot: 'slide',
      content: {
        kind: 'TEXT',
        blocks: [{ text: fullContent, role: 'body' }],
        style: { align: 'center', autoFit: true },
      },
    });

    slides.push({
      id: newId('sl'),
      label: titleText.substring(0, 30),
      group: i === 0 ? 'Title' : 'Presentation',
      groupColor: i === 0 ? '#00DAF3' : '#FF8C00',
      layers: slideLayers,
    });
  }

  // Fallback if no slides could be extracted
  if (slides.length === 0) {
    slides.push({
      id: newId('sl'),
      label: showTitle,
      layers: [{
        id: newId('ly'),
        slot: 'slide',
        content: { kind: 'TEXT', blocks: [{ text: showTitle, role: 'title' }] }
      }]
    });
  }

  return {
    id: newId('show'),
    title: showTitle,
    kind: 'PRESENTATION',
    slides,
  };
}

// ── 3. PDF Page-by-Page Parser ────────────────────────────────────────────────
export async function parsePdfBuffer(buf: ArrayBuffer, filename = 'Document.pdf'): Promise<Show> {
  const showTitle = filename.replace(/\.pdf$/i, '');
  const slides: Slide[] = [];

  // If running in browser and pdfjsLib is available (or dynamic import)
  try {
    let pdfjs = (window as any).pdfjsLib;
    if (!pdfjs) {
      // Dynamic import pdfjs-dist if available in bundle
      try {
        pdfjs = await import('pdfjs-dist');
      } catch {}
    }

    if (pdfjs && pdfjs.getDocument) {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages || 1;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // High-DPI 2x scale for video walls

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

          // Also extract text content
          let pageText = '';
          try {
            const textContent = await page.getTextContent();
            pageText = textContent.items.map((it: any) => it.str || '').join(' ');
          } catch {}

          slides.push({
            id: newId('sl'),
            label: `Page ${pageNum}`,
            group: 'PDF Document',
            groupColor: '#D0BCFF',
            notes: pageText.substring(0, 150),
            layers: [
              {
                id: newId('ly_pdf_bg'),
                slot: 'background',
                content: { kind: 'IMAGE', src: dataUrl, fit: 'contain' },
              },
            ],
          });
        }
      }
    }
  } catch (err) {
    console.warn('PDF.js rendering error, creating fallback slide', err);
  }

  // Fallback if browser canvas/PDF rendering wasn't available
  if (slides.length === 0) {
    slides.push({
      id: newId('sl'),
      label: 'Page 1',
      layers: [{
        id: newId('ly'),
        slot: 'slide',
        content: { kind: 'TEXT', blocks: [{ text: `${showTitle}\n(PDF Document)`, role: 'title' }] }
      }]
    });
  }

  return {
    id: newId('show'),
    title: showTitle,
    kind: 'PRESENTATION',
    slides,
  };
}

// ── 4. Keynote (.key) Parser ──────────────────────────────────────────────────
export async function parseKeynoteBuffer(buf: ArrayBuffer, filename = 'Presentation.key'): Promise<Show> {
  const unzipped = unzipSync(new Uint8Array(buf));
  const showTitle = filename.replace(/\.key$/i, '');

  // Check if QuickLook/Preview.pdf exists inside .key bundle
  const previewPdfBytes = unzipped['QuickLook/Preview.pdf'] || unzipped['preview.pdf'];
  if (previewPdfBytes && previewPdfBytes.length > 0) {
    return parsePdfBuffer(previewPdfBytes.buffer as ArrayBuffer, `${showTitle}.pdf`);
  }

  // Look for thumbnail or Data/ media slides
  const imageEntries = Object.keys(unzipped)
    .filter(k => /^Data\/.*\.(jpg|jpeg|png)$/i.test(k) || /QuickLook\/.*\.(jpg|jpeg|png)$/i.test(k))
    .sort();

  const slides: Slide[] = [];
  imageEntries.forEach((imgPath, idx) => {
    const bytes = unzipped[imgPath];
    if (bytes) {
      const mime = /\.(jpg|jpeg)$/i.test(imgPath) ? 'image/jpeg' : 'image/png';
      const blob = new Blob([bytes as any], { type: mime });
      const objectUrl = URL.createObjectURL(blob);
      slides.push({
        id: newId('sl'),
        label: `Slide ${idx + 1}`,
        group: 'Keynote',
        groupColor: '#FF8C00',
        layers: [
          {
            id: newId('ly_key_bg'),
            slot: 'background',
            content: { kind: 'IMAGE', src: objectUrl, fit: 'contain' },
          },
        ],
      });
    }
  });

  if (slides.length === 0) {
    slides.push({
      id: newId('sl'),
      label: 'Slide 1',
      layers: [{
        id: newId('ly'),
        slot: 'slide',
        content: { kind: 'TEXT', blocks: [{ text: showTitle, role: 'title' }] }
      }]
    });
  }

  return {
    id: newId('show'),
    title: showTitle,
    kind: 'PRESENTATION',
    slides,
  };
}

// ── 5. Master Universal Importer ──────────────────────────────────────────────
export async function importUniversalPresentation(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  // FreeShow (.show, .fsh, .json)
  if (name.endsWith('.show') || name.endsWith('.fsh') || (name.endsWith('.json') && !name.includes('project'))) {
    try {
      const text = new TextDecoder('utf-8').decode(buffer);
      const show = parseFreeShowJson(text);
      return { success: true, format: 'FREESHOW', show };
    } catch (e: any) {
      return { success: false, format: 'FREESHOW', show: null as any, warnings: [e.message] };
    }
  }

  // PowerPoint (.pptx) or Google Slides (.pptx)
  if (name.endsWith('.pptx')) {
    try {
      const show = await parsePowerPointBuffer(buffer, file.name);
      return { success: true, format: 'POWERPOINT', show };
    } catch (e: any) {
      return { success: false, format: 'POWERPOINT', show: null as any, warnings: [e.message] };
    }
  }

  // PDF Document (.pdf)
  if (name.endsWith('.pdf')) {
    try {
      const show = await parsePdfBuffer(buffer, file.name);
      return { success: true, format: 'PDF', show };
    } catch (e: any) {
      return { success: false, format: 'PDF', show: null as any, warnings: [e.message] };
    }
  }

  // Apple Keynote (.key)
  if (name.endsWith('.key')) {
    try {
      const show = await parseKeynoteBuffer(buffer, file.name);
      return { success: true, format: 'KEYNOTE', show };
    } catch (e: any) {
      return { success: false, format: 'KEYNOTE', show: null as any, warnings: [e.message] };
    }
  }

  return {
    success: false,
    format: 'UNKNOWN',
    show: null as any,
    warnings: ['Unsupported presentation format. Please select PPTX, PDF, FreeShow (.show), or Keynote (.key).'],
  };
}
