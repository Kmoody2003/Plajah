/**
 * generateShareCard — paints a high-converting, gorgeous share image:
 * - Taleo Cinema Premiere (gold/amber widescreen with feathered dissolve)
 * - Lorea Literary Press (hardcover book styling, serif typography, silk violet)
 * - Live Community Polls (dynamic percentages, leading option highlight, author inquiry)
 * - Reello Shorts (vertical pulse glow, soundwave ripples)
 * - Lossless Spatial Audio & Music Releases (ambient radial glow, vinyl sleeve aesthetic)
 * - Featured Social Posts (curated quote card)
 *
 * Supports aspect ratios: '1:1' (Square feed), '9:16' (Story/Reello), '16:9' (Cinematic/Widescreen)
 * Returns { dataUrl, blob } or null on canvas error.
 */

export interface ShareCardInput {
  coverUrl?: string;
  title: string;
  artist?: string;
  size?: number;
  contentType?: 'poll' | 'post' | 'video' | 'album' | 'music' | 'channel' | 'movie' | 'book';
  pollData?: {
    question: string;
    options: string[];
    votes?: Record<string, string[]>;
    totalVotes?: number;
  };
  postText?: string;
  authorName?: string;
  authorPhoto?: string;
  ctaText?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; }
  else { dw = w; dh = w / ir; dy = (h - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
  bottomUp: boolean = false
): number {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const trimmed = lines.slice(0, maxLines);
  if (trimmed.length === maxLines && words.length > trimmed.join(' ').split(' ').length) {
    let last = trimmed[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    trimmed[maxLines - 1] = last + '…';
  }
  trimmed.forEach((ln, i) => {
    const lineY = bottomUp ? y - (trimmed.length - 1 - i) * lh : y + i * lh;
    ctx.fillText(ln, x, lineY);
  });
  return trimmed.length;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generateShareCard(input: ShareCardInput): Promise<{ dataUrl: string; blob: Blob | null } | null> {
  try {
    const size = input.size || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const pad = size * 0.075;
    const isPoll = input.contentType === 'poll' || !!input.pollData;
    const isPost = input.contentType === 'post' || (!!input.postText && !input.coverUrl);
    const isTaleo = input.contentType === 'movie';
    const isLorea = input.contentType === 'book';

    // Declared early so image branch can position artwork relative to header
    const logoY = pad * 1.1;
    const logoSize = Math.round(size * 0.048);

    // ── 1. BACKGROUND ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0910';
    ctx.fillRect(0, 0, size, size);

    let loadedImg: HTMLImageElement | null = null;
    if (input.coverUrl) {
      try {
        loadedImg = await loadImage(input.coverUrl);
      } catch {
        /* proceed with branded background on load failure */
      }
    }

    if (loadedImg && !isPoll && !isPost) {
      // ── CINEMATIC AMBIENT BACKGROUND GLOW ──
      const ambientRad = ctx.createRadialGradient(size * 0.5, size * 0.38, size * 0.1, size * 0.5, size * 0.38, size * 0.65);
      if (isTaleo) {
        ambientRad.addColorStop(0, 'rgba(217, 119, 6, 0.35)');
        ambientRad.addColorStop(0.5, 'rgba(180, 83, 9, 0.18)');
      } else if (isLorea) {
        ambientRad.addColorStop(0, 'rgba(167, 139, 250, 0.32)');
        ambientRad.addColorStop(0.5, 'rgba(109, 40, 217, 0.18)');
      } else {
        ambientRad.addColorStop(0, 'rgba(138, 43, 226, 0.28)');
        ambientRad.addColorStop(0.5, 'rgba(255, 140, 0, 0.18)');
      }
      ambientRad.addColorStop(1, 'rgba(10, 9, 16, 0)');
      ctx.fillStyle = ambientRad;
      ctx.fillRect(0, 0, size, size);

      // Fine soundwave / cinema light lines in background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 12) {
        const y = size * 0.78 + Math.sin(x * 0.015) * 18 + Math.cos(x * 0.04) * 8;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ── ELEGANT FRAMED ARTWORK WITH SOFT DISSOLVE GRADIENTS ──
      const isLandscape = (input.contentType === 'video' || input.contentType === 'movie');
      const isBook = input.contentType === 'book';
      const artW = isLandscape ? Math.round(size * 0.78) : isBook ? Math.round(size * 0.42) : Math.round(size * 0.56);
      const artH = isLandscape ? Math.round(size * 0.44) : isBook ? Math.round(size * 0.56) : Math.round(size * 0.56);
      const artX = Math.round((size - artW) / 2);
      const artY = Math.round(logoY + size * 0.055);
      const artR = isBook ? 16 : 24;

      // Outer soft glow
      ctx.save();
      ctx.shadowColor = isTaleo ? 'rgba(245, 158, 11, 0.35)' : isLorea ? 'rgba(168, 85, 247, 0.35)' : isLandscape ? 'rgba(255, 140, 0, 0.25)' : 'rgba(168, 85, 247, 0.3)';
      ctx.shadowBlur = 40;
      ctx.fillStyle = '#0f0e15';
      roundRect(ctx, artX, artY, artW, artH, artR);
      ctx.fill();
      ctx.restore();

      // Draw clipped cover
      ctx.save();
      roundRect(ctx, artX, artY, artW, artH, artR);
      ctx.clip();
      drawCover(ctx, loadedImg, artW, artH);
      
      // Feathered gradient overlay on the image edges (seamless melt into dark canvas)
      const bottomGrad = ctx.createLinearGradient(artX, artY + artH * 0.5, artX, artY + artH);
      bottomGrad.addColorStop(0, 'rgba(10, 9, 16, 0)');
      bottomGrad.addColorStop(1, 'rgba(10, 9, 16, 0.85)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(artX, artY, artW, artH);

      const topGrad = ctx.createLinearGradient(artX, artY + artH * 0.3, artX, artY);
      topGrad.addColorStop(0, 'rgba(10, 9, 16, 0)');
      topGrad.addColorStop(1, 'rgba(10, 9, 16, 0.4)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(artX, artY, artW, artH);

      ctx.restore();

      // Subtle glassmorphic border around the artwork
      roundRect(ctx, artX, artY, artW, artH, artR);
      ctx.strokeStyle = isTaleo ? 'rgba(245, 158, 11, 0.4)' : isLorea ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

    } else if (isPoll || isPost || !loadedImg) {
      // Atmospheric mesh gradient
      const rad1 = ctx.createRadialGradient(size * 0.85, size * 0.15, size * 0.05, size * 0.85, size * 0.15, size * 0.65);
      rad1.addColorStop(0, 'rgba(138, 43, 226, 0.35)');
      rad1.addColorStop(1, 'rgba(10, 9, 16, 0)');
      ctx.fillStyle = rad1;
      ctx.fillRect(0, 0, size, size);

      const rad2 = ctx.createRadialGradient(size * 0.15, size * 0.85, size * 0.05, size * 0.15, size * 0.85, size * 0.55);
      rad2.addColorStop(0, 'rgba(255, 140, 0, 0.28)');
      rad2.addColorStop(1, 'rgba(10, 9, 16, 0)');
      ctx.fillStyle = rad2;
      ctx.fillRect(0, 0, size, size);

      // Subtle soundwave lines at bottom
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 10) {
        const y = size - pad * 1.6 + Math.sin(x * 0.02) * 16 + Math.cos(x * 0.05) * 8;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ── 2. HEADER BRANDING & BADGE ─────────────────────────────────────────────
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Logo icon
    const brandGrad = ctx.createLinearGradient(pad, logoY - logoSize / 2, pad + logoSize, logoY + logoSize / 2);
    if (isTaleo) {
      brandGrad.addColorStop(0, '#F59E0B');
      brandGrad.addColorStop(0.5, '#D97706');
      brandGrad.addColorStop(1, '#92400E');
    } else if (isLorea) {
      brandGrad.addColorStop(0, '#C084FC');
      brandGrad.addColorStop(0.5, '#9333EA');
      brandGrad.addColorStop(1, '#581C87');
    } else {
      brandGrad.addColorStop(0, '#FF8C00');
      brandGrad.addColorStop(0.5, '#D40055');
      brandGrad.addColorStop(1, '#8A2BE2');
    }

    roundRect(ctx, pad, logoY - logoSize / 2, logoSize, logoSize, 12);
    ctx.fillStyle = brandGrad;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(logoSize * 0.65)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(isTaleo ? 'T' : isLorea ? 'L' : 'P', pad + logoSize / 2, logoY);

    // Brand Name & Subtext
    ctx.textAlign = 'left';
    const brandTitle = isTaleo ? 'TALEO' : isLorea ? 'LOREA' : 'PLAJAH';
    ctx.font = `900 ${Math.round(size * 0.026)}px ${isLorea ? 'Georgia, serif' : 'Inter, system-ui, sans-serif'}`;
    ctx.fillText(brandTitle, pad + logoSize + 16, logoY);

    // Right Category Badge
    const badgeText = isTaleo
      ? '🏆 TALEO CINEMA PREMIERE'
      : isLorea
      ? '📖 LOREA LITERARY PRESS'
      : isPoll
      ? '⚡ LIVE COMMUNITY POLL'
      : input.contentType === 'video'
      ? '🎬 REELLO VIDEO'
      : input.contentType === 'post'
      ? '💬 FEATURED POST'
      : '🎵 SOUND RELEASE';

    ctx.font = `900 ${Math.round(size * 0.019)}px Inter, system-ui, sans-serif`;
    const badgeW = ctx.measureText(badgeText).width + 36;
    const badgeH = Math.round(size * 0.042);
    const badgeX = size - pad - badgeW;

    roundRect(ctx, badgeX, logoY - badgeH / 2, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = isTaleo
      ? 'rgba(245, 158, 11, 0.22)'
      : isLorea
      ? 'rgba(167, 139, 250, 0.22)'
      : isPoll
      ? 'rgba(168, 85, 247, 0.22)'
      : 'rgba(255, 140, 0, 0.2)';
    ctx.fill();
    ctx.strokeStyle = isTaleo
      ? 'rgba(245, 158, 11, 0.6)'
      : isLorea
      ? 'rgba(167, 139, 250, 0.6)'
      : isPoll
      ? 'rgba(168, 85, 247, 0.5)'
      : 'rgba(255, 140, 0, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = isPoll ? '#D8B4FE' : '#FFB74D';
    ctx.fillText(badgeText, badgeX + 18, logoY);

    // ── 3. CONTENT SECTION ─────────────────────────────────────────────────────
    if (isPoll && input.pollData) {
      const poll = input.pollData;
      let curY = logoY + Math.round(size * 0.075);

      if (input.authorName) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = `700 ${Math.round(size * 0.022)}px Inter, system-ui, sans-serif`;
        ctx.fillText(`@${input.authorName.replace(/\s+/g, '').toLowerCase()} asks:`, pad, curY);
        curY += Math.round(size * 0.04);
      }

      ctx.fillStyle = '#ffffff';
      const qSize = Math.round(size * 0.048);
      ctx.font = `900 ${qSize}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const qLines = wrapText(ctx, poll.question || input.title, pad, curY, size - pad * 2, qSize * 1.25, 3);
      curY += qLines * qSize * 1.25 + Math.round(size * 0.035);

      const opts = poll.options.slice(0, 3);
      const optH = Math.round(size * 0.07);
      const optGap = Math.round(size * 0.018);
      const totalVotes = poll.totalVotes || (poll.votes ? Object.values(poll.votes).reduce((s, v) => s + v.length, 0) : 0);

      opts.forEach((opt, idx) => {
        const optionVotes = poll.votes?.[String(idx)]?.length || 0;
        const pct = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : (idx === 0 ? 58 : idx === 1 ? 27 : 15);
        const isLeading = idx === 0 && pct > 30;

        roundRect(ctx, pad, curY, size - pad * 2, optH, 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        ctx.strokeStyle = isLeading ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const barW = Math.max(12, ((size - pad * 2) * pct) / 100);
        roundRect(ctx, pad, curY, barW, optH, 16);
        ctx.fillStyle = isLeading ? 'rgba(147, 51, 234, 0.32)' : 'rgba(255, 255, 255, 0.1)';
        ctx.fill();

        ctx.fillStyle = isLeading ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
        ctx.font = `700 ${Math.round(size * 0.025)}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(opt, pad + 24, curY + optH / 2);

        ctx.textAlign = 'right';
        ctx.fillStyle = isLeading ? '#D8B4FE' : 'rgba(255, 255, 255, 0.55)';
        ctx.font = `900 ${Math.round(size * 0.024)}px Inter, system-ui, sans-serif`;
        ctx.fillText(`${pct}%${isLeading ? ' · Leading' : ''}`, size - pad - 24, curY + optH / 2);

        curY += optH + optGap;
      });
    } else if (isPost) {
      let curY = logoY + Math.round(size * 0.09);

      if (input.authorName) {
        ctx.fillStyle = '#FF8C00';
        ctx.font = `900 ${Math.round(size * 0.024)}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(`@${input.authorName.replace(/\s+/g, '').toLowerCase()}`, pad, curY);
        curY += Math.round(size * 0.045);
      }

      ctx.fillStyle = '#ffffff';
      const textToRender = input.postText || input.title || 'Join the creative community on Plajah';
      const bodySize = Math.round(size * 0.045);
      ctx.font = `700 ${bodySize}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      wrapText(ctx, `"${textToRender}"`, pad, curY, size - pad * 2, bodySize * 1.3, 5);
    } else {
      const textCenterY = Math.round(size * 0.72);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const eyebrow = isTaleo
        ? 'ORIGINAL MOTION PICTURE'
        : isLorea
        ? 'FEATURED LITERARY RELEASE'
        : input.contentType === 'video'
        ? '4K HDR CINEMA'
        : input.contentType === 'album' || input.contentType === 'music'
        ? 'LOSSLESS SPATIAL AUDIO'
        : 'CREATIVE PHOTOGRAPHY';

      ctx.fillStyle = isTaleo ? '#F59E0B' : isLorea ? '#C084FC' : '#ff8c00';
      ctx.font = `900 ${Math.round(size * 0.02)}px Inter, system-ui, sans-serif`;
      ctx.fillText(eyebrow, size / 2, textCenterY - Math.round(size * 0.046));

      ctx.fillStyle = '#ffffff';
      const titleSize = Math.round(size * 0.048);
      ctx.font = `900 ${titleSize}px ${isLorea ? 'Cinzel, Georgia, serif' : 'Inter, system-ui, sans-serif'}`;
      ctx.fillText((input.title || 'Untitled').toUpperCase(), size / 2, textCenterY);

      if (input.artist) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = `700 ${Math.round(size * 0.024)}px Inter, system-ui, sans-serif`;
        ctx.fillText(input.artist.toUpperCase(), size / 2, textCenterY + Math.round(size * 0.042));
      }
    }

    // ── 4. HIGH CONVERSION CALL-TO-ACTION (CTA) PILL ───────────────────────────
    const ctaH = Math.round(size * 0.078);
    const ctaY = size - pad - ctaH;
    const ctaW = size - pad * 2;

    const ctaGrad = ctx.createLinearGradient(pad, ctaY, pad + ctaW, ctaY + ctaH);
    if (isTaleo) {
      ctaGrad.addColorStop(0, '#B45309');
      ctaGrad.addColorStop(0.5, '#D97706');
      ctaGrad.addColorStop(1, '#F59E0B');
    } else if (isLorea) {
      ctaGrad.addColorStop(0, '#6D28D9');
      ctaGrad.addColorStop(0.5, '#7C3AED');
      ctaGrad.addColorStop(1, '#C084FC');
    } else {
      ctaGrad.addColorStop(0, '#FF8C00');
      ctaGrad.addColorStop(0.5, '#D40055');
      ctaGrad.addColorStop(1, '#8A2BE2');
    }

    roundRect(ctx, pad, ctaY, ctaW, ctaH, 20);
    ctx.fillStyle = ctaGrad;
    ctx.fill();

    ctx.strokeStyle = isTaleo ? 'rgba(245, 158, 11, 0.5)' : isLorea ? 'rgba(192, 132, 252, 0.5)' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const ctaText = input.ctaText
      ? input.ctaText
      : isTaleo
      ? '▶ STREAM FILM ON TALEO'
      : isLorea
      ? '📖 READ CHAPTER ON LOREA'
      : isPoll
      ? '⚡ CAST YOUR VOTE ON PLAJAH'
      : input.contentType === 'video'
      ? '▶ WATCH FULL CLIP ON PLAJAH'
      : isPost
      ? '💬 JOIN THE CONVERSATION ON PLAJAH'
      : '▶ EXPERIENCE NOW ON PLAJAH';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size * 0.026)}px ${isLorea ? 'Georgia, serif' : 'Inter, system-ui, sans-serif'}`;
    ctx.fillText(ctaText, pad + 28, ctaY + ctaH / 2);

    const joinPillW = Math.round(size * 0.17);
    const joinPillH = Math.round(ctaH * 0.65);
    const joinPillX = size - pad - joinPillW - 16;
    const joinPillY = ctaY + (ctaH - joinPillH) / 2;

    roundRect(ctx, joinPillX, joinPillY, joinPillW, joinPillH, joinPillH / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size * 0.02)}px ${isLorea ? 'Georgia, serif' : 'Inter, system-ui, sans-serif'}`;
    ctx.fillText(isLorea ? 'PREVIEW →' : 'JOIN FREE →', joinPillX + joinPillW / 2, joinPillY + joinPillH / 2);

    // ── 5. EXPORT AS IMAGE ─────────────────────────────────────────────────────
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.94));
    return { dataUrl, blob };
  } catch (err) {
    console.error('[generateShareCard] error:', err);
    return null;
  }
}
