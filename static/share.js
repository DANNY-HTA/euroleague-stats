// "Download as image": draws a red-and-white player card (1080×1350) in the browser.
(function () {
  'use strict';
  const btn = document.getElementById('share-btn');
  const dataEl = document.getElementById('share-data');
  if (!btn || !dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const RED = '#d7182a', RED2 = '#a3101e', INK = '#14161b', MUTED = '#5d6270', SOFT = '#f1f2f4';
  const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif', BODY = 'Inter, system-ui, sans-serif';

  const loadImg = (src) => new Promise((res) => {
    if (!src) return res(null);
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
  });
  function fit(ctx, text, maxW, size, weight = 800, family = DISPLAY) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 20);
    return s + 2;
  }
  function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  async function draw(withCrest) {
    await Promise.all([document.fonts.load(`800 40px "Barlow Condensed"`), document.fonts.load(`600 20px Inter`)]).catch(() => {});
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f5f7'; ctx.fillRect(0, 0, W, H);
    // red cover
    const g = ctx.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, RED); g.addColorStop(1, RED2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 560);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 70; ctx.beginPath(); ctx.arc(W - 40, 520, 300, 0, Math.PI * 2); ctx.stroke();
    // brand row
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(76, 76, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(76, 76, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 34px ${DISPLAY}`; ctx.textBaseline = 'middle'; ctx.fillText(D.site.toUpperCase(), 106, 78);
    ctx.font = `600 22px ${BODY}`; ctx.textAlign = 'right'; ctx.fillText(D.season, W - 58, 78); ctx.textAlign = 'left';
    // kicker pill
    ctx.font = `800 26px ${DISPLAY}`;
    const kw = ctx.measureText(D.kicker.toUpperCase()).width + 44;
    ctx.fillStyle = '#fff'; round(ctx, 58, 140, kw, 50, 25); ctx.fill();
    ctx.fillStyle = RED; ctx.fillText(D.kicker.toUpperCase(), 80, 166);
    // name
    ctx.fillStyle = '#fff';
    const ns = fit(ctx, D.name.toUpperCase(), D.number ? 720 : 960, 130);
    ctx.font = `800 ${ns}px ${DISPLAY}`; ctx.textBaseline = 'alphabetic'; ctx.fillText(D.name.toUpperCase(), 54, 320);
    // jersey number outline
    if (D.number) { ctx.font = `800 260px ${DISPLAY}`; ctx.textAlign = 'right'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(D.number, W - 58, 380); ctx.textAlign = 'left'; }
    // team line
    let x = 58;
    const crest = withCrest ? await loadImg(D.crest) : null;
    if (crest) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 26, 392, 28, 0, Math.PI * 2); ctx.fill(); ctx.drawImage(crest, x + 6, 372, 40, 40); x += 70; }
    ctx.fillStyle = '#fff'; ctx.font = `600 28px ${BODY}`; ctx.textBaseline = 'middle';
    ctx.fillText(D.meta, x, 394);
    // lede (wrapped)
    ctx.font = `400 25px ${BODY}`; ctx.fillStyle = 'rgba(255,255,255,.92)';
    const words = D.lede.split(' '); let line = '', y = 462;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > 960) { ctx.fillText(line, 58, y); line = w; y += 36; if (y > 510) break; } else line = t; }
    if (y <= 510) ctx.fillText(line, 58, y);
    // tiles
    const tw = (W - 58 * 2 - 3 * 20) / 4;
    D.tiles.forEach((t, i) => {
      const tx = 58 + i * (tw + 20), ty = 590;
      ctx.fillStyle = '#fff'; round(ctx, tx, ty, tw, 250, 18); ctx.fill();
      ctx.fillStyle = RED; ctx.fillRect(tx, ty, tw, 8);
      ctx.fillStyle = MUTED; ctx.font = `700 20px ${DISPLAY}`; ctx.textBaseline = 'alphabetic'; ctx.fillText(t.label.toUpperCase(), tx + 22, ty + 48);
      ctx.fillStyle = INK; ctx.font = `800 ${fit(ctx, t.value, tw - 40, 86)}px ${DISPLAY}`; ctx.fillText(t.value, tx + 20, ty + 140);
      ctx.fillStyle = MUTED; ctx.font = `500 17px ${BODY}`; ctx.fillText(t.sub, tx + 22, ty + 172);
      if (t.rank) {
        ctx.font = `700 17px ${BODY}`; const rw = ctx.measureText(t.rank).width + 28;
        ctx.fillStyle = t.hot ? RED : SOFT; round(ctx, tx + 20, ty + 194, Math.min(rw, tw - 40), 36, 18); ctx.fill();
        ctx.fillStyle = t.hot ? '#fff' : INK; ctx.fillText(t.rank, tx + 34, ty + 218);
      }
    });
    // game by game
    ctx.fillStyle = '#fff'; round(ctx, 58, 870, W - 116, 380, 18); ctx.fill();
    ctx.fillStyle = RED; ctx.fillRect(80, 900, 7, 30);
    ctx.fillStyle = INK; ctx.font = `800 34px ${DISPLAY}`; ctx.fillText('GAME BY GAME', 100, 928);
    ctx.fillStyle = MUTED; ctx.font = `400 19px ${BODY}`; ctx.fillText(D.gbgNote, 82, 962);
    const games = D.games, base = 1170, top = 1010, slot = (W - 116 - 48) / Math.max(games.length, 1), bw = Math.min(64, slot * 0.62);
    const max = Math.max(10, ...games.map((x) => x.pts));
    games.forEach((gm, i) => {
      const h = Math.max(4, (gm.pts / max) * (base - top - 30)), bx = 82 + i * slot + (slot - bw) / 2;
      ctx.fillStyle = gm.win ? RED : '#c9ccd3'; round(ctx, bx, base - h, bw, h, 6); ctx.fill();
      ctx.fillStyle = INK; ctx.font = `800 26px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.fillText(String(gm.pts), bx + bw / 2, base - h - 10);
      ctx.font = `800 18px ${DISPLAY}`; ctx.fillText(gm.opp, bx + bw / 2, base + 28);
      ctx.fillStyle = MUTED; ctx.font = `500 13px ${BODY}`; ctx.fillText(gm.win ? 'Win' : 'Loss', bx + bw / 2, base + 48);
      ctx.textAlign = 'left';
    });
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(82, base); ctx.lineTo(W - 82, base); ctx.stroke();
    // footer
    ctx.fillStyle = MUTED; ctx.font = `500 17px ${BODY}`; ctx.fillText(D.footer, 58, 1300);
    ctx.fillStyle = RED; ctx.font = `800 26px ${DISPLAY}`; ctx.textAlign = 'right'; ctx.fillText(D.site.toUpperCase(), W - 58, 1302); ctx.textAlign = 'left';
    return c;
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Drawing…';
    try {
      let canvas = await draw(true), blob;
      try { blob = await new Promise((r) => canvas.toBlob(r, 'image/png')); } catch { blob = null; }
      if (!blob) { canvas = await draw(false); blob = await new Promise((r) => canvas.toBlob(r, 'image/png')); }
      const file = new File([blob], D.file, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: D.name }); return; } catch { /* fall back to download */ } }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = D.file; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally { btn.disabled = false; btn.textContent = label; }
  });
})();
