// Push tokens live on users/{uid}/private/profile. A public users doc may still hold old ones until the migration strips them.
export function deviceTokens(...docs: (Record<string, any> | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const d of docs) {
    for (const t of Array.isArray(d?.fcmTokens) ? d!.fcmTokens : []) if (typeof t === 'string' && t) out.add(t);
    if (typeof d?.fcmToken === 'string' && d.fcmToken) out.add(d.fcmToken);
  }
  return [...out];
}
