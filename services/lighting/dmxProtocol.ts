// DMX wire formats, with no I/O: Art-Net ArtDmx, sACN (E1.31) data packets and the ENTTEC USB Pro
// widget frame. Pure bytes, so they can be checked against the specs in a test.

export const ARTNET_PORT = 6454;
export const SACN_PORT = 5568;

const ascii = (out: Uint8Array, at: number, text: string) => {
  for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i) & 0x7f;
};

/** Art-Net 4 ArtDmx. `universe` is the 15-bit port address, counted from 0 on the wire. */
export function artnetPacket(universe: number, sequence: number, data: Uint8Array): Uint8Array {
  // Art-Net wants an even length of 2..512; a whole universe is always sent.
  const out = new Uint8Array(18 + 512);
  ascii(out, 0, 'Art-Net');            // ID, NUL terminated by the zeroed byte 7
  out[8] = 0x00; out[9] = 0x50;        // OpDmx, little endian
  out[10] = 0; out[11] = 14;           // protocol version 14, big endian
  out[12] = sequence & 0xff;
  out[13] = 0;                         // physical port (informational)
  out[14] = universe & 0xff;           // SubUni
  out[15] = (universe >> 8) & 0x7f;    // Net
  out[16] = 0x02; out[17] = 0x00;      // length 512, big endian
  out.set(data.subarray(0, 512), 18);
  return out;
}

/** sACN multicast group for a universe (239.255.hi.lo). */
export const sacnMulticast = (universe: number) => `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;

/** A random v4-shaped CID. One per source; it must stay the same for the life of the source. */
export function makeCid(): Uint8Array {
  const cid = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(cid);
  else for (let i = 0; i < 16; i++) cid[i] = Math.floor(Math.random() * 256);
  cid[6] = (cid[6] & 0x0f) | 0x40;
  cid[8] = (cid[8] & 0x3f) | 0x80;
  return cid;
}

/** E1.31-2018 data packet with a full 512-slot universe. `universe` is 1..63999. */
export function sacnPacket(universe: number, sequence: number, data: Uint8Array, cid: Uint8Array, sourceName = 'Plajah LD', priority = 100): Uint8Array {
  const out = new Uint8Array(638);
  const view = new DataView(out.buffer);
  const flagsLength = (at: number, end = 638) => view.setUint16(at, 0x7000 | (end - at));
  // Root layer
  view.setUint16(0, 0x0010);
  view.setUint16(2, 0x0000);
  ascii(out, 4, 'ASC-E1.17');
  flagsLength(16);
  view.setUint32(18, 0x00000004);      // VECTOR_ROOT_E131_DATA
  out.set(cid.subarray(0, 16), 22);
  // Framing layer
  flagsLength(38);
  view.setUint32(40, 0x00000002);      // VECTOR_E131_DATA_PACKET
  ascii(out, 44, sourceName.slice(0, 63));
  out[108] = priority & 0xff;
  view.setUint16(109, 0);              // synchronization address
  out[111] = sequence & 0xff;
  out[112] = 0;                        // options
  view.setUint16(113, universe);
  // DMP layer
  flagsLength(115);
  out[117] = 0x02;                     // VECTOR_DMP_SET_PROPERTY
  out[118] = 0xa1;                     // address and data type
  view.setUint16(119, 0x0000);         // first property address
  view.setUint16(121, 0x0001);         // address increment
  view.setUint16(123, 513);            // property count: start code + 512
  out[125] = 0x00;                     // DMX start code
  out.set(data.subarray(0, 512), 126);
  return out;
}

/** ENTTEC DMX USB Pro "Output Only Send DMX" (label 6). Also spoken by DMXKing and most clones. */
export function enttecProFrame(data: Uint8Array): Uint8Array {
  const len = 513;
  const out = new Uint8Array(len + 5);
  out[0] = 0x7e;
  out[1] = 6;
  out[2] = len & 0xff;
  out[3] = len >> 8;
  out[4] = 0x00;                       // DMX start code
  out.set(data.subarray(0, 512), 5);
  out[out.length - 1] = 0xe7;
  return out;
}

/** Raw frame for FTDI-style Open DMX dongles. The caller must hold a line break first. */
export function openDmxFrame(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(513);
  out.set(data.subarray(0, 512), 1);
  return out;
}
