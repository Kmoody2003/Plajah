/** Curated item IDs, never guessed filenames or automatic title-search matches. */
export const ARCHIVE_FILM_ITEMS: Record<string, string> = {
  'kofa-the-housemaid-1960': 'the-housemaid-1960',
  'europeana-melies-moon-1902': 'ATripToTheMoon20Fps',
  'europeana-metropolis-1927': 'metropolis-1927-bdrip-1080p-x-265-dts-hd-ma-5.1-d-0ct-0r-lew-sev',
  'europeana-nosferatu-1922': 'nosferatu_1922',
  'europeana-caligari-1920': 'DasKabinettdesDoktorCaligariTheCabinetofDrCaligari',
  'europeana-man-movie-camera-1929': 'ChelovekskinoapparatomManWithAMovieCamera',
  'ia-night-of-living-dead-1968': 'night_of_the_living_dead_dvd',
  'ia-carnival-of-souls-1962': 'carnival_of_souls',
  'ia-his-girl-friday-1940': 'HisGirlFriday',
  'ia-the-general-1926': 'The_General_Buster_Keaton',
};

export function selectArchiveVideo(files: any[], preferredName?: string) {
  const candidates = files.filter(f => /\.mp4$/i.test(f.name || '') && Number(f.size) > 0 && !f.private && !/trailer|sample|VIDEO_TS|VTS_\d/i.test(f.name));
  const preferred = candidates.find(f => f.name === preferredName);
  if (preferred) return preferred;
  return candidates.sort((a, b) => Number(b.size) - Number(a.size))[0];
}

export async function resolveArchiveFilm(identifier: string, fetcher: typeof fetch = fetch) {
  const item = ARCHIVE_FILM_ITEMS[identifier];
  if (!item) throw new Error('No verified Archive.org item is configured for this film.');
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetcher(`https://archive.org/metadata/${encodeURIComponent(item)}`, { signal: AbortSignal.timeout(20000) });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  if (!response?.ok) throw new Error(`Archive.org metadata returned HTTP ${response?.status}. The source may be temporarily unavailable.`);
  const data = await response.json();
  if (!data.metadata || data.is_dark || data.metadata.access_restricted) throw new Error(`Archive.org item ${item} is missing or restricted. No download was started.`);
  const file = selectArchiveVideo(data.files || [], identifier === 'ia-night-of-living-dead-1968' ? 'Night.mp4' : undefined);
  if (!file) throw new Error(`Archive.org item ${item} has no downloadable MP4. No alternate film was substituted.`);
  return { url: `https://archive.org/download/${encodeURIComponent(item)}/${file.name.split('/').map(encodeURIComponent).join('/')}`, size: Number(file.size), pageUrl: `https://archive.org/details/${item}`, title: data.metadata.title };
}

export function explainYoutubeError(detail: string): string {
  if (/confirm your age|age.restricted/i.test(detail)) return 'YouTube requires age verification for this film. Open the source on YouTube; the server cannot download it anonymously.';
  if (/sign in|not a bot|cookies/i.test(detail)) return 'YouTube requires sign-in or verification from this connection. Open the source on YouTube.';
  if (/not available|unavailable|removed|private video/i.test(detail)) return 'The source video is unavailable, removed, or restricted on YouTube.';
  if (/No module named.*yt_dlp|ENOENT/i.test(detail)) return 'The server could not run Python/yt-dlp. Check the server downloader installation.';
  return detail.trim().slice(-700) || 'YouTube download failed. Check source availability.';
}
