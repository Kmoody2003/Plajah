// vectorRaster — bring vector artwork into Fabula as crisp, alpha-preserving raster.
//
// SVG (fills, gradients, strokes) and Illustrator / PDF art are resolution-independent, but the
// Fabula compositor (WebGL) and delivery pipeline work on textures. So on import we rasterize the
// vector to a HI-RES PNG with a transparent background — sharp to 4K delivery, transparency kept.
// The monitor shows this PNG via <img> (still crisp for a ≤1080p viewer) and the export uploads it
// as an RGBA texture; the compositor's per-source alpha blend then reveals lower tracks through it.
//
// .ai note: modern Illustrator files are "PDF-compatible" (Adobe's default since the early 2000s),
// so pdf.js opens them like a PDF. Genuinely old PostScript-only .ai files can't be decoded in the
// browser — we return null and the caller surfaces a "re-save as SVG/PDF" hint.

const TARGET = 3840; // long-side px of the raster — generous headroom above 4K delivery

const isSvg = (f: File) => /svg/i.test(f.type) || /\.svg$/i.test(f.name);
const isPdfLike = (f: File) =>
  /pdf|illustrator|postscript/i.test(f.type) || /\.(ai|pdf)$/i.test(f.name);

export function isVectorFile(f: File): boolean { return isSvg(f) || isPdfLike(f); }

const pngName = (name: string) => name.replace(/\.[^.]+$/, "") + ".png";

async function blobToPng(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return null;
  return new File([blob], pngName(name), { type: "image/png" });
}

// Fit intrinsic w×h into a TARGET long-side box (never upscaling tiny art beyond 4×).
function fitTarget(w: number, h: number): { w: number; h: number } {
  const long = Math.max(w, h) || 1;
  const scale = Math.min(TARGET / long, 4);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function rasterizeSvg(file: File): Promise<File | null> {
  const text = await file.text();
  // Intrinsic size: prefer width/height attrs, else viewBox, else a 16:9 default.
  let w = 0, h = 0;
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  const wa = parseFloat(svg.getAttribute("width") || "");
  const ha = parseFloat(svg.getAttribute("height") || "");
  if (wa > 0 && ha > 0) { w = wa; h = ha; }
  else {
    const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
  }
  if (!(w > 0 && h > 0)) { w = 1920; h = 1080; }
  const out = fitTarget(w, h);

  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("svg decode failed"));
      im.decoding = "async";
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = out.w; canvas.height = out.h;
    const g = canvas.getContext("2d", { alpha: true })!;
    g.clearRect(0, 0, out.w, out.h);                 // transparent ground
    g.drawImage(img, 0, 0, out.w, out.h);
    return await blobToPng(canvas, file.name);
  } finally { URL.revokeObjectURL(url); }
}

async function rasterizePdf(file: File): Promise<File | null> {
  const pdfjs: any = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  } catch { /* worker already set / bundler resolved */ }

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const fit = fitTarget(base.width, base.height);
  const scale = fit.w / base.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const g = canvas.getContext("2d", { alpha: true })!;
  g.clearRect(0, 0, canvas.width, canvas.height); // keep transparency where the art has none
  await page.render({ canvasContext: g, viewport, background: "rgba(0,0,0,0)" }).promise;
  try { pdf.destroy(); } catch { /* */ }
  return await blobToPng(canvas, file.name);
}

/** Rasterize a vector file to a hi-res alpha PNG File. Returns null if it can't be decoded. */
export async function rasterizeVector(file: File): Promise<File | null> {
  try {
    if (isSvg(file)) return await rasterizeSvg(file);
    if (isPdfLike(file)) return await rasterizePdf(file);
  } catch { /* fall through */ }
  return null;
}
