// Blu-ray graphics run-length coding (PGS subtitles + IG menus share it).
//   CCCCCCCC                         one pixel of colour C (C ≠ 0)
//   00 00                            end of line
//   00 00LLLLLL                      L (1–63) pixels of colour 0
//   00 01LLLLLL LLLLLLLL             L (64–16383) pixels of colour 0
//   00 10LLLLLL CCCCCCCC             L (3–63) pixels of colour C
//   00 11LLLLLL LLLLLLLL CCCCCCCC    L (64–16383) pixels of colour C

export function rleEncode(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = pixels[y * w + x];
      let n = 1;
      while (x + n < w && pixels[y * w + x + n] === c && n < 16383) n++;
      if (c === 0) {
        if (n < 64) out.push(0, n);
        else out.push(0, 0x40 | (n >> 8), n & 0xff);
      } else if (n < 3) {
        for (let i = 0; i < n; i++) out.push(c);
      } else if (n < 64) out.push(0, 0x80 | n, c);
      else out.push(0, 0xc0 | (n >> 8), n & 0xff, c);
      x += n;
    }
    out.push(0, 0);
  }
  return Uint8Array.from(out);
}

export function rleDecode(data: Uint8Array, w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h);
  let i = 0, x = 0, y = 0;
  while (i < data.length && y < h) {
    const b = data[i++];
    if (b !== 0) { px[y * w + x++] = b; continue; }
    const f = data[i++];
    if (f === 0) { x = 0; y++; continue; }
    const long = f & 0x40, colored = f & 0x80;
    const n = long ? ((f & 0x3f) << 8) | data[i++] : f & 0x3f;
    const c = colored ? data[i++] : 0;
    px.fill(c, y * w + x, y * w + x + n);
    x += n;
  }
  return px;
}
