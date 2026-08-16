import { createHash } from "crypto";

/**
 * Student references are hashed with a per-district salt BEFORE they
 * reach Plajah. This module is shipped in the district SDK and reused
 * server-side for checkout-time hashing. Plajah never stores or logs
 * the raw reference.
 *
 * normalizedStudentRef: lowercase(trim(districtStudentId or student email))
 */
export function hashStudentRef(normalizedStudentRef: string, districtSalt: string): string {
  return createHash("sha256")
    .update(`${districtSalt}:${normalizedStudentRef.trim().toLowerCase()}`)
    .digest("hex");
}
