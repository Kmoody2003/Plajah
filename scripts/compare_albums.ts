const TOKEN = process.env.GOOGLE_OAUTH_TOKEN || '';

async function main() {
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';
  
  // Look at Pumpkin Patch album
  const resPumpkin = await fetch(`${FS_BASE}/albums/album_1787881859314_mlt23`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const pumpkin = await resPumpkin.json();
  console.log('Pumpkin Patch fields:', Object.keys(pumpkin.fields || {}));
  console.log('Pumpkin Patch mux fields:');
  for (const [k, v] of Object.entries(pumpkin.fields || {})) {
    if (/mux|play|video|track|stream/i.test(k)) {
      console.log(`  ${k}:`, JSON.stringify(v));
    }
  }

  // Also look at Hosanna album fields again
  const resHosanna = await fetch(`${FS_BASE}/albums/album_1782863181618_8ypf9`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const hosanna = await resHosanna.json();
  console.log('\nHosanna fields:', Object.keys(hosanna.fields || {}));
  console.log('Hosanna media fields:');
  for (const [k, v] of Object.entries(hosanna.fields || {})) {
    if (/mux|play|video|track|stream|slide|cover|movie/i.test(k)) {
      console.log(`  ${k}:`, JSON.stringify(v));
    }
  }
}

main().catch(console.error);

