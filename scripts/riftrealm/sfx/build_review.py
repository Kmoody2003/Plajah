import json, html
cat = json.load(open('D:/plajah-tmp/rift-sfx/clips/catalog.json'))
order = ['gunshot', 'reload', 'impact', 'boom', 'whoosh', 'metal', 'energy', 'creature', 'insect', 'vocal', 'footsteps', 'ambience', 'announcer', 'misc']
cat.sort(key=lambda c: (order.index(c['cat']), -c['conf']))
data = json.dumps(cat)
page = """<!doctype html><html><head><meta charset="utf-8"><title>Rift Realm SFX picks</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#101214;--card:#1a1d21;--fg:#e6e6e6;--mute:#8a9099;--acc:#3fd3ff;--keep:#2ecc71}
body{margin:0;background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif}
header{position:sticky;top:0;background:#0b0d0fee;padding:10px 16px;border-bottom:1px solid #222;z-index:2}
h1{font-size:17px;margin:0 0 6px}.tabs button{background:#22262b;color:var(--fg);border:0;border-radius:14px;padding:4px 10px;margin:2px;cursor:pointer}
.tabs button.on{background:var(--acc);color:#000}.bar{color:var(--mute);font-size:12px;margin-top:4px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;padding:12px 16px}
.c{background:var(--card);border-radius:8px;overflow:hidden;border:2px solid transparent}.c.k{border-color:var(--keep)}
.c img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;background:#000;cursor:pointer}
.c .b{padding:6px 8px}.c .n{font-size:12px;color:var(--mute);word-break:break-all}.c .l{font-size:12px;margin:3px 0}
.c audio{width:100%;height:30px}.c label{font-size:13px;cursor:pointer;user-select:none}
#exp{background:var(--keep);color:#000;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;margin-left:8px}
</style></head><body>
<header><h1>Rift Realm sound effects from the Flow videos</h1><div class="tabs" id="tabs"></div>
<div class="bar"><span id="count"></span> &middot; click a picture to play &middot; tick Keep for the ones the game should use<button id="exp">Copy kept list</button></div></header>
<main id="grid"></main>
<script>
const C = DATA, ORDER = ORDERS; let tab = 'gunshot', keep = new Set();
try { keep = new Set(JSON.parse(localStorage.getItem('rrKeep') || '[]')); } catch {}
const save = () => { try { localStorage.setItem('rrKeep', JSON.stringify([...keep])); } catch {} };
function tabs() { document.getElementById('tabs').innerHTML = ['all', ...ORDER].map(t => { const n = t === 'all' ? C.length : C.filter(c => c.cat === t).length; const k = C.filter(c => (t === 'all' || c.cat === t) && keep.has(c.file)).length; return `<button class="${t === tab ? 'on' : ''}" data-t="${t}">${t} ${n}${k ? ' / ' + k + ' kept' : ''}</button>`; }).join('');
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); }); }
function render() { tabs(); const list = C.filter(c => tab === 'all' || c.cat === tab);
  document.getElementById('count').textContent = `${list.length} clips, ${keep.size} kept overall`;
  document.getElementById('grid').innerHTML = list.map(c => `<div class="c ${keep.has(c.file) ? 'k' : ''}" data-f="${c.file}"><img loading="lazy" src="clips/${c.file}.jpg" alt=""><div class="b">
   <audio preload="none" controls src="clips/${c.file}.mp3"></audio><div class="l">${c.labels.join(' · ')} <span class="n">(${Math.round(c.conf * 100)}%)</span></div>
   <div class="n">${c.src.replace(/_[0-9a-f]{8}\.mp4$/, '')} @ ${c.t0.toFixed(1)}s, ${c.dur}s</div><label><input type="checkbox" ${keep.has(c.file) ? 'checked' : ''}> Keep</label></div></div>`).join('');
  document.querySelectorAll('.c').forEach(el => { const f = el.dataset.f, a = el.querySelector('audio');
    el.querySelector('img').onclick = () => { document.querySelectorAll('audio').forEach(x => x !== a && x.pause()); a.currentTime = 0; a.play(); };
    el.querySelector('input').onchange = (e) => { e.target.checked ? keep.add(f) : keep.delete(f); el.classList.toggle('k', e.target.checked); save(); tabs(); document.getElementById('count').textContent = `${list.length} clips, ${keep.size} kept overall`; }; }); }
document.getElementById('exp').onclick = () => { navigator.clipboard?.writeText(JSON.stringify([...keep], null, 1)); document.getElementById('exp').textContent = 'Copied ' + keep.size; };
render();
</script></body></html>""".replace('DATA', data).replace('ORDERS', json.dumps(order))
open('D:/plajah-tmp/rift-sfx/review.html', 'w', encoding='utf-8').write(page)
print('ok', len(cat))
