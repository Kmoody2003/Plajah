import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { hashStudentRef } from "./hash";

initializeApp();
const db = getFirestore();

type BlockScope = "tutoring_only" | "all_paid" | "all";

/**
 * conflictCheck — the ONLY bridge across the Integrity Wall.
 * Called by Plajah checkout/booking flows. Returns booleans only;
 * never a roster record, never which term matched.
 *
 * Legal basis: state ethics opinions locate the conflict in a teacher
 * being PAID for personalized services to students they currently
 * grade. So: hard-block paid tutoring/1:1 on roster match; course
 * purchases follow the district-configurable blockScope dial; free
 * interactions are never blocked; roster hashes expire at term end.
 */
export const conflictCheck = onCall(async (req) => {
  const { creatorUid, purchaserRef, districtSalt, offeringType, isPaid } = req.data as {
    creatorUid: string;
    purchaserRef: string;   // raw ref from checkout — hashed here, never stored
    districtSalt: string;
    offeringType: "tutoring" | "course" | "workshop" | "event";
    isPaid: boolean;
  };
  if (!creatorUid || !purchaserRef) {
    throw new HttpsError("invalid-argument", "creatorUid and purchaserRef required");
  }
  if (!isPaid) return { blocked: false };

  const purchaserHash = hashStudentRef(purchaserRef, districtSalt);
  const now = Date.now();

  const rosters = await db
    .collection(`districtPersona/${creatorUid}/rosters`)
    .where("expiresAt", ">", now)
    .get();

  let rosterMatch = false;
  let blockScope: BlockScope = "tutoring_only";

  for (const doc of rosters.docs) {
    const data = doc.data();
    if (data.blockScope) blockScope = data.blockScope;
    if ((data.students as string[]).includes(purchaserHash)) {
      rosterMatch = true;
      break;
    }
  }
  if (!rosterMatch) return { blocked: false };

  const oneToOne = offeringType === "tutoring";
  const blocked =
    blockScope === "all" ||
    (blockScope === "all_paid" && isPaid) ||
    (blockScope === "tutoring_only" && oneToOne);

  if (blocked) {
    // Append to the teacher's own integrity log — their defense artifact.
    await db.collection(`integrityLog/${creatorUid}/events`).add({
      at: now,
      kind: "conflict_block",
    });
    return { blocked: true, reason: "ROSTER_MATCH" };
  }
  return { blocked: false };
});

/**
 * setSilentMode — mirrors Silent Mode state into a custom auth claim so
 * Firestore rules can block Independent-persona writes server-side even
 * if a modified client ignores the UI lock.
 */
export const setSilentMode = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");
  const { engaged, trigger, schoolId } = req.data as {
    engaged: boolean;
    trigger: "geofence" | "schedule" | "network" | "manual";
    schoolId?: string;
  };

  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims ?? {}), silentMode: engaged };
  await getAuth().setCustomUserClaims(uid, claims);

  await db.collection(`integrityLog/${uid}/events`).add({
    at: Date.now(),
    kind: engaged ? "silent_enter" : "silent_exit",
    trigger,
    ...(schoolId ? { schoolId } : {}),
  });
  return { ok: true };
});

/**
 * validateTemplateLicenses — server-side gate before a template may be
 * marked commercialUse. Only CC-BY / PD materials may cross the wall
 * into paid offerings; BY-SA passes with share-alike propagation.
 */
export const validateTemplateLicenses = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");
  const { templateId } = req.data as { templateId: string };

  const tRef = db.doc(`assignmentTemplates/${templateId}`);
  const tSnap = await tRef.get();
  if (!tSnap.exists || tSnap.get("ownerUid") !== uid) {
    throw new HttpsError("permission-denied", "Not your template");
  }

  const materialIds: string[] = tSnap.get("structure.materials") ?? [];
  const commercialOkLicenses = new Set(["PD", "CC-BY", "CC-BY-SA"]);
  let mostRestrictive = "PD";
  const rank = ["PD", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-NC-SA"];

  for (const id of materialIds) {
    const item = await db.doc(`libraryItems/${id}`).get();
    const lic = item.get("license") as string;
    if (!commercialOkLicenses.has(lic)) {
      await tRef.update({ licenseValidated: false, commercialUse: false });
      return { valid: false, blockingLicense: lic, itemId: id };
    }
    if (rank.indexOf(lic) > rank.indexOf(mostRestrictive)) mostRestrictive = lic;
  }

  await tRef.update({ licenseValidated: true, license: mostRestrictive });
  return { valid: true, license: mostRestrictive };
});
