#!/usr/bin/env node
/**
 * Plajah Heritage Archive — First Acquisitions Ingest
 * ----------------------------------------------------
 * Downloads verified public-domain / CC0 assets into ./holdings and writes a
 * rights record (JSON sidecar) for every asset, matching the museum's
 * Firestore `rights` schema. Run from the folder containing
 * acquisitions-manifest.json:
 *
 *    node ingest.mjs                 # everything
 *    node ingest.mjs --ia-only       # just the Beni Hasan volumes
 *    node ingest.mjs --met-only      # just the Met CC0 batch
 *    node ingest.mjs --met-limit 40  # cap Met downloads (default 25/query)
 *
 * Requires Node 18+ (built-in fetch). No dependencies.
 * After running, upload ./holdings to Firebase Storage and import the
 * *.rights.json sidecars into Firestore.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const ARGS = process.argv.slice(2);
const IA_ONLY = ARGS.includes("--ia-only");
const MET_ONLY = ARGS.includes("--met-only");
const MET_LIMIT = (() => {
  const i = ARGS.indexOf("--met-limit");
  return i >= 0 ? parseInt(ARGS[i + 1], 10) || 25 : 25;
})();

const OUT = path.resolve("./holdings");
const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1";

/* Met queries: department name -> search terms for combat-relevant objects */
const MET_QUERIES = [
  { department: "Arms and Armor", q: "shield" },
  { department: "Arms and Armor", q: "staff weapon" },
  { department: "Egyptian Art", q: "relief" },
  { department: "Arts of Africa, Oceania, and the Americas", q: "shield" },
  { department: "Arts of Africa, Oceania, and the Americas", q: "staff" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadTo(url, filepath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(filepath));
}

async function writeRights(filepath, record) {
  await writeFile(filepath, JSON.stringify(record, null, 2));
}

/* ---------------- Internet Archive: Beni Hasan volumes ---------------- */
async function ingestIA(acq) {
  const dir = path.join(OUT, "beni-hasan", acq.iaIdentifier);
  await mkdir(dir, { recursive: true });

  console.log(`\n[IA] ${acq.title}`);
  const meta = await (await fetch(`https://archive.org/metadata/${acq.iaIdentifier}`)).json();
  const files = meta.files || [];

  // Prefer the text PDF; fall back to any PDF; also grab the JP2 zip if present
  const pdf =
    files.find((f) => f.name?.toLowerCase().endsWith(".pdf") && f.source === "original") ||
    files.find((f) => f.name?.toLowerCase().endsWith(".pdf"));
  const jp2zip = files.find((f) => f.name?.toLowerCase().endsWith("_jp2.zip"));

  const targets = [pdf, jp2zip].filter(Boolean);
  if (targets.length === 0) {
    console.log("  !! no PDF/JP2 found — check item manually:", acq.iaUrl);
    return;
  }

  for (const f of targets) {
    const dest = path.join(dir, f.name);
    const url = `https://archive.org/download/${acq.iaIdentifier}/${encodeURIComponent(f.name)}`;
    console.log(`  ↓ ${f.name} (${f.size ? (f.size / 1e6).toFixed(1) + " MB" : "size unknown"})`);
    try {
      await downloadTo(url, dest);
      await writeRights(dest + ".rights.json", {
        assetFile: f.name,
        acquisitionId: acq.id,
        title: acq.title,
        creator: acq.creator,
        published: acq.published,
        sourceUrl: acq.iaUrl,
        relevance: acq.relevance,
        rights: acq.rights,
      });
    } catch (e) {
      console.log(`  !! failed: ${e.message}`);
    }
    await sleep(400); // be polite to the Archive
  }
}

/* ---------------- Met Open Access: CC0 artifact images ---------------- */
async function ingestMet(acq) {
  const dir = path.join(OUT, "met-cc0");
  await mkdir(dir, { recursive: true });

  console.log(`\n[MET] Resolving departments…`);
  const depts = (await (await fetch(`${MET_API}/departments`)).json()).departments || [];
  const deptId = (name) => depts.find((d) => d.displayName === name)?.departmentId;

  let manifestRows = [];
  for (const query of MET_QUERIES) {
    const id = deptId(query.department);
    if (!id) {
      console.log(`  !! department not found: ${query.department}`);
      continue;
    }
    const searchUrl = `${MET_API}/search?departmentId=${id}&hasImages=true&q=${encodeURIComponent(query.q)}`;
    const search = await (await fetch(searchUrl)).json();
    const ids = (search.objectIDs || []).slice(0, MET_LIMIT);
    console.log(`  [${query.department} · "${query.q}"] ${search.total || 0} results, taking ${ids.length}`);

    for (const objectID of ids) {
      try {
        const obj = await (await fetch(`${MET_API}/objects/${objectID}`)).json();
        if (!obj.isPublicDomain || !obj.primaryImage) continue; // CC0 gate — non-negotiable

        const ext = path.extname(new URL(obj.primaryImage).pathname) || ".jpg";
        const base = `met-${objectID}`;
        const dest = path.join(dir, base + ext);
        await downloadTo(obj.primaryImage, dest);

        const record = {
          assetFile: base + ext,
          acquisitionId: acq.id,
          metObjectID: objectID,
          title: obj.title,
          culture: obj.culture,
          period: obj.period,
          date: obj.objectDate,
          medium: obj.medium,
          department: obj.department,
          objectUrl: obj.objectURL,
          rights: {
            tier: "open-license",
            license: "CC0 (Met Open Access; isPublicDomain=true)",
            attribution: "Courtesy The Metropolitan Museum of Art (CC0)",
            sourceUrl: obj.objectURL,
            dateVerified: new Date().toISOString().slice(0, 10),
          },
        };
        await writeRights(dest + ".rights.json", record);
        manifestRows.push(record);
        process.stdout.write(`    ✓ ${base}${ext} — ${String(obj.title).slice(0, 60)}\n`);
        await sleep(150); // Met rate courtesy (~80 req/s allowed; we stay far under)
      } catch (e) {
        console.log(`    !! object ${objectID}: ${e.message}`);
      }
    }
  }
  await writeFile(path.join(dir, "_met-batch-manifest.json"), JSON.stringify(manifestRows, null, 2));
  console.log(`  Batch manifest written: ${manifestRows.length} CC0 objects.`);
}

/* ---------------- Run ---------------- */
const manifest = JSON.parse(await readFile("./acquisitions-manifest.json", "utf8"));
await mkdir(OUT, { recursive: true });

for (const acq of manifest.acquisitions) {
  if (acq.iaIdentifier && !MET_ONLY) await ingestIA(acq);
  if (acq.id === "acq-met-open-access-batch-001" && !IA_ONLY) await ingestMet(acq);
}

console.log(`\nDone. Holdings in ${OUT}`);
console.log("Next: upload ./holdings to Firebase Storage; import *.rights.json into Firestore (collection: archiveAssets).");
