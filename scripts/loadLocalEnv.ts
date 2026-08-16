// loadLocalEnv — make the local seeder scripts see the same credentials server.ts does.
//
// A standalone `npx tsx scripts/...` run gets a bare process.env: nothing loads .env.local for
// it the way server.ts does at boot. Without this, a key that is plainly sitting in .env.local
// looks missing, and the script fails with "not configured" for no visible reason.
//
// Two ways to supply the service-account key, because pasting a 2 KB single-line JSON blob into
// an env file is an unpleasant thing to ask of anyone:
//
//   npx tsx scripts/<script>.ts --key C:\path\to\service-account.json     ← just point at the file
//   GOOGLE_SERVICE_ACCOUNT_JSON=<contents>  in .env.local                 ← or the env var
//
// The --key path wins when both are present. Matches scripts/seed-classics.mjs, which already
// accepts the key as a file argument.

import { readFileSync } from 'node:fs';

/** Load .env.local (else .env) into process.env, without overwriting anything already set. */
export function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    try {
      readFileSync(file, 'utf8').split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) process.env[key] = value;
      });
      return;
    } catch { /* try the next file */ }
  }
}

/**
 * Resolve the service-account key from `--key <path>` if given, otherwise from the environment.
 * Returns a human-readable description of where it came from, for the script to print — a
 * silent credential is the hardest kind to debug.
 */
export function loadServiceAccount(argv: string[]): { ok: boolean; source: string; error?: string } {
  loadEnvFiles();

  const flag = argv.indexOf('--key');
  if (flag !== -1) {
    const path = argv[flag + 1];
    if (!path) return { ok: false, source: 'none', error: '--key needs a path to the JSON file.' };
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.client_email || !parsed.private_key) {
        return { ok: false, source: path, error: 'That JSON is missing client_email / private_key — is it a service-account key?' };
      }
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = raw;
      return { ok: true, source: `--key ${path} (${parsed.client_email})` };
    } catch (e) {
      return { ok: false, source: path, error: `Could not read that file: ${(e as Error).message}` };
    }
  }

  const fromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!fromEnv) return { ok: false, source: 'none' };
  try {
    const parsed = JSON.parse(fromEnv);
    return { ok: true, source: `GOOGLE_SERVICE_ACCOUNT_JSON (${parsed.client_email ?? 'unknown account'})` };
  } catch {
    return { ok: false, source: 'GOOGLE_SERVICE_ACCOUNT_JSON', error: 'The value is set but is not valid JSON. It must be the whole key file on ONE line.' };
  }
}

/**
 * Confirm the key actually authenticates BEFORE doing any work.
 *
 * Without this, a key that is present but rejected (revoked, wrong project, truncated paste)
 * shows up as a wall of per-item "FAILED" lines with nothing pointing at the real cause. One
 * upfront check turns that into a sentence someone can act on.
 */
export async function preflightCredentials(): Promise<{ ok: boolean; message: string }> {
  const { getAccessToken, adminConfig } = await import('../services/firebaseAdminRest');

  // Retry: a dropped connection here reads as "no token", and blaming the key for a network
  // blip sends someone off to regenerate a credential that was never the problem.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1200 * attempt));
    if (await getAccessToken()) {
      return { ok: true, message: `authenticated against ${adminConfig.PROJECT_ID}/${adminConfig.DB_ID}` };
    }
  }

  // Still nothing. Ask Google directly, so the message can name the ACTUAL cause: a rejected
  // key and an unreachable network are the same `null` to getAccessToken, but they need
  // completely different responses from whoever is reading this.
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=probe',
    });
    // A response of any kind means the network is fine, so the credential is the problem.
    void res;
    return {
      ok: false,
      message:
        'Google refused the service-account key.\n' +
        '  · Was the key revoked or deleted in the Firebase console?\n' +
        `  · Is it from THIS project (${adminConfig.PROJECT_ID})?\n` +
        '  · If pasted into .env.local, is the whole thing on ONE line?\n' +
        'Generating a fresh key is the quickest fix.',
    };
  } catch (e) {
    return {
      ok: false,
      message:
        `Could not reach Google (${(e as any)?.cause?.code ?? (e as Error).message}).\n` +
        'This is a network problem, NOT a problem with your key — do not regenerate it.\n' +
        'Check the connection and run the same command again.',
    };
  }
}

/** The message a non-developer can actually act on. */
export const CREDENTIAL_HELP = `
No Firebase service-account key found.

  1. Firebase console → Project settings (gear) → Service accounts
  2. "Generate new private key" → downloads a .json file
  3. Re-run this command with:  --key "C:\\path\\to\\that-file.json"

Treat that file like a password: it has full access to the project.
Keep it outside the repo so it can never be committed.
`.trim();
