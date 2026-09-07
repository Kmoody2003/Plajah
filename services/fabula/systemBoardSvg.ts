// systemBoardSvg — the thumbnail an identity shows in the Broadcast Systems library.
//
// It used to be twelve stock shapes chosen by `index % 12` and one of four system fonts chosen
// by `index % 4`, so the board had nothing to do with the identity it stood for. The board is
// now the identity's own opener, authored in ./broadcastDesigns, rendered still at board size.
import { FABULA_BROADCAST_PACKS, type FabulaBroadcastPack } from './broadcastPacks';
import { makeBroadcastTemplate, renderBroadcastTemplateSvg, stillBroadcastSvg } from './broadcastTemplateFactory';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

/** A still of the identity's opener: the frame at its held state, with a name plate for the card. */
export function systemBoardSvg(pack: FabulaBroadcastPack) {
  const opener = makeBroadcastTemplate(pack, 'OPENER');
  // Motion speed high enough that every entrance has resolved by the first frame a browser paints;
  // the board is a poster, not a player.
  opener.controls.motionSpeed = 40;
  // The held state, with no animation left in it, so the thumbnail costs nothing to keep on screen.
  const still = stillBroadcastSvg(renderBroadcastTemplateSvg(opener));
  const [a, b] = pack.palette;
  return still.replace('</svg>', `<g><rect x="0" y="980" width="1920" height="100" fill="${b}" opacity=".92"/><rect x="0" y="980" width="14" height="100" fill="${a}"/><text x="40" y="1044" font-family="Inter, system-ui, sans-serif" font-size="40" font-weight="800" fill="${a}">${esc(pack.name)}</text></g></svg>`);
}

export const systemBoardDataUrl = (pack: FabulaBroadcastPack) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(systemBoardSvg(pack))}`;
