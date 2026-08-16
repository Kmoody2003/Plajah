/**
 * Project Gutenberg ingest — public domain, zero restrictions.
 * The ELA reading backbone. Uses the Gutendex API (gutendex.com) to
 * pull metadata for curated reading lists.
 *
 * Usage: npx tsx scripts/ingest/gutenberg.ts <gutenbergId> <gradeBand>
 * e.g.   npx tsx scripts/ingest/gutenberg.ts 1342 9-12    (Pride and Prejudice)
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { composeAttribution } from "../../src/lib/licensing/licenseGate";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  const id = process.argv[2];
  const gradeBand = process.argv[3] ?? "9-12";
  const res = await fetch(`https://gutendex.com/books/${id}`);
  if (!res.ok) throw new Error(`Gutendex ${res.status} for id ${id}`);
  const book = await res.json() as { title: string; authors: Array<{ name: string }> };
  const url = `https://www.gutenberg.org/ebooks/${id}`;

  await db.collection("libraryItems").add({
    source: "Project Gutenberg",
    sourceUrl: url,
    license: "PD",
    commercialOk: true,
    shareAlike: false,
    attribution: composeAttribution("Project Gutenberg", book.title, "PD", url),
    subjects: ["ela"],
    gradeBands: [gradeBand],
    standards: [],
    title: `${book.title} — ${book.authors.map(a => a.name).join(", ")}`,
    format: "reading",
  });
  console.log(`Ingested "${book.title}" (public domain)`);
}
main().catch(e => { console.error(e); process.exit(1); });
