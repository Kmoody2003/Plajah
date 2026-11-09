// HDMV navigation commands — the 12-byte instructions that movie objects and menu buttons run.
// Layout per instruction: [op_cnt:3 grp:2 sub_grp:3][imm1:1 imm2:1 rsv:2 branch_opt:4]
//                         [rsv:4 cmp_opt:4][rsv:3 set_opt:5][dst:32][src:32]

export const GRP = { BRANCH: 0, CMP: 1, SET: 2 } as const;
export const BRANCH = { GOTO: 0, JUMP: 1, PLAY: 2 } as const;
export const GOTO = { NOP: 0, GOTO: 1, BREAK: 2 } as const;
export const JUMP = { JUMP_OBJECT: 0, JUMP_TITLE: 1, CALL_OBJECT: 2, CALL_TITLE: 3, RESUME: 4 } as const;
export const PLAY = { PLAY_PL: 0, PLAY_PL_PI: 1, PLAY_PL_PM: 2, TERMINATE_PL: 3, LINK_PI: 4, LINK_MK: 5 } as const;
export const CMP = { BC: 1, EQ: 2, NE: 3, GE: 4, GT: 5, LE: 6, LT: 7 } as const;
export const SETG = { SET: 0, SETSYSTEM: 1 } as const;
export const SET = { MOVE: 1, SWAP: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7, RND: 8, AND: 9, OR: 10, XOR: 11, BITSET: 12, BITCLR: 13, SHL: 14, SHR: 15 } as const;
export const SYS = { SET_STREAM: 1, SET_NV_TIMER: 2, SET_BUTTON_PAGE: 3, ENABLE_BUTTON: 4, DISABLE_BUTTON: 5, SET_SEC_STREAM: 6, POPUP_OFF: 7, STILL_ON: 8, STILL_OFF: 9 } as const;

/** Player status register operand (PSR n). General purpose registers are plain numbers. */
export const PSR = (n: number) => (0x80000000 + n) >>> 0;
export const PSR_NAMES = { IG_STREAM: 0, PRIMARY_AUDIO: 1, PG_STREAM: 2, ANGLE: 3, TITLE: 4, CHAPTER: 5, PLAYLIST: 6, PLAYITEM: 7, TIME: 8, SELECTED_BUTTON: 10, MENU_PAGE: 11 } as const;

export interface Insn { opCnt: number; grp: number; sub: number; imm1: boolean; imm2: boolean; branch: number; cmp: number; set: number; dst: number; src: number }

export function encode(i: Insn): Uint8Array {
  const b = new Uint8Array(12);
  b[0] = ((i.opCnt & 7) << 5) | ((i.grp & 3) << 3) | (i.sub & 7);
  b[1] = ((i.imm1 ? 1 : 0) << 7) | ((i.imm2 ? 1 : 0) << 6) | (i.branch & 15);
  b[2] = i.cmp & 15;
  b[3] = i.set & 31;
  const dv = new DataView(b.buffer);
  dv.setUint32(4, i.dst >>> 0); dv.setUint32(8, i.src >>> 0);
  return b;
}

export function decode(b: Uint8Array, at = 0): Insn {
  const dv = new DataView(b.buffer, b.byteOffset + at, 12);
  const b0 = dv.getUint8(0), b1 = dv.getUint8(1);
  return { opCnt: b0 >> 5, grp: (b0 >> 3) & 3, sub: b0 & 7, imm1: !!(b1 & 0x80), imm2: !!(b1 & 0x40), branch: b1 & 15, cmp: dv.getUint8(2) & 15, set: dv.getUint8(3) & 31, dst: dv.getUint32(4), src: dv.getUint32(8) };
}

const insn = (p: Partial<Insn>): Insn => ({ opCnt: 0, grp: 0, sub: 0, imm1: false, imm2: false, branch: 0, cmp: 0, set: 0, dst: 0, src: 0, ...p });

// ── Assembler ────────────────────────────────────────────────────────────────
export const nop = () => insn({ grp: GRP.BRANCH, sub: BRANCH.GOTO, branch: GOTO.NOP });
export const goTo = (line: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.GOTO, branch: GOTO.GOTO, dst: line });
export const brk = () => insn({ grp: GRP.BRANCH, sub: BRANCH.GOTO, branch: GOTO.BREAK });
export const jumpObject = (obj: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.JUMP, branch: JUMP.JUMP_OBJECT, dst: obj });
export const jumpTitle = (title: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.JUMP, branch: JUMP.JUMP_TITLE, dst: title });
export const callObject = (obj: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.JUMP, branch: JUMP.CALL_OBJECT, dst: obj });
export const callTitle = (title: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.JUMP, branch: JUMP.CALL_TITLE, dst: title });
export const resume = () => insn({ grp: GRP.BRANCH, sub: BRANCH.JUMP, branch: JUMP.RESUME });
export const playPL = (pl: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.PLAY, branch: PLAY.PLAY_PL, dst: pl });
/** Play playlist from a mark (chapter marks are entry marks numbered from 0). */
export const playPLMark = (pl: number, mark: number) => insn({ opCnt: 2, imm1: true, imm2: true, grp: GRP.BRANCH, sub: BRANCH.PLAY, branch: PLAY.PLAY_PL_PM, dst: pl, src: mark });
/** Play playlist from the chapter mark held in a general register (menus set it, titles use it). */
export const playPLMarkReg = (pl: number, gpr: number) => insn({ opCnt: 2, imm1: true, imm2: false, grp: GRP.BRANCH, sub: BRANCH.PLAY, branch: PLAY.PLAY_PL_PM, dst: pl, src: gpr });
/** SetStream from a register holding a pre-formatted stream word (see setStream). */
export const setStreamReg = (gpr: number) => insn({ opCnt: 2, imm1: false, imm2: true, grp: GRP.SET, sub: SETG.SETSYSTEM, set: SYS.SET_STREAM, dst: gpr, src: 0 });
export const or = (gpr: number, srcGpr: number) => insn({ opCnt: 2, grp: GRP.SET, sub: SETG.SET, set: SET.OR, dst: gpr, src: srcGpr });
/** The stream word setStream() would encode, for storing in a register. */
export const streamWord = (o: { audio?: number; pg?: number; pgOn?: boolean }) => setStream(o).dst;
export const linkMark =(mark: number) => insn({ opCnt: 1, imm1: true, grp: GRP.BRANCH, sub: BRANCH.PLAY, branch: PLAY.LINK_MK, dst: mark });
export const move = (gpr: number, value: number, immediate = true) => insn({ opCnt: 2, imm2: immediate, grp: GRP.SET, sub: SETG.SET, set: SET.MOVE, dst: gpr, src: value });
export const cmpEq = (reg: number, value: number) => insn({ opCnt: 2, imm2: true, grp: GRP.CMP, cmp: CMP.EQ, dst: reg, src: value });
export const popupOff = () => insn({ grp: GRP.SET, sub: SETG.SETSYSTEM, set: SYS.POPUP_OFF });

/** SetStream: primary audio (1-based) and/or PG subtitle (1-based, display on/off). */
export function setStream(o: { audio?: number; pg?: number; pgOn?: boolean }) {
  let dst = 0;
  if (o.audio != null) dst = (dst | 0x80000000 | ((o.audio & 0xfff) << 16)) >>> 0;
  if (o.pg != null) dst = (dst | 0x8000 | (o.pgOn === false ? 0 : 0x4000) | (o.pg & 0xfff)) >>> 0;
  return insn({ opCnt: 2, imm1: true, imm2: true, grp: GRP.SET, sub: SETG.SETSYSTEM, set: SYS.SET_STREAM, dst, src: 0 });
}

/** SetButtonPage: select a button and/or flip to an IG page. */
export function setButtonPage(o: { button?: number; page?: number }) {
  const dst = o.button != null ? (0x80000000 | (o.button & 0xffff)) >>> 0 : 0;
  const src = o.page != null ? (0x80000000 | (o.page & 0xff)) >>> 0 : 0;
  return insn({ opCnt: 2, imm1: true, imm2: true, grp: GRP.SET, sub: SETG.SETSYSTEM, set: SYS.SET_BUTTON_PAGE, dst, src });
}

/** Human-readable disassembly (tests + the Disc Inspector's "Show commands"). */
export function disasm(i: Insn): string {
  if (i.grp === GRP.BRANCH) {
    if (i.sub === BRANCH.GOTO) return ['Nop', `Goto ${i.dst}`, 'Break'][i.branch] ?? '?';
    if (i.sub === BRANCH.JUMP) return [`JumpObject ${i.dst}`, `JumpTitle ${i.dst}`, `CallObject ${i.dst}`, `CallTitle ${i.dst}`, 'Resume'][i.branch] ?? '?';
    if (i.sub === BRANCH.PLAY) return [`PlayPL ${i.dst}`, `PlayPLatPI ${i.dst} ${i.src}`, `PlayPLatMK ${i.dst} ${i.src}`, 'TerminatePL', `LinkPI ${i.dst}`, `LinkMK ${i.dst}`][i.branch] ?? '?';
  }
  const reg = (v: number, imm: boolean) => (imm ? `${v}` : v & 0x80000000 ? `PSR${v & 0x7f}` : `GPR${v}`);
  if (i.grp === GRP.CMP) return `${['', 'bc', 'eq', 'ne', 'ge', 'gt', 'le', 'lt'][i.cmp]} ${reg(i.dst, i.imm1)}, ${reg(i.src, i.imm2)}`;
  if (i.sub === SETG.SET) return `${['', 'Move', 'Swap', 'Add', 'Sub', 'Mul', 'Div', 'Mod', 'Rnd', 'And', 'Or', 'Xor', 'BitSet', 'BitClr', 'ShiftL', 'ShiftR'][i.set]} ${reg(i.dst, i.imm1)}, ${reg(i.src, i.imm2)}`;
  if (i.set === SYS.SET_STREAM) {
    const parts: string[] = [];
    if (i.dst & 0x80000000) parts.push(`audio=${(i.dst >>> 16) & 0xfff}`);
    if (i.dst & 0x8000) parts.push(`pg=${i.dst & 0xfff}${i.dst & 0x4000 ? ' on' : ' off'}`);
    return `SetStream ${parts.join(' ')}`;
  }
  if (i.set === SYS.SET_BUTTON_PAGE) return `SetButtonPage${i.dst & 0x80000000 ? ` button=${i.dst & 0xffff}` : ''}${i.src & 0x80000000 ? ` page=${i.src & 0xff}` : ''}`;
  if (i.set === SYS.POPUP_OFF) return 'PopUpMenuOff';
  return `SetSystem ${i.set}`;
}
