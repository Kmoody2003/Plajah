// worksheetImagePipeline — deterministic camera cleanup before OCR.
// Keeps the original untouched and produces a bounded, high-contrast derivative for vision.

export interface PreparedWorksheetImage {
  originalFile: File;
  originalDataUrl: string;
  cleanedDataUrl: string;
  cleanedBase64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  warnings: string[];
}

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('This image format could not be decoded. Use JPEG, PNG, WebP, or your phone camera.')); img.src = src;
});

/** Resize, neutralize the paper, increase local legibility and return an OCR-safe JPEG. */
export async function prepareWorksheetImage(file: File, maxEdge = 2200): Promise<PreparedWorksheetImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a worksheet photo or image file. PDF support belongs to the multi-page import path.');
  if (file.size > 30 * 1024 * 1024) throw new Error('That photo is over 30 MB. Use the phone camera or a smaller export.');
  const originalDataUrl = await readDataUrl(file);
  const image = await loadImage(originalDataUrl);
  // Avoid mobile tab crashes while preserving enough pixels for small worksheet print.
  // deviceMemory is advisory and absent on Safari; the high-quality default remains in that case.
  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const safeMaxEdge = mobile ? Math.min(maxEdge, deviceMemory <= 4 ? 1600 : 1900) : maxEdge;
  const scale = Math.min(1, safeMaxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale)); const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('Image cleanup is unavailable in this browser.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height); const d = pixels.data;
  // Worksheet-safe luminance normalization: retain colored diagrams while lifting paper shadows.
  for (let i = 0; i < d.length; i += 4) {
    const lum = .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    const shadowLift = lum > 150 ? (255 - lum) * .24 : 0;
    const contrast = 1.16;
    d[i] = Math.max(0, Math.min(255, (d[i] - 128) * contrast + 128 + shadowLift));
    d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - 128) * contrast + 128 + shadowLift));
    d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - 128) * contrast + 128 + shadowLift));
  }
  ctx.putImageData(pixels, 0, 0);
  const cleanedDataUrl = canvas.toDataURL('image/jpeg', .9);
  const warnings: string[] = [];
  if (image.naturalWidth < 1000 || image.naturalHeight < 1000) warnings.push('Low-resolution capture; verify small print and symbols.');
  if (width / height > 1.55) warnings.push('Wide capture; verify the full worksheet page is visible.');
  if (mobile && safeMaxEdge < maxEdge) warnings.push(`Phone-safe OCR resolution (${safeMaxEdge}px) was used to prevent a browser memory crash.`);
  return { originalFile: file, originalDataUrl, cleanedDataUrl, cleanedBase64: cleanedDataUrl.split(',')[1] || '', mimeType: 'image/jpeg', width, height, warnings };
}
