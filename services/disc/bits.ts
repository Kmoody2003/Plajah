// Big-endian bit writer/reader for the Blu-ray binary formats (index.bdmv, MPLS, IG/PGS segments).

export class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private nbits = 0;

  bits(value: number, n: number): this {
    for (let i = n - 1; i >= 0; i--) {
      // Math.floor keeps values above 2^31 (33-bit PTS) exact.
      const bit = Math.floor(value / 2 ** i) % 2;
      this.cur = (this.cur << 1) | bit;
      if (++this.nbits === 8) { this.bytes.push(this.cur); this.cur = 0; this.nbits = 0; }
    }
    return this;
  }
  u8(v: number) { return this.bits(v & 0xff, 8); }
  u16(v: number) { return this.bits(v & 0xffff, 16); }
  u24(v: number) { return this.bits(v & 0xffffff, 24); }
  u32(v: number) { return this.bits(v >>> 0, 32); }
  zero(n: number) { return this.bits(0, n); }
  ascii(s: string) { for (const ch of s) this.u8(ch.charCodeAt(0)); return this; }
  raw(b: Uint8Array | number[]) { this.align(); for (const x of b) this.bytes.push(x & 0xff); return this; }
  align() { if (this.nbits) this.bits(0, 8 - this.nbits); return this; }
  get length() { return this.bytes.length + (this.nbits ? 1 : 0); }
  /** Overwrite a big-endian u32 at a byte offset (for length/offset fields filled in later). */
  patchU32(at: number, v: number) { this.bytes[at] = (v >>> 24) & 0xff; this.bytes[at + 1] = (v >>> 16) & 0xff; this.bytes[at + 2] = (v >>> 8) & 0xff; this.bytes[at + 3] = v & 0xff; }
  patchU16(at: number, v: number) { this.bytes[at] = (v >>> 8) & 0xff; this.bytes[at + 1] = v & 0xff; }
  done(): Uint8Array { this.align(); return Uint8Array.from(this.bytes); }
}

export class BitReader {
  pos = 0; // in bits
  constructor(readonly buf: Uint8Array, startByte = 0) { this.pos = startByte * 8; }
  bits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.buf[this.pos >> 3];
      if (byte === undefined) throw new Error('read past end');
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  u8() { return this.bits(8); }
  u16() { return this.bits(16); }
  u24() { return this.bits(24); }
  u32() { return this.bits(32); }
  skip(n: number) { this.pos += n; }
  ascii(n: number) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8()); return s; }
  get byte() { return this.pos >> 3; }
  seekByte(b: number) { this.pos = b * 8; }
}

export const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
