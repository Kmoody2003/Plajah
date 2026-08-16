/**
 * CK-12 link-out catalog — CC BY-NC (NON-commercial).
 * These items are ingested as METADATA + OUTBOUND LINKS ONLY and are
 * hard-gated to the free tier by licenseGate. Do not mirror content.
 * A separate commercial agreement with CK-12 would be needed to change
 * this posture.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { composeAttribution } from "../../src/lib/licensing/licenseGate";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const SEED = [
  { title: "CK-12 Middle School Math - Grade 6", url: "https://www.ck12.org/c/middle-school-math-grade-6/", subject: "math", gradeBands: ["6-8"] },
  { title: "CK-12 Earth Science for Middle School", url: "https://www.ck12.org/c/earth-science/", subject: "science", gradeBands: ["6-8"] },
];

async function main() {
  for (const s of SEED) {
    await db.collection("libraryItems").add({
      source: "CK-12 Foundation",
      sourceUrl: s.url,
      license: "CC-BY-NC",
      commercialOk: false,   // free tier / link-out ONLY
      shareAlike: false,
      attribution: composeAttribution("CK-12 Foundation", s.title, "CC-BY-NC", s.url),
      subjects: [s.subject],
      gradeBands: s.gradeBands,
      standards: [],
      title: s.title,
      format: "textbook",
    });
  }
  console.log(`Ingested ${SEED.length} CK-12 link-out items (CC-BY-NC, free tier only)`);
}
main().catch(e => { console.error(e); process.exit(1); });
