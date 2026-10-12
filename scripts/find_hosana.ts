const TOKEN = process.argv[2] || process.env.ACCESS_TOKEN || process.env.GOOGLE_OAUTH_TOKEN || '';

async function main() {
  console.log('Using token:', TOKEN.slice(0, 20) + '...');

  const PROJECT_ID = 'gen-lang-client-0665118474';
  const DB_ID = 'plajah-prod';
  const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB_ID}/documents`;

  const collections = ['albums', 'videos', 'uploadAttempts', 'taleoAnalysis'];

  for (const col of collections) {
    console.log(`\n=== Scanning collection: ${col} ===`);
    const res = await fetch(`${FS_BASE}:runQuery`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: col }],
          limit: 300,
        }
      })
    });

    const data = await res.json();
    if (Array.isArray(data)) {
      console.log(`Found ${data.length} docs in ${col}`);
      for (const item of data) {
        const doc = item.document;
        if (!doc) continue;
        const str = JSON.stringify(doc.fields || {});
        const title = doc.fields?.title?.stringValue || doc.fields?.name?.stringValue || doc.fields?.targetTitle?.stringValue || '';
        if (title) {
          console.log(`  [${col}] Title: "${title}" | ID: ${doc.name.split('/').pop()}`);
        }
        if (/hosan/i.test(str)) {
          console.log(`\n>>> [MATCH in ${col}] ${doc.name}:`);
          console.log(JSON.stringify(doc.fields, null, 2));
        }
      }
    } else {
      console.log(`Error or non-array response for ${col}:`, data);
    }
  }
}

main().catch(console.error);


