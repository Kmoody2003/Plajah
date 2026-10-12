import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const HOSANNA_VIDEO_URL = 'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/uploads%2Fvideos%2F1784663342098_HosannaTheMovieTheaterMaster5-1.mov?alt=media&token=69077c15-05e5-4a80-8b60-0e6865539d07';
const COVER_URL = 'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fcover_bf.webp?alt=media&token=af7e0972-a226-4b06-9b95-cda25af5e94f';

const SLIDESHOW_URLS = [
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_0.png?alt=media&token=19dfecf2-92ae-4e19-b434-660de9ad977a",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_1.png?alt=media&token=9d292535-1285-4691-9193-7bb8e6007a58",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_2.png?alt=media&token=a27180e1-53b4-428b-a733-d32d7dc3c7ca",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_3.png?alt=media&token=102d6cf8-ffa6-427b-833c-8265c11a2d8c",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_4.png?alt=media&token=4e920044-de6c-4c17-8777-59e02351d699",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_5.png?alt=media&token=c4601026-ab6d-4d2e-bce3-41fe08056cf4",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_6.png?alt=media&token=94dc653d-3f01-4b85-b3dc-5911b4e12fd8",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_7.png?alt=media&token=a3e968d2-b262-412d-91ab-6309f271aae0",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_8.png?alt=media&token=7c416e41-d533-4050-8cd0-7c96c27476a5",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_9.png?alt=media&token=208aeebe-f947-4790-b8d7-a68d01a71be2",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_10.png?alt=media&token=cbac99b9-49f0-4d75-b878-cedb0efcd9fe",
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1782863181618_8ypf9%2Fslideshow%2Fimg_11.png?alt=media&token=737f4a4f-0d27-46fe-a707-ef6facc950d3"
];

async function main() {
  const outDir = 'C:\\Users\\Kenne\\.gemini\\antigravity\\brain\\96986319-8e55-4cf6-90db-e02817ef633c\\hosanna';
  mkdirSync(outDir, { recursive: true });

  console.log('Checking video HEAD...');
  const headRes = await fetch(HOSANNA_VIDEO_URL, { method: 'HEAD' });
  console.log('Video HEAD status:', headRes.status);
  console.log('Content-Length:', headRes.headers.get('content-length'), 'bytes');
  const sizeBytes = parseInt(headRes.headers.get('content-length') || '0', 10);
  console.log('Size MB:', (sizeBytes / (1024 * 1024)).toFixed(2), 'MB');
  console.log('Content-Type:', headRes.headers.get('content-type'));

  console.log('\nDownloading Cover...');
  const coverRes = await fetch(COVER_URL);
  const coverBuf = Buffer.from(await coverRes.arrayBuffer());
  const coverPath = path.join(outDir, 'cover_bf.webp');
  writeFileSync(coverPath, coverBuf);
  console.log(`Saved cover (${coverBuf.length} bytes) to ${coverPath}`);

  console.log('\nDownloading 12 Slideshow Stills...');
  for (let i = 0; i < SLIDESHOW_URLS.length; i++) {
    const res = await fetch(SLIDESHOW_URLS[i]);
    const buf = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(outDir, `hosanna_still_${String(i).padStart(2, '0')}.png`);
    writeFileSync(filePath, buf);
    console.log(`Saved still ${i} (${buf.length} bytes) -> ${filePath}`);
  }
}

main().catch(console.error);
