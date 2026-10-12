const TOKEN = process.env.GOOGLE_OAUTH_TOKEN || '';

async function main() {
  const PROJECT_ID = 'gen-lang-client-0665118474';
  const DB_ID = 'plajah-prod';
  const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB_ID}/documents`;

  // 1. Fetch album_1782863181618_8ypf9
  console.log('Fetching album album_1782863181618_8ypf9...');
  const res = await fetch(`${FS_BASE}/albums/album_1782863181618_8ypf9`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const albumData = await res.json();
  console.log('Album data:', JSON.stringify(albumData, null, 2));

  // 2. Fetch any subcollections or tracks or videos
  console.log('\nFetching tracks in album...');
  const resTracks = await fetch(`${FS_BASE}/albums/album_1782863181618_8ypf9/tracks`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const tracksData = await resTracks.json();
  console.log('Tracks data:', JSON.stringify(tracksData, null, 2));

  // 3. Check if there are any mux assets or related documents in uploadAttempts with this video/album
  console.log('\nChecking uploadAttempts for album_1782863181618_8ypf9 or Hosanna...');
  const resAttempts = await fetch(`${FS_BASE}:runQuery`, {
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
  const attempts = await resAttempts.json();
  if (Array.isArray(attempts)) {
    for (const item of attempts) {
      const doc = item.document;
      if (!doc) continue;
      const str = JSON.stringify(doc.fields || {});
      if (/1782863181618_8ypf9|Hosanna/i.test(str)) {
        console.log('Matching attempt:', doc.name, JSON.stringify(doc.fields, null, 2));
      }
    }
  }

  // 4. Check taleoAnalysis for Hosanna or album_1782863181618_8ypf9
  console.log('\nChecking taleoAnalysis...');
  const resTaleo = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'taleoAnalysis' }],
        limit: 100,
      }
    })
  });
  const taleos = await resTaleo.json();
  if (Array.isArray(taleos)) {
    for (const item of taleos) {
      const doc = item.document;
      if (!doc) continue;
      const str = JSON.stringify(doc.fields || {});
      if (/1782863181618_8ypf9|Hosanna/i.test(str)) {
        console.log('Matching taleoAnalysis:', doc.name, JSON.stringify(doc.fields, null, 2));
      }
    }
  }
}

main().catch(console.error);

