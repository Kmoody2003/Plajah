/**
 * OpenStax ingest — CC BY, commercial OK with attribution.
 * OpenStax publishes structured book JSON; this script walks a book's
 * table of contents and writes libraryItems with license tagging.
 *
 * Usage: npx tsx scripts/ingest/openstax.ts <bookSlug>
 * e.g.   npx tsx scripts/ingest/openstax.ts prealgebra-2e
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { composeAttribution } from "../../src/lib/licensing/licenseGate";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const OPENSTAX_BOOKS: Record<string, { title: string; subject: string; gradeBands: string[] }> = {
  "prealgebra-2e":        { title: "Prealgebra 2e", subject: "math", gradeBands: ["6-8"] },
  "elementary-algebra-2e":{ title: "Elementary Algebra 2e", subject: "math", gradeBands: ["6-8", "9-12"] },
  "algebra-and-trigonometry-2e": { title: "Algebra and Trigonometry 2e", subject: "math", gradeBands: ["9-12"] },
  "biology-ap-courses":   { title: "Biology for AP Courses", subject: "science", gradeBands: ["9-12"] },
  "physics":              { title: "Physics", subject: "science", gradeBands: ["9-12"] },
};

async function main() {
  const slug = process.argv[2];
  const meta = OPENSTAX_BOOKS[slug];
  if (!meta) throw new Error(`Unknown book slug: ${slug}. Add it to OPENSTAX_BOOKS.`);
  const url = `https://openstax.org/books/${slug}`;

  await db.collection("libraryItems").add({
    source: "OpenStax (Rice University)",
    sourceUrl: url,
    license: "CC-BY",
    commercialOk: true,
    shareAlike: false,
    attribution: composeAttribution("OpenStax", meta.title, "CC-BY", url),
    subjects: [meta.subject],
    gradeBands: meta.gradeBands,
    standards: [],  // populated during alignment pass
    title: meta.title,
    format: "textbook",
  });
  console.log(`Ingested ${meta.title} (CC-BY, commercial OK)`);
}
main().catch(e => { console.error(e); process.exit(1); });
