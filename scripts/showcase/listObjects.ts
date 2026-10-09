// listObjects: what can a behaviour target on a showcase page? Prints the stable ids and labels of the Tela doc's objects.
//   npx tsx scripts/showcase/listObjects.ts moon-blanket --page=3            every object on page 3 (id, kind, label, role, box)
//   npx tsx scripts/showcase/listObjects.ts moon-blanket --page=3 --label=Eye   only labels starting with "Eye"
//   npx tsx scripts/showcase/listObjects.ts moon-blanket --labels            label histogram per page (label -> count), the way a `{ label }` target sees the page
//   npx tsx scripts/showcase/listObjects.ts moon-blanket --audit             the labelling audit (unlabeled / generic labels the mapping layer renamed)
import { auditShowcaseLabels, buildShowcaseTelaDoc } from '../../services/showcase/livingDoc';

const [bookId, ...rest] = process.argv.slice(2);
const opt = (k: string) => (rest.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
if (!bookId) { console.error('usage: listObjects.ts <book-id> [--page=N] [--label=prefix] [--labels] [--audit]'); process.exit(2); }
if (rest.includes('--audit')) { console.log(JSON.stringify(auditShowcaseLabels(bookId), null, 2)); process.exit(0); }
const doc = buildShowcaseTelaDoc(bookId);
const only = Number(opt('page') || 0); const prefix = opt('label');
doc.frames.forEach((f, i) => {
  if (only && only !== i + 1) return;
  const d = doc.devices[f.deviceIds[0]]; if (d.type !== 'VECTOR') return;
  if (rest.includes('--labels')) {
    const h = new Map<string, number>(); for (const o of d.objects) h.set(o.objectLabel || '', (h.get(o.objectLabel || '') || 0) + 1);
    console.log(`\npage ${i + 1} "${f.label}" ${d.width}x${d.height}, ${d.objects.length} objects`);
    for (const [l, n] of [...h.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${l}`);
    return;
  }
  console.log(`\npage ${i + 1} "${f.label}" ${d.width}x${d.height}, ${d.objects.length} objects`);
  for (const o of d.objects) {
    if (prefix && !(o.objectLabel || '').startsWith(prefix)) continue;
    console.log(`  ${o.id}  ${o.kind.padEnd(7)} ${(o.objectLabel || '').padEnd(34)} ${(o.templateRole || '').padEnd(10)} ${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}x${Math.round(o.h)}`);
  }
});
