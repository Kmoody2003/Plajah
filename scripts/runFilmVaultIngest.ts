import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import {
  SURFACED_PUBLIC_DOMAIN_FILMS,
  setVaultDirectory,
  stageAllVaultCatalogMetadata,
  syncVaultStatus,
  syncFilmToPlatformFirestore,
  ingestFilmIntoMux,
  enqueueVaultDownload,
  generateAttributionManifest,
  getDiskStats,
} from '../routes/adminFilmIngest';
import { getSelfHostedFilm } from '../services/selfHostedFilms';

async function main() {
  const targetDir = process.env.FILM_VAULT_DIR || 'D:\\plajah-media\\films';
  const vaultDir = await setVaultDirectory(targetDir);
  const disk = await getDiskStats(vaultDir);
  console.log(`[VaultIngestRunner] Active Vault Directory: ${vaultDir} (${disk.freeGb} GB free / ${disk.totalGb} GB total)`);

  const staged = await stageAllVaultCatalogMetadata();
  console.log(`[VaultIngestRunner] Staged ${staged.stagedCount} film/series directories. Manifest: ${staged.manifestPath}`);

  const statuses = await syncVaultStatus(vaultDir);
  const alreadyDone = statuses.filter((s) => s.status === 'COMPLETED').length;
  console.log(`[VaultIngestRunner] ${alreadyDone} / ${SURFACED_PUBLIC_DOMAIN_FILMS.length} titles already completed on disk.`);

  // Prioritize anime/cartoons & shorter classics first so completed titles land rapidly, then features & series
  const orderedCatalog = [...SURFACED_PUBLIC_DOMAIN_FILMS].sort((a, b) => {
    const aIsAnime = a.identifier.startsWith('anime-') || (a.genre || '').toLowerCase().includes('anime') ? 0 : 1;
    const bIsAnime = b.identifier.startsWith('anime-') || (b.genre || '').toLowerCase().includes('anime') ? 0 : 1;
    if (aIsAnime !== bIsAnime) return aIsAnime - bIsAnime;
    return (a.estimatedSizeBytes || 0) - (b.estimatedSizeBytes || 0);
  });

  // 1. Immediately enqueue all non-completed titles into the 2-worker sequential local disk downloader
  let queuedCount = 0;
  for (const film of orderedCatalog) {
    if (film.sourceIssue) continue;
    const videoPath = path.join(vaultDir, film.identifier, 'video.mp4');
    if (!fs.existsSync(videoPath)) {
      await enqueueVaultDownload(film.identifier);
      queuedCount++;
    }
  }
  console.log(`[VaultIngestRunner] Queued ${queuedCount} titles for sequential local vault download onto ${vaultDir} (2 concurrent workers).`);

  // 2. In parallel, sync all 134 catalog records to Platform Firestore & Mux HLS
  (async () => {
    for (const film of orderedCatalog) {
      if (film.sourceIssue) continue;
      try {
        const existingSelfHosted = getSelfHostedFilm(film.identifier);
        const directUrl = film.directDownloadUrl;
        await syncFilmToPlatformFirestore(film, {
          videoUrl: directUrl,
          muxPlaybackId: existingSelfHosted?.muxPlaybackId,
          muxAssetId: existingSelfHosted?.muxAssetId,
        });
        if (!existingSelfHosted?.muxPlaybackId && directUrl) {
          await ingestFilmIntoMux(film, directUrl);
        }
      } catch (err: any) {
        console.warn(`[VaultIngestRunner] Firestore/Mux sync note for ${film.identifier}:`, err?.message || err);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(`[VaultIngestRunner] Firestore & Mux metadata sync pass completed for all ${orderedCatalog.length} titles.`);
  })();

  // 3. Periodically log progress and refresh attribution_manifest.json until all downloads finish
  const monitor = setInterval(async () => {
    try {
      const currentStatuses = await syncVaultStatus(vaultDir);
      const completed = currentStatuses.filter((s) => s.status === 'COMPLETED');
      const downloading = currentStatuses.filter((s) => s.status === 'DOWNLOADING');
      const queued = currentStatuses.filter((s) => s.status === 'PAUSED' && s.speedFormatted === 'Queued');
      const errors = currentStatuses.filter((s) => s.status === 'ERROR');

      const activeSummary = downloading
        .map((d) => `${d.identifier}: ${d.progressPercent}% (${d.speedFormatted}, ETA ${d.etaFormatted})`)
        .join(' | ');

      console.log(
        `[VaultProgress] Completed: ${completed.length}/${SURFACED_PUBLIC_DOMAIN_FILMS.length} | Downloading: ${downloading.length} [${activeSummary || 'starting...'}] | Queued: ${queued.length} | Errors: ${errors.length}`
      );

      await generateAttributionManifest().catch(() => {});

      if (downloading.length === 0 && queued.length === 0) {
        console.log(`[VaultIngestRunner] All queued downloads finished! Completed: ${completed.length}/${SURFACED_PUBLIC_DOMAIN_FILMS.length}.`);
        clearInterval(monitor);
      }
    } catch {}
  }, 10000);
}

main().catch((err) => {
  console.error('[VaultIngestRunner] Fatal error:', err);
  process.exit(1);
});
