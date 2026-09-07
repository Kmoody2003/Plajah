export interface MenuRect { left: number; right: number; top: number; bottom: number }
export interface MenuViewport { left: number; top: number; width: number; height: number }

export function menuViewport(): MenuViewport {
  const v = window.visualViewport;
  return { left: v?.offsetLeft || 0, top: v?.offsetTop || 0, width: v?.width || window.innerWidth, height: v?.height || window.innerHeight };
}

/** All menu coordinates are viewport coordinates, including nested scroll containers. */
export function placeMenu(anchor: MenuRect, width: number, height: number, viewport: MenuViewport, side: 'below' | 'beside' | 'point' = 'below', align: 'start' | 'end' = 'start') {
  const minX = viewport.left + 8, minY = viewport.top + 8;
  const right = viewport.left + viewport.width - 8, bottom = viewport.top + viewport.height - 8;
  const w = Math.min(width, Math.max(0, right - minX)), h = Math.min(height, Math.max(0, bottom - minY));
  let x = align === 'end' ? anchor.right - w : anchor.left;
  let y = anchor.bottom + 4;
  if (side === 'beside') {
    x = anchor.right - 2; y = anchor.top;
    if (x + w > right) x = anchor.left - w + 2;
  } else if (side === 'point') {
    y = anchor.top;
    if (x + w > right) x = anchor.left - w;
  } else if (y + h > bottom && anchor.top - h - 4 >= minY) y = anchor.top - h - 4;
  return { x: Math.max(minX, Math.min(x, right - w)), y: Math.max(minY, Math.min(y, bottom - h)) };
}
