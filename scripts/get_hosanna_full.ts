const TOKEN = process.env.GOOGLE_OAUTH_TOKEN || '';

async function main() {
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';
  const res = await fetch(`${FS_BASE}/videos/sys_album_1782863181618_8ypf9_movie`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  console.log('VIDEOS DOC:');
  console.log(JSON.stringify(data, null, 2));

  // Also search for any video or track or document that mentions Hosanna or the album id in all fields
  console.log('\nQuerying for any video with album_1782863181618_8ypf9...');
  const resQuery = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'videos' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'albumId' },
            op: 'EQUAL',
            value: { stringValue: 'album_1782863181618_8ypf9' }
          }
        }
      }
    })
  });
  const queryData = await resQuery.json();
  console.log('Query result by albumId:', JSON.stringify(queryData, null, 2));
}

main().catch(console.error);

