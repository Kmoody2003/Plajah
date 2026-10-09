// storyBoard — "Hello, Colors!" (story-board): a BOARD BOOK for ages 0-2.
// Format: square 6x6 in (576x576), single stand-alone pages, 1-5 words a page.
// Medium: bold primary shapes — pure red/blue/yellow + black + white, ONE uniform
// thick black outline, ONE giant object per page, a rounded cut-edge frame, no small detail.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import { rect, circle, ellipse, text } from '../../templateKit';
import * as orn from '../../ornaments';
import { poly, stroke, arcPts, letterRow, BUNGEE_ADV } from './kidsArtC';
import { BB, BW, OL, boardFrame, bigWord, arrow, tapRing, face, apple, fish, sun, dot, ball, star5, heart, bullseye, shine } from './storyBoardKit';

type O = TelaVectorObject;

const board: PublicationDesigner = (ctx: PublicationCtx) => {
  const { pageIndex, seed } = ctx; const r = orn.rng(seed + pageIndex * 13);
  const out: O[] = [];
  switch (pageIndex) {
    // ── 0 COVER: the three primaries, one smiling ──
    case 0: {
      out.push(...boardFrame(BB.red, BB.white));
      out.push(...letterRow('HELLO,', BW / 2, 22, { font: 'bungee', adv: BUNGEE_ADV, size: 96, colors: [BB.red, BB.blue, BB.yel], stroke: BB.ink, sw: 15, align: 'center', seed: 5, label: 'Title letter' }).objs);
      out.push(...letterRow('COLORS!', BW / 2, 118, { font: 'bungee', adv: BUNGEE_ADV, size: 84, colors: [BB.yel, BB.red, BB.blue], stroke: BB.ink, sw: 14, align: 'center', seed: 6, label: 'Title letter' }).objs);
      out.push(circle(288, 330, 92, BB.blue, { stroke: BB.ink, strokeWidth: OL, label: 'Blue dot' }), circle(184, 446, 88, BB.red, { stroke: BB.ink, strokeWidth: OL, label: 'Red dot' }), circle(392, 446, 88, BB.yel, { stroke: BB.ink, strokeWidth: OL, label: 'Yellow dot' }));
      out.push(shine(288, 330, 62, 200, 260), shine(184, 446, 58, 200, 260), shine(392, 446, 58, 200, 260));
      out.push(...face(184, 456, 130, { cheeks: true, eyeGap: .36, smile: .3 }));
      return out;
    }
    // ── 1 RED: apple, word at the bottom, arrow from the corner ──
    case 1: {
      out.push(...boardFrame(BB.yel, BB.white));
      out.push(...apple(288, 228, 182, BB.red, BB.blue));
      out.push(...bigWord('RED', 538, [BB.red], { size: 122 }));
      out.push(arrow(150, 150, 96, 38));
      return out;
    }
    // ── 2 BLUE: fish swims across, word on top ──
    case 2: {
      out.push(...boardFrame(BB.red, BB.yel));
      out.push(...bigWord('BLUE', 54, [BB.blue], { size: 118, anchor: 'top' }));
      out.push(...fish(272, 350, 420, BB.blue, BB.red));
      out.push(arrow(262, 470, 78, -90));
      return out;
    }
    // ── 3 YELLOW: a sun on a blue page, tap ring ──
    case 3: {
      out.push(...boardFrame(BB.white, BB.blue));
      out.push(...sun(288, 232, 200, BB.yel, 9, BB.red));
      out.push(...bigWord('YELLOW', 538, [BB.yel], { size: 104 }));
      out.push(...tapRing(96, 112, 34));
      return out;
    }
    // ── 4-6 COUNTING: one, two, three giant dots ──
    case 4: {
      out.push(...boardFrame(BB.blue, BB.yel));
      out.push(...dot(288, 244, 172, BB.red, '1'));
      out.push(...bigWord('ONE', 538, [BB.red], { size: 116 }), arrow(110, 150, 70, 40));
      return out;
    }
    case 5: {
      out.push(...boardFrame(BB.red, BB.white));
      out.push(...dot(166, 244, 118, BB.blue, '1'), ...dot(410, 244, 118, BB.yel, '2'));
      out.push(...bigWord('TWO', 538, [BB.blue], { size: 116 }), ...tapRing(288, 96, 32));
      return out;
    }
    case 6: {
      out.push(...boardFrame(BB.yel, BB.blue));
      out.push(...dot(288, 134, 92, BB.red, '1'), ...dot(184, 312, 92, BB.yel, '2'), ...dot(392, 312, 92, BB.white, '3', BB.ink));
      out.push(...bigWord('THREE', 538, [BB.white], { size: 112 }));
      return out;
    }
    // ── 7 BLACK AND WHITE: the high-contrast page ──
    case 7: {
      out.push(...boardFrame(BB.ink, BB.white));
      out.push(...bullseye(288, 240, 196, 7));
      out.push(...bigWord('LOOK!', 538, [BB.ink], { size: 116 }));
      return out;
    }
    // ── 8 MIRROR / FACE: a big smiling face in a round mirror ──
    case 8: {
      out.push(...boardFrame(BB.white, BB.red));
      out.push(circle(288, 232, 200, BB.blue, { stroke: BB.ink, strokeWidth: OL, label: 'Mirror frame' }));
      out.push(circle(288, 232, 160, BB.yel, { stroke: BB.ink, strokeWidth: OL, label: 'Face' }));
      out.push(...face(288, 244, 300, { cheeks: true, eyeGap: .3, smile: .33 }));
      out.push(stroke([[132, 98], [168, 66]], BB.white, 20, { label: 'Mirror glint' }), stroke([[102, 140], [118, 124]], BB.white, 20, { label: 'Mirror glint' }));
      out.push(...bigWord('YOU!', 538, [BB.yel], { size: 110 }));
      return out;
    }
    // ── 9 PEEK: a die-cut-looking round window ──
    case 9: {
      out.push(...boardFrame(BB.yel, BB.blue));
      out.push(circle(288, 236, 176, BB.ink, { label: 'Window rim' }), circle(288, 236, 146, BB.yel, { label: 'Window hole' }));
      out.push(circle(222, 236, 60, BB.white, { stroke: BB.ink, strokeWidth: 12, label: 'Peeking eye' }), circle(354, 236, 60, BB.white, { stroke: BB.ink, strokeWidth: 12, label: 'Peeking eye' }));
      out.push(circle(236, 246, 28, BB.ink, { label: 'Pupil' }), circle(368, 246, 28, BB.ink, { label: 'Pupil' }));
      out.push(...tapRing(468, 96, 36));
      out.push(...bigWord('PEEK!', 538, [BB.yel], { size: 110 }));
      return out;
    }
    // ── 10 BALL: the round thing ──
    case 10: {
      out.push(...boardFrame(BB.red, BB.white));
      out.push(...bigWord('BALL', 54, [BB.blue], { size: 112, anchor: 'top' }));
      out.push(...ball(288, 340, 184, BB.blue, BB.yel));
      out.push(arrow(436, 214, 76, 135));
      return out;
    }
    // ── 11 STAR ──
    case 11: {
      out.push(...boardFrame(BB.blue, BB.red));
      out.push(star5(288, 252, 214, BB.yel, .52));
      out.push(...face(288, 262, 190, { cheeks: false, eyeGap: .3, smile: .3 }));
      out.push(...bigWord('STAR', 538, [BB.yel], { size: 112 }));
      out.push(...tapRing(462, 118, 32));
      return out;
    }
    // ── 12 LOVE ──
    case 12: {
      out.push(...boardFrame(BB.blue, BB.yel));
      out.push(heart(288, 208, 12.5, BB.red));
      out.push(...face(288, 210, 180, { cheeks: false, eyeGap: .3, smile: .28 }));
      out.push(...bigWord('LOVE', 538, [BB.red], { size: 112 }));
      return out;
    }
    // ── 13 END PAGE: one giant smile ──
    case 13: {
      out.push(...boardFrame(BB.red, BB.yel));
      out.push(...bigWord('BYE!', 58, [BB.blue], { size: 118, anchor: 'top' }));
      out.push(ellipse(150, 218, 66, 104, BB.ink, { label: 'Eye' }), ellipse(360, 218, 66, 104, BB.ink, { label: 'Eye' }), ellipse(168, 238, 24, 34, BB.white, { label: 'Eye shine' }), ellipse(378, 238, 24, 34, BB.white, { label: 'Eye shine' }));
      out.push(circle(92, 352, 40, BB.red, { label: 'Cheek' }), circle(484, 352, 40, BB.red, { label: 'Cheek' }));
      out.push(stroke(arcPts(288, 322, 176, 150, 24, 156, 24), BB.ink, 44, { label: 'Giant smile' }));
      return out;
    }
    // ── 14 BACK COVER ──
    default: {
      out.push(...boardFrame(BB.blue, BB.yel));
      out.push(circle(138, 150, 66, BB.red, { stroke: BB.ink, strokeWidth: OL, label: 'Red dot' }), circle(288, 150, 66, BB.blue, { stroke: BB.ink, strokeWidth: OL, label: 'Blue dot' }), circle(438, 150, 66, BB.white, { stroke: BB.ink, strokeWidth: OL, label: 'White dot' }));
      out.push(...letterRow('HELLO, COLORS!', BW / 2, 262, { font: 'bungee', adv: BUNGEE_ADV, size: 46, colors: [BB.ink], stroke: BB.ink, sw: 0, align: 'center', seed: 9, label: 'Back title' }).objs);
      out.push(text(70, 338, 436, 'A first board book of colours, counting and faces.', { size: 26, font: 'fredoka', weight: 600, color: BB.ink, align: 'center', leading: 1.3, label: 'Blurb', role: 'BODY' }));
      out.push(text(70, 418, 436, 'Point · Name · Count · Smile', { size: 24, font: 'fredoka', weight: 700, color: BB.red, align: 'center', wrap: false, label: 'Reading cue', role: 'DECK' }));
      out.push(text(70, 480, 436, 'AGES 0–2  ·  SHARE IT TOGETHER', { size: 18, font: 'fredoka', weight: 700, color: BB.ink, align: 'center', wrap: false, tracking: .08, label: 'Age line', role: 'LABEL' }));
      return out;
    }
  }
};

export const DESIGNS: Record<string, PublicationDesigner> = { 'story-board': board };
export const LESSONS: Record<string, DesignLesson> = {
  'story-board': {
    principle: 'For the youngest readers, remove everything but the idea: one giant object, one pure colour, one thick outline and one word per page. Extreme contrast and big simple shapes are what a baby’s eyes can actually hold, so every page is a single thing to look at and point to.',
    history: 'Board books arrived in the 1930s and were rethought in the 1980s as books made for babies, with thick card pages that survive chewing. Their art follows infant vision research: newborns see high-contrast edges first and primary colours before subtle ones, which is why classic board books favour black outlines, flat red, blue and yellow, and one clear subject per page.',
    tryThis: 'Cover the word and squint at a page from across the room: you should still name the object. Then swap the red apple for a blue one on the same white ground and notice what the eye does with the colour, not the shape.',
    interestTag: 'Picture books',
    related: ['Board books', 'Infant vision', 'Primary colours'],
  },
};
