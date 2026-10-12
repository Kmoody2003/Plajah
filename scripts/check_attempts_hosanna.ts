const TOKEN = process.env.GOOGLE_OAUTH_TOKEN || '';

async function main() {
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';

  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'uploadAttempts' }],
        limit: 100,
      }
    })
  });
  const data = await res.json();
  if (Array.isArray(data)) {
    for (const d of data) {
      if (!d.document) continue;
      const str = JSON.stringify(d.document.fields || {});
      if (/Hosanna|TheaterMaster|1784663342098/i.test(str)) {
        console.log('MATCH in uploadAttempts:', d.document.name, JSON.stringify(d.document.fields, null, 2));
      }
    }
  }

  // Also check if there is an album description or story text in any other collection or field
  console.log('\nChecking if there are any other documents matching Hosanna in plajah-prod...');
}

main().catch(console.error);

