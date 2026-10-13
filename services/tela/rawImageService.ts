// services/tela/rawImageService.ts
// Native Camera RAW decoding client for Plajah (Tela & Photos).
// Detects Sony (.arw), Canon (.cr2, .cr3), Nikon (.nef), Adobe DNG (.dng),
// Fuji (.raf), Olympus (.orf), Panasonic (.rw2), Pentax (.pef), and Leica RAW formats.
// Routes to local discrete GPU sidecar using LibRaw / rawpy for 16-bit linear demosaicing.

export const CAMERA_RAW_EXTENSIONS = [
  'arw',
  'cr2',
  'cr3',
  'nef',
  'dng',
  'raf',
  'orf',
  'rw2',
  'pef',
  'srw',
  'raw',
];

export function isCameraRawFile(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return CAMERA_RAW_EXTENSIONS.includes(ext);
}

export interface RawDecodeResult {
  dataUrl: string;
  width: number;
  height: number;
  colorSpace: string;
  bitDepth: number;
}

export async function decodeCameraRawFile(
  file: File,
  options: { useCameraWb?: boolean; halfSize?: boolean } = {}
): Promise<RawDecodeResult> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const eps = ['http://127.0.0.1:51122/decode_raw', 'http://localhost:51122/decode_raw'];

  for (const ep of eps) {
    try {
      const resp = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawData: base64Data,
          useCameraWb: options.useCameraWb ?? true,
          halfSize: options.halfSize ?? false,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data?.mediaUrl) {
          return {
            dataUrl: data.mediaUrl,
            width: data.width,
            height: data.height,
            colorSpace: data.colorSpace || 'sRGB',
            bitDepth: data.bitDepth || 8,
          };
        }
      }
    } catch {}
  }

  throw new Error('Local GPU Sidecar failed to decode Camera RAW file. Please verify sidecar is running.');
}
