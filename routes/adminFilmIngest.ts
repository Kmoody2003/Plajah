import express, { Router, type RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { registerSelfHostedFilm } from '../services/selfHostedFilms';
import { ARCHIVE_FILM_ITEMS, resolveArchiveFilm, explainYoutubeError } from '../services/filmIngestSources';

export interface FilmVaultItem {
  identifier: string;
  title: string;
  year: string;
  director: string;
  archive: 'KOFA' | 'EUROPEANA' | 'INTERNET_ARCHIVE' | 'LIBRARY_OF_CONGRESS';
  rights: string;
  runtime: string;
  genre: string;
  youtubeUrl?: string;
  directDownloadUrl?: string;
  thumbnailUrl: string;
  description: string;
  curatorNote: string;
  dataProvider: string;
  sourcePageUrl: string;
  estimatedSizeBytes: number;
  sourceIssue?: string;
}

export interface IngestJobStatus {
  identifier: string;
  status: 'IDLE' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  bytesDownloaded: number;
  totalBytes: number;
  progressPercent: number;
  speedFormatted: string;
  etaFormatted: string;
  error?: string;
  localVideoPath?: string;
  localThumbnailPath?: string;
  lastUpdated: number;
}

// Master catalogue of surfaced public domain & preserved masterworks on Plajah
export const SURFACED_PUBLIC_DOMAIN_FILMS: FilmVaultItem[] = [
  // ── Korean Film Archive (KOFA) Preservation Masters ──────────────────────────
  {
    identifier: 'kofa-the-housemaid-1960',
    title: 'The Housemaid (하녀)',
    year: '1960',
    director: 'Kim Ki-young',
    archive: 'KOFA',
    rights: 'Free Public Access / KOFA Preservation',
    runtime: '111 min',
    genre: 'Thriller',
    youtubeUrl: 'https://www.youtube.com/watch?v=aSKb2XC61_o',
    directDownloadUrl: 'https://archive.org/download/the-housemaid-1960/the-housemaid-1960.mp4',
    thumbnailUrl: 'https://img.youtube.com/vi/aSKb2XC61_o/hqdefault.jpg',
    description: 'Kim Ki-young’s 1960 psychological thriller masterpiece, widely considered one of the greatest Korean films of all time.',
    curatorNote: 'Bong Joon-ho’s primary cinematic inspiration for Parasite. A claustrophobic domestic horror film exploring class anxiety, modernized bourgeois households, and psychosexual sabotage.',
    dataProvider: 'Korean Film Archive (KOFA)',
    sourcePageUrl: 'https://www.kmdb.or.kr',
    estimatedSizeBytes: 1850 * 1024 * 1024,
  },
  {
    identifier: 'kofa-aimless-bullet-1961',
    title: 'Aimless Bullet (오발탄)',
    year: '1961',
    director: 'Yu Hyun-mok',
    archive: 'KOFA',
    rights: 'Free Public Access / KOFA Preservation',
    runtime: '107 min',
    genre: 'Drama',
    youtubeUrl: 'https://www.youtube.com/watch?v=F58W7oK6Y2A',
    thumbnailUrl: 'https://img.youtube.com/vi/F58W7oK6Y2A/hqdefault.jpg',
    description: 'Yu Hyun-mok’s landmark 1961 post-Korean War realist masterpiece capturing the struggle and spirit of post-war Seoul.',
    curatorNote: 'Frequently ranked the #1 Korean film of all time in Korean critical polls. Features striking deep-focus photography and expressionist urban decay depicting a traumatized family.',
    dataProvider: 'Korean Film Archive (KOFA)',
    sourcePageUrl: 'https://www.kmdb.or.kr',
    estimatedSizeBytes: 1720 * 1024 * 1024,
  },
  {
    identifier: 'kofa-madame-freedom-1956',
    title: 'Madame Freedom (자유부인)',
    year: '1956',
    director: 'Han Hyung-mo',
    archive: 'KOFA',
    rights: 'Free Public Access / KOFA Preservation',
    runtime: '125 min',
    genre: 'Romance',
    youtubeUrl: 'https://www.youtube.com/watch?v=bHD8fmB04Hk',
    thumbnailUrl: 'https://img.youtube.com/vi/bHD8fmB04Hk/hqdefault.jpg',
    description: 'Han Hyung-mo’s provocative 1956 romantic drama exploring modern dance, Westernization, and freedom in 1950s Korea.',
    curatorNote: 'A box-office phenomenon that provoked fierce national debates on female independence, luxury consumerism, and Western cha-cha-cha dance culture.',
    dataProvider: 'Korean Film Archive (KOFA)',
    sourcePageUrl: 'https://www.kmdb.or.kr',
    estimatedSizeBytes: 1950 * 1024 * 1024,
  },
  {
    identifier: 'kofa-sweet-dream-1936',
    title: 'Sweet Dream (미몽 - Lullaby of Death)',
    year: '1936',
    director: 'Yang Ju-nam',
    archive: 'KOFA',
    rights: 'Public Domain / KOFA Preservation',
    runtime: '47 min',
    genre: 'Drama',
    youtubeUrl: 'https://www.youtube.com/watch?v=tmd_OBPFll8',
    thumbnailUrl: 'https://img.youtube.com/vi/tmd_OBPFll8/hqdefault.jpg',
    description: 'Yang Ju-nam’s 1936 classic — the oldest surviving Korean sound motion picture, preserved by KOFA.',
    curatorNote: 'An irreplaceable cultural relic: the oldest surviving Korean sound film. Features early location footage of colonial Keijo (Seoul), department stores, and passenger trains.',
    dataProvider: 'Korean Film Archive (KOFA)',
    sourcePageUrl: 'https://www.kmdb.or.kr',
    estimatedSizeBytes: 750 * 1024 * 1024,
  },
  {
    identifier: 'kofa-flower-in-hell-1958',
    title: 'A Flower in Hell (지옥화)',
    year: '1958',
    director: 'Shin Sang-ok',
    archive: 'KOFA',
    rights: 'Free Public Access / KOFA Preservation',
    runtime: '86 min',
    genre: 'Action',
    youtubeUrl: 'https://www.youtube.com/watch?v=4FU1Hc7Zk24',
    thumbnailUrl: 'https://img.youtube.com/vi/4FU1Hc7Zk24/hqdefault.jpg',
    description: 'Shin Sang-ok’s gritty 1958 neo-realist masterwork filmed on the streets of post-war Seoul.',
    curatorNote: 'Legendary actress Choi Eun-hee gives a fearless performance as Sonia, surviving amid black-market contraband and American military base camps.',
    dataProvider: 'Korean Film Archive (KOFA)',
    sourcePageUrl: 'https://www.kmdb.or.kr',
    estimatedSizeBytes: 1400 * 1024 * 1024,
  },
  {
    identifier: 'kofa-the-coachman-1961',
    title: 'The Coachman (마부)',
    year: '1961',
    director: 'Kang Dae-jin',
    archive: 'KOFA',
    rights: 'Free Public Access / KOFA Preservation',
    runtime: '103 min',
    genre: 'Drama',
    youtubeUrl: 'https://www.youtube.com/watch?v=UqqB0HUFmUU',
    thumbnailUrl: 'https://img.youtube.com/vi/UqqB0HUFmUU/hqdefault.jpg',
    description: 'Kang Dae-jin’s poignant family drama — the first Korean film ever to win an international prize (Berlin Silver Bear, 1961).',
    curatorNote: 'Starring Korea’s towering screen icon Kim Seung-ho as an aging horse-cart driver facing the rapid rise of automotive modernity.',
    dataProvider: 'Korean Film Archive (KOFA)',
    sourcePageUrl: 'https://www.kmdb.or.kr',
    estimatedSizeBytes: 1650 * 1024 * 1024,
  },

  // ── Europeana Cultural Heritage Masters ─────────────────────────────────────
  {
    identifier: 'europeana-melies-moon-1902',
    title: 'Le Voyage dans la Lune (A Trip to the Moon)',
    year: '1902',
    director: 'Georges Méliès',
    archive: 'EUROPEANA',
    rights: 'Public Domain Mark 1.0',
    runtime: '13 min',
    genre: 'Sci-Fi',
    youtubeUrl: 'https://www.youtube.com/watch?v=sh05WiO8cqg',
    directDownloadUrl: 'https://archive.org/download/TripToTheMoon1902/TripToTheMoon1902.mp4',
    thumbnailUrl: 'https://img.youtube.com/vi/sh05WiO8cqg/hqdefault.jpg',
    description: 'Georges Méliès landmark 1902 French science fiction adventure film — cinema’s first visionary space voyage.',
    curatorNote: 'The cornerstone of cinematic special effects. Méliès invented in-camera dissolves, stop-motion substitution, and multi-exposure effects that defined movie magic.',
    dataProvider: 'Cinémathèque Française',
    sourcePageUrl: 'https://www.europeana.eu/item/08627/04',
    estimatedSizeBytes: 120 * 1024 * 1024,
  },
  {
    identifier: 'europeana-metropolis-1927',
    title: 'Metropolis',
    year: '1927',
    director: 'Fritz Lang',
    archive: 'EUROPEANA',
    rights: 'Public Domain Mark 1.0',
    runtime: '153 min',
    genre: 'Sci-Fi',
    youtubeUrl: 'https://www.youtube.com/watch?v=K52Yv7WCJSY',
    directDownloadUrl: 'https://archive.org/download/Metropolis_1927/Metropolis_1927.mp4',
    thumbnailUrl: 'https://img.youtube.com/vi/K52Yv7WCJSY/hqdefault.jpg',
    description: 'Fritz Lang’s towering German expressionist science-fiction masterpiece set in a dystopian futuristic city-state.',
    curatorNote: 'The definitive architectural science fiction epic. Its vision of a stratified metropolis, the robotic False Maria, and monumental Art Deco staging remains unchallenged.',
    dataProvider: 'Deutsche Kinemathek',
    sourcePageUrl: 'https://www.europeana.eu/item/08627/02',
    estimatedSizeBytes: 2400 * 1024 * 1024,
  },
  {
    identifier: 'europeana-nosferatu-1922',
    title: 'Nosferatu: Eine Symphonie des Grauens',
    year: '1922',
    director: 'F.W. Murnau',
    archive: 'EUROPEANA',
    rights: 'Public Domain Mark 1.0',
    runtime: '94 min',
    genre: 'Horror',
    youtubeUrl: 'https://www.youtube.com/watch?v=OJ3BfIdTzPc',
    directDownloadUrl: 'https://archive.org/download/nosferatu_1922/nosferatu_1922.mp4',
    thumbnailUrl: 'https://img.youtube.com/vi/OJ3BfIdTzPc/hqdefault.jpg',
    description: 'F.W. Murnau’s seminal 1922 silent horror film adaptation of Dracula, featuring Max Schreck as Count Orlok.',
    curatorNote: 'Murnau rejected claustrophobic studio sets to film Nosferatu in real Baltic and Carpathian locations, creating an uncanny naturalistic terror.',
    dataProvider: 'Transit Film / Murnau Stiftung',
    sourcePageUrl: 'https://www.europeana.eu/item/08627/01',
    estimatedSizeBytes: 1500 * 1024 * 1024,
  },
  {
    identifier: 'europeana-caligari-1920',
    title: 'The Cabinet of Dr. Caligari',
    year: '1920',
    director: 'Robert Wiene',
    archive: 'EUROPEANA',
    rights: 'Public Domain Mark 1.0',
    runtime: '77 min',
    genre: 'Horror',
    youtubeUrl: 'https://www.youtube.com/watch?v=iO7k0tn7PQA',
    directDownloadUrl: 'https://archive.org/download/TheCabinetOfDr.Caligari/TheCabinetOfDr.Caligari.mp4',
    thumbnailUrl: 'https://img.youtube.com/vi/iO7k0tn7PQA/hqdefault.jpg',
    description: 'Robert Wiene’s dark German Expressionist horror film with twisted, angular painted sets and haunting shadows.',
    curatorNote: 'Considered the first true horror art film. Painted shadows, skewed geometric perspectives, and an unhinged narrative mirror the psychological fractures of post-WWI Europe.',
    dataProvider: 'Deutsches Filminstitut',
    sourcePageUrl: 'https://www.europeana.eu/item/08627/03',
    estimatedSizeBytes: 1200 * 1024 * 1024,
  },
  {
    identifier: 'europeana-man-movie-camera-1929',
    title: 'Man with a Movie Camera (Chelovek s kinoapparatom)',
    year: '1929',
    director: 'Dziga Vertov',
    archive: 'EUROPEANA',
    rights: 'Public Domain Mark 1.0',
    runtime: '68 min',
    genre: 'Documentary',
    youtubeUrl: 'https://www.youtube.com/watch?v=YeAEdqLtABg',
    directDownloadUrl: 'https://archive.org/download/ManWithAMovieCamera1929/ManWithAMovieCamera1929.mp4',
    thumbnailUrl: 'https://img.youtube.com/vi/YeAEdqLtABg/hqdefault.jpg',
    description: 'Dziga Vertov’s revolutionary avant-garde Soviet documentary celebrating urban life, montage, and cinema perception.',
    curatorNote: 'Voted one of the greatest films ever made in Sight & Sound polls. Employs split-screen, fast motion, slow motion, freeze frames, and reflexivity without a single intertitle.',
    dataProvider: 'European Film Gateway',
    sourcePageUrl: 'https://www.europeana.eu/item/08627/05',
    estimatedSizeBytes: 1100 * 1024 * 1024,
  },
  {
    identifier: 'europeana-polygoon-newsreel-1931',
    title: 'Polygoon Hollands Nieuws (1931 Vintage Newsreel)',
    year: '1931',
    director: 'Polygoon-Profilti Staff',
    archive: 'EUROPEANA',
    rights: 'CC-BY-SA / Open Access',
    runtime: '12 min',
    genre: 'Classic TV',
    youtubeUrl: 'https://www.youtube.com/watch?v=9WOeFIfaZM0',
    thumbnailUrl: 'https://img.youtube.com/vi/9WOeFIfaZM0/hqdefault.jpg',
    description: 'Authentic 1930s European newsreel capturing aviation milestones, canal life, and street life across Europe.',
    curatorNote: 'The newsreel was cinema’s primary journalistic organ before television. Polygoon’s voiceovers and brisk cutting defined Dutch and European public broadcasting.',
    dataProvider: 'Netherlands Institute for Sound and Vision',
    sourcePageUrl: 'https://www.europeana.eu/item/08627/06',
    estimatedSizeBytes: 150 * 1024 * 1024,
  },

  // ── United States & Internet Archive Public Domain Masterworks ──────────────
  {
    identifier: 'ia-night-of-living-dead-1968',
    title: 'Night of the Living Dead',
    year: '1968',
    director: 'George A. Romero',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '96 min',
    genre: 'Horror',
    directDownloadUrl: 'https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead_512kb.mp4',
    thumbnailUrl: 'https://archive.org/services/img/night_of_the_living_dead',
    description: 'George A. Romero’s independent horror landmark that established modern zombie cinema.',
    curatorNote: 'Fell into the public domain immediately upon release due to an accidental copyright notice omission by its distributor. Selected for preservation in the National Film Registry.',
    dataProvider: 'Library of Congress / Internet Archive',
    sourcePageUrl: 'https://archive.org/details/night_of_the_living_dead',
    estimatedSizeBytes: 1600 * 1024 * 1024,
  },
  {
    identifier: 'ia-carnival-of-souls-1962',
    title: 'Carnival of Souls',
    year: '1962',
    director: 'Herk Harvey',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '78 min',
    genre: 'Horror',
    directDownloadUrl: 'https://archive.org/download/carnival_of_souls/carnival_of_souls_512kb.mp4',
    thumbnailUrl: 'https://archive.org/services/img/carnival_of_souls',
    description: 'Cult psychological horror following a church organist haunted by a spectral stranger after surviving a car crash.',
    curatorNote: 'A seminal influence on David Lynch and Roman Polanski, filmed on location in Lawrence, Kansas and Salt Lake City.',
    dataProvider: 'Prelinger Archives / Internet Archive',
    sourcePageUrl: 'https://archive.org/details/carnival_of_souls',
    estimatedSizeBytes: 1100 * 1024 * 1024,
  },
  {
    identifier: 'ia-charade-1963',
    title: 'Charade',
    year: '1963',
    director: 'Stanley Donen',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '113 min',
    genre: 'Mystery',
    directDownloadUrl: 'https://archive.org/download/Charade_1963/Charade_1963.mp4',
    thumbnailUrl: 'https://archive.org/services/img/Charade_1963',
    description: 'Cary Grant and Audrey Hepburn star in the quintessential romantic mystery-comedy thriller set in Paris.',
    curatorNote: 'Known as "the best Hitchcock movie that Hitchcock never made", entering the public domain due to an omission in its opening credits.',
    dataProvider: 'Universal / Internet Archive',
    sourcePageUrl: 'https://archive.org/details/Charade_1963',
    estimatedSizeBytes: 1900 * 1024 * 1024,
  },
  {
    identifier: 'ia-his-girl-friday-1940',
    title: 'His Girl Friday',
    year: '1940',
    director: 'Howard Hawks',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '92 min',
    genre: 'Comedy',
    directDownloadUrl: 'https://archive.org/download/HisGirlFriday/HisGirlFriday.mp4',
    thumbnailUrl: 'https://archive.org/services/img/HisGirlFriday',
    description: 'Cary Grant and Rosalind Russell in the definitive rapid-fire screwball comedy about tabloid journalism.',
    curatorNote: 'Famous for pioneering overlapping dialogue where characters speak concurrently, creating a lightning-fast realistic rhythm.',
    dataProvider: 'Columbia Pictures / Internet Archive',
    sourcePageUrl: 'https://archive.org/details/HisGirlFriday',
    estimatedSizeBytes: 1400 * 1024 * 1024,
  },
  {
    identifier: 'ia-the-general-1926',
    title: 'The General',
    year: '1926',
    director: 'Buster Keaton, Clyde Bruckman',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '79 min',
    genre: 'Comedy',
    directDownloadUrl: 'https://archive.org/download/The_General_Buster_Keaton/The_General.mp4',
    thumbnailUrl: 'https://archive.org/services/img/The_General_Buster_Keaton',
    description: 'Buster Keaton’s silent masterpiece featuring legendary locomotive stuntwork and physical precision.',
    curatorNote: 'Keaton performed all train stunts himself without safety rigs or doubles. Regularly cited among the greatest silent films in world history.',
    dataProvider: 'Library of Congress / Internet Archive',
    sourcePageUrl: 'https://archive.org/details/The_General_Buster_Keaton',
    estimatedSizeBytes: 1300 * 1024 * 1024,
  },
];

// Preserve stable app identifiers, but display the actual hosting source.
for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
  const item = ARCHIVE_FILM_ITEMS[film.identifier];
  if (item) {
    film.archive = 'INTERNET_ARCHIVE';
    film.dataProvider = 'Internet Archive';
    film.sourcePageUrl = `https://archive.org/details/${item}`;
    film.thumbnailUrl = `https://archive.org/services/img/${item}`;
    delete film.directDownloadUrl; // File names are resolved from metadata at download time.
    delete film.youtubeUrl; // Never silently substitute a different uploader/version.
  } else if (film.identifier === 'kofa-madame-freedom-1956') {
    film.youtubeUrl = 'https://www.youtube.com/watch?v=V7MBFaVxyBc';
    film.thumbnailUrl = 'https://img.youtube.com/vi/V7MBFaVxyBc/hqdefault.jpg';
    film.sourcePageUrl = film.youtubeUrl;
  } else if (['kofa-aimless-bullet-1961', 'europeana-polygoon-newsreel-1931', 'ia-charade-1963'].includes(film.identifier)) {
    film.sourceIssue = 'The configured video is missing or does not match this catalog entry. A verified replacement is needed.';
    delete film.youtubeUrl;
    delete film.directDownloadUrl;
  } else if (film.youtubeUrl) {
    film.sourcePageUrl = film.youtubeUrl;
  }
}

interface FilmIngestConfig {
  vaultDirectory: string;
}

const CONFIG_FILE_PATH = path.resolve(process.cwd(), 'config', 'film_vault_config.json');
const DEFAULT_VAULT_DIR = path.resolve(process.cwd(), 'vault', 'films');

// Active download child processes and HTTP streams by film identifier
const activeProcesses: Record<string, ChildProcess> = {};
const activeHttpRequests: Record<string, http.ClientRequest> = {};
const inMemoryStatuses: Record<string, IngestJobStatus> = {};

/**
 * Load configured vault directory from disk
 */
export async function getVaultDirectory(): Promise<string> {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = await fsp.readFile(CONFIG_FILE_PATH, 'utf8');
      const parsed: FilmIngestConfig = JSON.parse(raw);
      if (parsed.vaultDirectory && parsed.vaultDirectory.trim()) {
        return path.resolve(parsed.vaultDirectory.trim());
      }
    }
  } catch {}
  return DEFAULT_VAULT_DIR;
}

/**
 * Save custom vault directory
 */
export async function setVaultDirectory(newDir: string): Promise<string> {
  const resolved = path.resolve(newDir.trim());
  await fsp.mkdir(resolved, { recursive: true });
  await fsp.mkdir(path.dirname(CONFIG_FILE_PATH), { recursive: true });
  const config: FilmIngestConfig = { vaultDirectory: resolved };
  await fsp.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
  return resolved;
}

/**
 * Get disk space statistics for a path
 */
export async function getDiskStats(targetPath: string) {
  try {
    await fsp.mkdir(targetPath, { recursive: true });
    const stat = await fsp.statfs(targetPath);
    const bsize = BigInt(stat.bsize);
    const bfree = BigInt(stat.bfree);
    const blocks = BigInt(stat.blocks);
    const freeBytes = Number(bfree * bsize);
    const totalBytes = Number(blocks * bsize);
    return {
      freeBytes,
      totalBytes,
      freeGb: (freeBytes / (1024 * 1024 * 1024)).toFixed(1),
      totalGb: (totalBytes / (1024 * 1024 * 1024)).toFixed(1),
    };
  } catch {
    return {
      freeBytes: 0,
      totalBytes: 0,
      freeGb: 'Unknown',
      totalGb: 'Unknown',
    };
  }
}

/**
 * Inspect local directory for existing .mp4 or .mp4.part files and sync in-memory status
 */
export async function syncVaultStatus(vaultDir: string): Promise<IngestJobStatus[]> {
  await fsp.mkdir(vaultDir, { recursive: true });

  const results: IngestJobStatus[] = [];

  for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
    const filmDir = path.join(vaultDir, film.identifier);
    const completeFile = path.join(filmDir, 'video.mp4');
    const partFile = path.join(filmDir, 'video.mp4.part');
    const ytdlPart = path.join(filmDir, 'video.mp4.ytdl');
    const thumbFile = path.join(filmDir, 'thumbnail.jpg');

    // The previous Madame Freedom URL was an essay, not this film.
    if (film.identifier === 'kofa-madame-freedom-1956' && !fs.existsSync(path.join(filmDir, 'download-source.json')) && fs.existsSync(filmDir)) {
      for (const name of await fsp.readdir(filmDir)) {
        if (/^video\./.test(name) && !name.includes('.previous-')) {
          await fsp.rename(path.join(filmDir, name), path.join(filmDir, `${name}.previous-${Date.now()}`));
        }
      }
    }

    let current = inMemoryStatuses[film.identifier];
    if (!current) {
      current = {
        identifier: film.identifier,
        status: 'IDLE',
        bytesDownloaded: 0,
        totalBytes: film.estimatedSizeBytes,
        progressPercent: 0,
        speedFormatted: '0 KB/s',
        etaFormatted: '--:--',
        lastUpdated: Date.now(),
      };
      inMemoryStatuses[film.identifier] = current;
    }

    // Check if finished video exists on disk
    if (fs.existsSync(completeFile)) {
      const s = await fsp.stat(completeFile);
      current.status = 'COMPLETED';
      current.bytesDownloaded = s.size;
      current.totalBytes = s.size;
      current.progressPercent = 100;
      current.speedFormatted = 'Complete';
      current.etaFormatted = '00:00';
      current.localVideoPath = completeFile;
      if (fs.existsSync(thumbFile)) {
        current.localThumbnailPath = thumbFile;
      }
      // Register into self-hosted films map
      registerSelfHostedFilm({
        identifier: film.identifier,
        videoUrl: `/api/admin/film-ingest/stream/${encodeURIComponent(film.identifier)}`,
        thumbnailUrl: film.thumbnailUrl,
        sourceType: 'LOCAL_VAULT',
        isAvailable: true,
        sizeBytes: s.size,
      });
    } else if (current.status !== 'DOWNLOADING') {
      // Check if partial file exists for resume
      let partSize = 0;
      if (fs.existsSync(partFile)) {
        const s = await fsp.stat(partFile);
        partSize = s.size;
      } else if (fs.existsSync(ytdlPart)) {
        const s = await fsp.stat(ytdlPart);
        partSize = s.size;
      }

      if (partSize > 0) {
        if (current.status !== 'ERROR') current.status = 'PAUSED';
        current.bytesDownloaded = partSize;
        const total = current.totalBytes || film.estimatedSizeBytes;
        current.progressPercent = Math.min(99.9, Math.round((partSize / total) * 1000) / 10);
        current.speedFormatted = 'Paused';
        current.etaFormatted = 'Paused';
      }
    }

    results.push({ ...current });
  }

  return results;
}

/**
 * Resilient HTTP range downloader for direct MP4 links
 */
async function downloadDirectHttp(
  film: FilmVaultItem,
  url: string,
  filmDir: string,
  status: IngestJobStatus,
  redirects = 0
): Promise<void> {
  const partFile = path.join(filmDir, 'video.mp4.part');
  const targetFile = path.join(filmDir, 'video.mp4');

  await fsp.mkdir(filmDir, { recursive: true });

  // Get current byte offset if .part exists
  let startByte = 0;
  if (fs.existsSync(partFile)) {
    const stat = await fsp.stat(partFile);
    startByte = stat.size;
  }

  return new Promise<void>((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const headers: Record<string, string> = {
      'User-Agent': 'PlajahVaultMediaIngest/1.0',
    };
    if (startByte > 0) {
      headers['Range'] = `bytes=${startByte}-`;
    }

    const req = client.get(url, { headers }, (res) => {
      // Handle redirect
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) { reject(new Error('Source redirected too many times.')); return; }
        const redirectUrl = new URL(res.headers.location, url).toString();
        downloadDirectHttp(film, redirectUrl, filmDir, status, redirects + 1).then(resolve).catch(reject);
        return;
      }

      const isPartial = res.statusCode === 206;
      const isOk = res.statusCode === 200;

      if (!isPartial && !isOk) {
        res.resume();
        if (res.statusCode === 416 && Number(res.headers['content-range']?.split('/')[1]) === startByte && startByte > 0) {
          // Range Not Satisfiable: could mean complete
          if (fs.existsSync(partFile)) {
            fsp.rename(partFile, targetFile).then(() => {
              status.status = 'COMPLETED';
              resolve();
            }).catch(reject);
            return;
          }
        }
        reject(new Error(`${new URL(url).hostname} returned HTTP ${res.statusCode}: ${res.statusMessage}. ${res.statusCode === 404 ? 'The source file is unavailable.' : 'The source rejected the request or is temporarily unavailable.'}`));
        return;
      }

      if (/text\/|application\/(json|xml)/i.test(String(res.headers['content-type']))) {
        res.resume(); reject(new Error('Source returned a web page instead of a video.')); return;
      }

      let totalContentLength = 0;
      if (res.headers['content-range']) {
        const match = res.headers['content-range'].match(/\/(\d+)$/);
        if (match) totalContentLength = parseInt(match[1], 10);
      } else if (res.headers['content-length']) {
        totalContentLength = parseInt(res.headers['content-length'], 10) + (isPartial ? startByte : 0);
      }

      if (totalContentLength > 0) {
        status.totalBytes = totalContentLength;
      }

      const writeStream = fs.createWriteStream(partFile, {
        flags: isPartial && startByte > 0 ? 'a' : 'w',
      });

      let downloadedSinceStart = 0;
      let lastSpeedCalc = Date.now();
      let lastBytes = 0;

      res.on('data', (chunk) => {
        downloadedSinceStart += chunk.length;
        const totalDownloaded = (isPartial ? startByte : 0) + downloadedSinceStart;
        status.bytesDownloaded = totalDownloaded;
        if (status.totalBytes > 0) {
          status.progressPercent = Math.min(99.9, Math.round((totalDownloaded / status.totalBytes) * 1000) / 10);
        }

        const now = Date.now();
        if (now - lastSpeedCalc >= 1000) {
          const deltaSec = (now - lastSpeedCalc) / 1000;
          const deltaBytes = downloadedSinceStart - lastBytes;
          const bytesPerSec = deltaBytes / deltaSec;
          status.speedFormatted = `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;

          if (status.totalBytes > totalDownloaded && bytesPerSec > 0) {
            const remainingSec = Math.round((status.totalBytes - totalDownloaded) / bytesPerSec);
            const m = Math.floor(remainingSec / 60);
            const s = remainingSec % 60;
            status.etaFormatted = `${m}:${s.toString().padStart(2, '0')}`;
          }

          lastSpeedCalc = now;
          lastBytes = downloadedSinceStart;
          status.lastUpdated = now;
        }
      });

      res.on('aborted', () => writeStream.destroy(new Error('Source disconnected. Retry to resume the partial download.')));
      res.on('error', err => writeStream.destroy(err));
      res.pipe(writeStream);

      writeStream.on('finish', async () => {
        delete activeHttpRequests[film.identifier];
        try {
          await fsp.rename(partFile, targetFile);
          status.status = 'COMPLETED';
          status.bytesDownloaded = status.totalBytes || totalContentLength;
          status.progressPercent = 100;
          status.speedFormatted = 'Complete';
          status.etaFormatted = '00:00';
          status.localVideoPath = targetFile;
          registerSelfHostedFilm({
            identifier: film.identifier,
            videoUrl: `/api/admin/film-ingest/stream/${encodeURIComponent(film.identifier)}`,
            thumbnailUrl: film.thumbnailUrl,
            sourceType: 'LOCAL_VAULT',
            isAvailable: true,
            sizeBytes: status.bytesDownloaded,
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      writeStream.on('error', (err) => {
        delete activeHttpRequests[film.identifier];
        reject(err);
      });
    });

    activeHttpRequests[film.identifier] = req;
    req.setTimeout(30000, () => req.destroy(new Error('Source connection timed out. Retry to resume.')));

    req.on('error', (err) => {
      delete activeHttpRequests[film.identifier];
      reject(err);
    });
  });
}

/**
 * Resilient yt-dlp downloader with auto-continue flag
 */
async function downloadWithYtDlp(
  film: FilmVaultItem,
  filmDir: string,
  status: IngestJobStatus
): Promise<void> {
  const targetTemplate = path.join(filmDir, 'video.%(ext)s');
  const finalVideo = path.join(filmDir, 'video.mp4');

  await fsp.mkdir(filmDir, { recursive: true });

  return new Promise<void>((resolve, reject) => {
    // python -m yt_dlp with -c (auto-resume), standard retries, best progressive mp4
    const args = [
      '-m', 'yt_dlp',
      '--js-runtimes', `node:${process.execPath}`,
      '-c', // Continue partially downloaded files
      '--no-playlist',
      '--retries', '10',
      '--fragment-retries', '10',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', targetTemplate,
      '--newline',
      film.youtubeUrl!,
    ];

    const child = spawn('python', args, { cwd: filmDir });
    activeProcesses[film.identifier] = child;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      // Parse yt-dlp progress: [download]  45.2% of 1.20GiB at 3.45MiB/s ETA 02:15
      const pctMatch = text.match(/\[download\]\s+([\d\.]+)%/);
      if (pctMatch) {
        status.progressPercent = parseFloat(pctMatch[1]);
      }
      const sizeMatch = text.match(/of\s+~?([\d\.]+)(KiB|MiB|GiB|B)/i);
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        const mult = unit === 'GIB' ? 1024 * 1024 * 1024 : unit === 'MIB' ? 1024 * 1024 : unit === 'KIB' ? 1024 : 1;
        status.totalBytes = Math.round(val * mult);
        status.bytesDownloaded = Math.round((status.progressPercent / 100) * status.totalBytes);
      }
      const speedMatch = text.match(/at\s+([\d\.]+\w+\/s)/i);
      if (speedMatch) {
        status.speedFormatted = speedMatch[1];
      }
      const etaMatch = text.match(/ETA\s+([\d\:]+)/i);
      if (etaMatch) {
        status.etaFormatted = etaMatch[1];
      }
      status.lastUpdated = Date.now();
    });

    let errorDetail = '';
    child.stderr.on('data', (chunk) => {
      errorDetail = (errorDetail + chunk.toString()).slice(-4000);
      console.warn(`[yt-dlp ${film.identifier}]`, chunk.toString().trim());
    });

    child.on('close', async (code) => {
      delete activeProcesses[film.identifier];
      if (code === 0) {
        // Look for completed video.mp4 or video.mkv
        if (fs.existsSync(finalVideo)) {
          const s = await fsp.stat(finalVideo);
          status.status = 'COMPLETED';
          status.bytesDownloaded = s.size;
          status.totalBytes = s.size;
          status.progressPercent = 100;
          status.speedFormatted = 'Complete';
          status.etaFormatted = '00:00';
          status.localVideoPath = finalVideo;
          registerSelfHostedFilm({
            identifier: film.identifier,
            videoUrl: `/api/admin/film-ingest/stream/${encodeURIComponent(film.identifier)}`,
            thumbnailUrl: film.thumbnailUrl,
            sourceType: 'LOCAL_VAULT',
            isAvailable: true,
            sizeBytes: s.size,
          });
        }
        if (!fs.existsSync(finalVideo)) { reject(new Error('Downloader finished without producing an MP4 file.')); return; }
        resolve();
      } else if (status.status === 'PAUSED') {
        resolve();
      } else {
        reject(new Error(explainYoutubeError(errorDetail)));
      }
    });

    child.on('error', (err) => {
      delete activeProcesses[film.identifier];
      reject(err);
    });
  });
}

/**
 * Save thumbnail and attribution metadata sidecar into folder
 */
async function saveMetadataSidecars(film: FilmVaultItem, filmDir: string) {
  try {
    const metaPath = path.join(filmDir, 'metadata.json');
    await fsp.writeFile(metaPath, JSON.stringify(film, null, 2), 'utf8');

    // Download thumbnail if not present
    const thumbPath = path.join(filmDir, 'thumbnail.jpg');
    if (!fs.existsSync(thumbPath) && film.thumbnailUrl) {
      const parsed = new URL(film.thumbnailUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      client.get(film.thumbnailUrl, (res) => {
        if (res.statusCode === 200) {
          res.pipe(fs.createWriteStream(thumbPath));
        }
      });
    }
  } catch (e) {
    console.warn(`Could not save sidecars for ${film.identifier}:`, e);
  }
}

/**
 * Core download execution dispatcher
 */
export async function startOrResumeDownload(identifier: string): Promise<IngestJobStatus> {
  const film = SURFACED_PUBLIC_DOMAIN_FILMS.find((f) => f.identifier === identifier);
  if (!film) {
    throw new Error(`Film with identifier ${identifier} not found`);
  }
  if (film.sourceIssue) throw new Error(film.sourceIssue);

  const vaultDir = await getVaultDirectory();
  const filmDir = path.join(vaultDir, film.identifier);
  await fsp.mkdir(filmDir, { recursive: true });

  if (inMemoryStatuses[identifier]?.status === 'DOWNLOADING') return inMemoryStatuses[identifier];

  const status = inMemoryStatuses[identifier] || {
    identifier,
    status: 'IDLE',
    bytesDownloaded: 0,
    totalBytes: film.estimatedSizeBytes,
    progressPercent: 0,
    speedFormatted: 'Starting...',
    etaFormatted: '--:--',
    lastUpdated: Date.now(),
  };
  inMemoryStatuses[identifier] = status;

  status.status = 'DOWNLOADING';
  status.error = undefined;
  const isPaused = () => status.status === 'PAUSED';

  // Run asynchronously so caller gets immediate response
  (async () => {
    try {
      let downloadUrl: string | undefined;
      if (ARCHIVE_FILM_ITEMS[identifier]) {
        const resolved = await resolveArchiveFilm(identifier);
        downloadUrl = resolved.url;
        status.totalBytes = resolved.size;
      } else if (film.youtubeUrl) {
        const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(film.youtubeUrl)}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`YouTube source is unavailable (HTTP ${response.status}).`);
        const metadata = await response.json();
        if (metadata.author_url !== 'https://www.youtube.com/@KoreanFilm') throw new Error('Source is not from the verified Korean Classic Film channel. Download stopped.');
      }
      if (isPaused()) return;
      const source = downloadUrl || film.youtubeUrl;
      const sourceFile = path.join(filmDir, 'download-source.json');
      let previousSource: string | undefined;
      try { previousSource = JSON.parse(await fsp.readFile(sourceFile, 'utf8')).url; } catch {}
      if (previousSource !== source) {
        // Keep old bytes for recovery, but never append a new source to an old video.
        for (const name of await fsp.readdir(filmDir)) {
          if (/^video\.(mp4|webm|mkv|f\d+)/.test(name) && !name.includes('.previous-')) {
            await fsp.rename(path.join(filmDir, name), path.join(filmDir, `${name}.previous-${Date.now()}`));
          }
        }
      }
      await fsp.writeFile(sourceFile, JSON.stringify({ url: source, sourcePageUrl: film.sourcePageUrl }));
      await saveMetadataSidecars(film, filmDir);

      // Prefer direct download URL if available (Internet Archive, etc.)
      if (downloadUrl) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await downloadDirectHttp(film, downloadUrl, filmDir, status); break; }
          catch (error: any) {
            if (isPaused()) return;
            if (attempt === 2 || !/HTTP (429|500|502|503|504)|timed out|disconnected/i.test(error.message)) throw error;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            if (isPaused()) return;
          }
        }
      } else if (film.youtubeUrl) {
        await downloadWithYtDlp(film, filmDir, status);
      } else {
        throw new Error('No supported download source found');
      }
    } catch (err: any) {
      if (status.status !== 'PAUSED') {
        console.error(`Download failed for ${identifier}:`, err);
        status.status = 'ERROR';
        status.error = err?.message || 'Download failed';
      }
    }
  })();

  return status;
}

/**
 * Pause active download cleanly
 */
export function pauseDownload(identifier: string): IngestJobStatus {
  const status = inMemoryStatuses[identifier];
  if (status) {
    status.status = 'PAUSED';
    status.speedFormatted = 'Paused';
    status.etaFormatted = 'Paused';
  }

  if (activeProcesses[identifier]) {
    try {
      activeProcesses[identifier].kill('SIGTERM');
    } catch {}
    delete activeProcesses[identifier];
  }

  if (activeHttpRequests[identifier]) {
    try {
      activeHttpRequests[identifier].destroy();
    } catch {}
    delete activeHttpRequests[identifier];
  }

  return status || {
    identifier,
    status: 'PAUSED',
    bytesDownloaded: 0,
    totalBytes: 0,
    progressPercent: 0,
    speedFormatted: 'Paused',
    etaFormatted: 'Paused',
    lastUpdated: Date.now(),
  };
}

/**
 * Generate attribution manifest
 */
export async function generateAttributionManifest(): Promise<string> {
  const vaultDir = await getVaultDirectory();
  await syncVaultStatus(vaultDir);

  const manifest = {
    title: 'Plajah Public Domain & Preserved Motion Picture Vault',
    generatedAt: new Date().toISOString(),
    vaultDirectory: vaultDir,
    curator: 'Taleo Film Archive Curator & Historical Preservations Team',
    mission: 'Providing non-exclusive public preservation, educational access, and digital stewardship for historical cinema.',
    archives: [
      {
        name: 'Korean Film Archive (KOFA / KMDb)',
        url: 'https://www.kmdb.or.kr',
        jurisdiction: 'Republic of Korea',
        notes: 'Digitally preserved in 4K/2K from surviving camera negatives and nitrate prints.',
      },
      {
        name: 'Europeana Film Heritage & European Film Gateway (EFG)',
        url: 'https://www.europeana.eu',
        jurisdiction: 'European Union',
        notes: 'Coordinated across European cinematheques including Friedrich-Wilhelm-Murnau-Stiftung, Cinémathèque Française, and Eye Filmmuseum.',
      },
      {
        name: 'Library of Congress & Internet Archive',
        url: 'https://archive.org',
        jurisdiction: 'United States of America',
        notes: 'National Film Registry preservation holdings.',
      },
    ],
    films: SURFACED_PUBLIC_DOMAIN_FILMS.map((film) => {
      const status = inMemoryStatuses[film.identifier];
      return {
        identifier: film.identifier,
        title: film.title,
        year: film.year,
        director: film.director,
        archive: film.archive,
        rights: film.rights,
        dataProvider: film.dataProvider,
        sourcePageUrl: film.sourcePageUrl,
        curatorNote: film.curatorNote,
        status: status?.status || 'IDLE',
        bytesOnDisk: status?.bytesDownloaded || 0,
        localFile: status?.localVideoPath || null,
      };
    }),
  };

  const manifestPath = path.join(vaultDir, 'attribution_manifest.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

/**
 * Create Admin Film Ingest Router
 */
export function createAdminFilmIngestRouter(deps?: {
  authenticate?: RequestHandler;
  isAdmin?: (uid: string) => Promise<boolean>;
}): Router {
  const router = Router();

  // Allow admin verification if provided, or allow dev/authenticated admin
  if (deps?.authenticate) {
    router.use(async (req: any, res, next) => {
      // In development or when requested by admin dashboard
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }
      deps.authenticate!(req, res, async () => {
        if (deps.isAdmin && !(await deps.isAdmin(req.uid))) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        next();
      });
    });
  }

  router.use(express.json());

  // GET /config
  router.get('/config', async (_req, res) => {
    try {
      const vaultDir = await getVaultDirectory();
      const diskStats = await getDiskStats(vaultDir);
      res.json({
        vaultDirectory: vaultDir,
        defaultDirectory: DEFAULT_VAULT_DIR,
        ...diskStats,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /config
  router.post('/config', async (req, res) => {
    try {
      const { directory } = req.body;
      if (!directory || typeof directory !== 'string') {
        return res.status(400).json({ error: 'Directory path is required' });
      }
      const savedDir = await setVaultDirectory(directory);
      const diskStats = await getDiskStats(savedDir);
      await syncVaultStatus(savedDir);
      res.json({
        success: true,
        vaultDirectory: savedDir,
        ...diskStats,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /status
  router.get('/status', async (_req, res) => {
    try {
      const vaultDir = await getVaultDirectory();
      const statuses = await syncVaultStatus(vaultDir);
      const diskStats = await getDiskStats(vaultDir);

      const enriched = SURFACED_PUBLIC_DOMAIN_FILMS.map((film) => {
        const stat = statuses.find((s) => s.identifier === film.identifier);
        return {
          ...film,
          jobStatus: stat || {
            identifier: film.identifier,
            status: 'IDLE',
            bytesDownloaded: 0,
            totalBytes: film.estimatedSizeBytes,
            progressPercent: 0,
            speedFormatted: '0 KB/s',
            etaFormatted: '--:--',
            lastUpdated: Date.now(),
          },
        };
      });

      res.json({
        vaultDirectory: vaultDir,
        disk: diskStats,
        films: enriched,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /download
  router.post('/download', async (req, res) => {
    try {
      const { identifier } = req.body;
      if (!identifier) return res.status(400).json({ error: 'Identifier is required' });
      const job = await startOrResumeDownload(identifier);
      res.json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /pause
  router.post('/pause', (req, res) => {
    try {
      const { identifier } = req.body;
      if (!identifier) return res.status(400).json({ error: 'Identifier is required' });
      const job = pauseDownload(identifier);
      res.json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /download-all
  router.post('/download-all', async (_req, res) => {
    try {
      const vaultDir = await getVaultDirectory();
      const statuses = await syncVaultStatus(vaultDir);
      const started: string[] = [];

      for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
        if (film.sourceIssue) continue;
        const stat = statuses.find((s) => s.identifier === film.identifier);
        if (!stat || (stat.status !== 'COMPLETED' && stat.status !== 'DOWNLOADING')) {
          await startOrResumeDownload(film.identifier);
          started.push(film.identifier);
        }
      }

      res.json({ success: true, queued: started });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /pause-all
  router.post('/pause-all', (_req, res) => {
    try {
      const paused: string[] = [];
      for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
        pauseDownload(film.identifier);
        paused.push(film.identifier);
      }
      res.json({ success: true, paused });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /generate-manifest
  router.post('/generate-manifest', async (_req, res) => {
    try {
      const manifestPath = await generateAttributionManifest();
      res.json({ success: true, manifestPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /stream/:identifier (Resumable HTTP 206 Range video streaming directly from disk)
  router.get('/stream/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      const vaultDir = await getVaultDirectory();
      const filmDir = path.join(vaultDir, identifier);
      const videoPath = path.join(filmDir, 'video.mp4');

      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Film has not been downloaded to the vault yet' });
      }

      const stat = await fsp.stat(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
          res.status(416).send(`Requested range not satisfiable\n${start} >= ${fileSize}`);
          return;
        }

        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };

        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
