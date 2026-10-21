import express, { Router, type RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { SELF_HOSTED_FILMS, getSelfHostedFilm, registerSelfHostedFilm } from '../services/selfHostedFilms';
import { ARCHIVE_FILM_ITEMS, resolveArchiveFilm, resolveAnyArchiveItem, explainYoutubeError } from '../services/filmIngestSources';
import { fsGet, fsSet, fsPatch } from '../services/firebaseAdminRest';
import { getDirectorProfile } from '../data/classicDirectors';
import { getHalloweenStoryIntelBundle, getCharactersForFilm, getSyntheticAnalysisJob } from '../data/halloweenStoryIntel';
import {
  CURATED_HALLOWEEN_FILMS,
  CURATED_INTERNATIONAL_FILMS,
  CURATED_US_CLASSIC_FILMS,
  CURATED_DIRECTOR_VAULT_FILMS,
  CURATED_ANIME_AND_ANIMATION_FILMS,
  CURATED_PUBLIC_DOMAIN_TV_SERIES,
  CURATED_STUDIO_CLASSICS,
  CURATED_CLASSIC_DOCUMENTARIES,
} from '../services/archiveContentService';

export interface FilmVaultItem {
  identifier: string;
  title: string;
  year: string;
  director: string;
  archive: 'KOFA' | 'EUROPEANA' | 'INTERNET_ARCHIVE' | 'LIBRARY_OF_CONGRESS';
  rights: string;
  runtime: string;
  genre: string;
  subType?: 'MOVIE' | 'TV_SERIES';
  country?: string;
  language?: string;
  movement?: string;
  historicalContext?: string;
  restorationInfo?: string;
  seasons?: Array<{
    id: string;
    number: number;
    title?: string;
    episodes: Array<{
      id: string;
      number: number;
      title: string;
      description?: string;
      duration?: number;
      videoUrl?: string;
      thumbnailUrl?: string;
    }>;
  }>;
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
  muxAssetId?: string;
  muxPlaybackId?: string;
  muxStatus?: 'NONE' | 'INGESTING' | 'READY' | 'ERROR';
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
  // ── Taleo Curated Halloween & Public Domain Showcase ────────────────────────
  {
    identifier: 'Night.Of.The.Living.Dead_1080p',
    title: 'Night of the Living Dead (1080p Restoration)',
    year: '1968',
    director: 'George A. Romero',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '96 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/Night.Of.The.Living.Dead_1080p',
    description: 'George A. Romero’s revolutionary 1968 survival-horror milestone. Seven strangers barricaded inside an isolated Pennsylvania farmhouse fight through the night against a rising legion of the reanimated dead.',
    curatorNote: 'Single-handedly invented the modern zombie film and shattered classical Hollywood comfort by casting Duane Jones as a decisive, unsentimental lead.',
    dataProvider: 'Internet Archive / Image Ten',
    sourcePageUrl: 'https://archive.org/details/Night.Of.The.Living.Dead_1080p',
    estimatedSizeBytes: 1600 * 1024 * 1024,
  },
  {
    identifier: 'house_on_haunted_hill_ipod',
    title: 'House on Haunted Hill',
    year: '1959',
    director: 'William Castle',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '75 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/house_on_haunted_hill_ipod',
    description: 'Eccentric millionaire Frederick Loren (Vincent Price) invites five strangers to lock themselves inside a notoriously haunted mansion overnight for $10,000 each — if they survive until dawn.',
    curatorNote: 'Vincent Price is at his sardonic, velvety peak. Master showman William Castle originally exhibited the film with "Emergo".',
    dataProvider: 'Internet Archive / Allied Artists',
    sourcePageUrl: 'https://archive.org/details/house_on_haunted_hill_ipod',
    estimatedSizeBytes: 600 * 1024 * 1024,
  },
  {
    identifier: 'CarnivalofSouls',
    title: 'Carnival of Souls',
    year: '1962',
    director: 'Herk Harvey',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '83 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/CarnivalofSouls',
    description: 'After surviving a drag-race plunge off a bridge, a young church organist (Candace Hilligoss) relocates to Utah, where she is inexorably drawn toward a spectral, abandoned lakeside pavilion.',
    curatorNote: 'Filmed on a $33,000 budget by industrial-film director Herk Harvey, its eerie pipe-organ score by Gene Moore directly inspired David Lynch and George Romero.',
    dataProvider: 'Internet Archive / Harcourt Productions',
    sourcePageUrl: 'https://archive.org/details/CarnivalofSouls',
    estimatedSizeBytes: 700 * 1024 * 1024,
  },
  {
    identifier: 'ThePhantomoftheOpera',
    title: 'The Phantom of the Opera',
    year: '1925',
    director: 'Rupert Julian',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '106 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/ThePhantomoftheOpera',
    description: 'Deep beneath the Paris Opera House, a disfigured musical genius (Lon Chaney, "The Man of a Thousand Faces") haunts the catacombs to propel soprano Christine Daaé to stardom.',
    curatorNote: 'Lon Chaney designed and applied his own skull-like Phantom makeup in total secrecy; the unmasking scene caused 1925 premiere audiences to gasp.',
    dataProvider: 'Internet Archive / Universal Pictures',
    sourcePageUrl: 'https://archive.org/details/ThePhantomoftheOpera',
    estimatedSizeBytes: 800 * 1024 * 1024,
  },
  {
    identifier: 'Haxan_tinted_and_subtitled',
    title: 'Häxan: Witchcraft Through the Ages',
    year: '1922',
    director: 'Benjamin Christensen',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '105 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/Haxan_tinted_and_subtitled',
    description: 'Benjamin Christensen’s audacious 1922 silent visual essay and occult fantasia tracing superstition, medieval demonology, and witch trials from antiquity to modern psychology.',
    curatorNote: 'The most expensive Scandinavian silent film ever produced. Blends woodcut illustrations, tabletop stop-motion demons, and Bosch-like nocturnal sabbath tableaux.',
    dataProvider: 'Internet Archive / Svensk Filmindustri',
    sourcePageUrl: 'https://archive.org/details/Haxan_tinted_and_subtitled',
    estimatedSizeBytes: 900 * 1024 * 1024,
  },
  {
    identifier: 'Horror_Express',
    title: 'Horror Express',
    year: '1972',
    director: 'Eugenio Martín',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '87 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/Horror_Express',
    description: 'Aboard the Trans-Siberian Express in 1906, rival British anthropologists (Christopher Lee and Peter Cushing) discover that a frozen prehistoric hominid in the baggage car is awake — and absorbing passengers’ minds.',
    curatorNote: 'Unites horror royalty Christopher Lee and Peter Cushing with a scene-stealing Telly Savalas as a wild Cossack officer.',
    dataProvider: 'Internet Archive / Granada Films',
    sourcePageUrl: 'https://archive.org/details/Horror_Express',
    estimatedSizeBytes: 950 * 1024 * 1024,
  },
  {
    identifier: 'white_zombie',
    title: 'White Zombie',
    year: '1932',
    director: 'Victor Halperin',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '67 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/white_zombie',
    description: 'In Haiti, a young couple’s wedding is sabotaged by sinister voodoo master "Murder" Legendre (Bela Lugosi), who commands a sugar mill staffed entirely by the soulless undead.',
    curatorNote: 'Cinema’s very first feature-length zombie film. Bela Lugosi’s hypnotic stare and Jack Pierce’s makeup design create an intoxicating Pre-Code fairy-tale nightmare.',
    dataProvider: 'Internet Archive / United Artists',
    sourcePageUrl: 'https://archive.org/details/white_zombie',
    estimatedSizeBytes: 650 * 1024 * 1024,
  },
  {
    identifier: 'TheTerror1963',
    title: 'The Terror',
    year: '1963',
    director: 'Roger Corman',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '79 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/TheTerror1963',
    description: 'In 1806 Baltic coastal France, a lost Napoleonic cavalry officer (Jack Nicholson) follows a mysterious woman into the sea-battered castle of a grieving Baron (Boris Karloff).',
    curatorNote: 'Legendarily conceived by Roger Corman over a weekend using standing castle sets from The Raven; second-unit sequences were directed by a young Francis Ford Coppola.',
    dataProvider: 'Internet Archive / American International Pictures',
    sourcePageUrl: 'https://archive.org/details/TheTerror1963',
    estimatedSizeBytes: 750 * 1024 * 1024,
  },
  {
    identifier: 'TheGhoul',
    title: 'The Ghoul',
    year: '1933',
    director: 'T. Hayes Hunter',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '68 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/TheGhoul',
    description: 'Egyptologist Professor Morlant (Boris Karloff) is buried with an ancient jewel promised to grant eternal life — only to rise from his tomb when grave robbers steal the stone.',
    curatorNote: 'Boris Karloff’s celebrated return to England after his Hollywood triumph in Frankenstein and The Mummy, photographed by Günther Krampf.',
    dataProvider: 'Internet Archive / Gaumont-British',
    sourcePageUrl: 'https://archive.org/details/TheGhoul',
    estimatedSizeBytes: 600 * 1024 * 1024,
  },
  {
    identifier: 'FrankensteinfullMovie',
    title: 'Frankenstein (1910 Edison Film)',
    year: '1910',
    director: 'J. Searle Dawley',
    archive: 'INTERNET_ARCHIVE',
    rights: 'Public Domain',
    runtime: '14 min',
    genre: 'Horror',
    thumbnailUrl: 'https://archive.org/services/img/FrankensteinfullMovie',
    description: 'Cinema’s first-ever adaptation of Mary Shelley’s Frankenstein, produced by Thomas Edison’s studio and featuring Charles Ogle as the Creature.',
    curatorNote: 'The famous cauldron creation scene was achieved by burning a dummy in a furnace and running the film negative in reverse.',
    dataProvider: 'Internet Archive / Edison Manufacturing Co.',
    sourcePageUrl: 'https://archive.org/details/FrankensteinfullMovie',
    estimatedSizeBytes: 120 * 1024 * 1024,
  },
];

// Merge all curated Halloween, International Cinema, US Classics, Director Vault, Classic Anime/Animation, and Public Domain TV Series into SURFACED_PUBLIC_DOMAIN_FILMS
const EXPANDED_CURATED_POOL = [
  ...CURATED_HALLOWEEN_FILMS,
  ...CURATED_INTERNATIONAL_FILMS,
  ...CURATED_US_CLASSIC_FILMS,
  ...CURATED_DIRECTOR_VAULT_FILMS,
  ...CURATED_ANIME_AND_ANIMATION_FILMS,
  ...CURATED_PUBLIC_DOMAIN_TV_SERIES,
  ...CURATED_STUDIO_CLASSICS,
  ...CURATED_CLASSIC_DOCUMENTARIES,
];

const VERIFIED_CURATED_BY_ID = new Map(
  EXPANDED_CURATED_POOL.map((c) => [c.identifier, c])
);

for (const c of EXPANDED_CURATED_POOL) {
  const existing = SURFACED_PUBLIC_DOMAIN_FILMS.find(item => item.identifier === c.identifier);
  const archiveItem = ARCHIVE_FILM_ITEMS[c.identifier] || c.identifier;
  const isDirectArchiveMp4 = Boolean(c.videoUrl && /^https:\/\/archive\.org\/download\//i.test(c.videoUrl));
  if (!existing) {
    SURFACED_PUBLIC_DOMAIN_FILMS.push({
      identifier: c.identifier,
      title: c.title,
      year: c.year || 'Classic',
      director: c.director || 'Public Domain Cinema',
      archive: (c.source === 'KOFA' || c.source === 'EUROPEANA' || c.source === 'LIBRARY_OF_CONGRESS') ? c.source : 'INTERNET_ARCHIVE',
      rights: c.rights || 'Public Domain',
      runtime: c.runtime || 'Feature',
      genre: c.genre || 'Classic Cinema',
      subType: c.subType || (c.seasons?.length ? 'TV_SERIES' : 'MOVIE'),
      country: c.country,
      language: c.language,
      movement: c.movement,
      historicalContext: c.historicalContext,
      restorationInfo: c.restorationInfo,
      seasons: c.seasons,
      directDownloadUrl: isDirectArchiveMp4 ? c.videoUrl : undefined,
      thumbnailUrl: c.thumbnailUrl || `https://archive.org/services/img/${archiveItem}`,
      description: c.description,
      curatorNote: c.curatorNote || 'Preserved in the Plajah Taleo Public Domain Vault.',
      dataProvider: c.dataProvider || 'Internet Archive',
      sourcePageUrl: c.sourceUrl || `https://archive.org/details/${archiveItem}`,
      estimatedSizeBytes: 900 * 1024 * 1024,
    });
  } else {
    if (isDirectArchiveMp4) existing.directDownloadUrl = c.videoUrl;
    if (c.seasons?.length) existing.seasons = c.seasons;
    if (c.subType) existing.subType = c.subType;
    if (c.country) existing.country = c.country;
    if (c.language) existing.language = c.language;
    if (c.movement) existing.movement = c.movement;
    if (c.historicalContext) existing.historicalContext = c.historicalContext;
    if (c.restorationInfo) existing.restorationInfo = c.restorationInfo;
  }
}

// Preserve stable app identifiers, but display the actual hosting source.
for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
  const item = ARCHIVE_FILM_ITEMS[film.identifier];
  const verifiedCurated = VERIFIED_CURATED_BY_ID.get(film.identifier);
  const verifiedDirectUrl =
    verifiedCurated?.videoUrl && /^https:\/\/archive\.org\/download\//i.test(verifiedCurated.videoUrl)
      ? verifiedCurated.videoUrl
      : undefined;
  if (item) {
    film.archive = 'INTERNET_ARCHIVE';
    film.dataProvider = film.dataProvider || 'Internet Archive';
    film.sourcePageUrl = `https://archive.org/details/${item}`;
    film.thumbnailUrl = `https://archive.org/services/img/${item}`;
    if (verifiedDirectUrl) {
      film.directDownloadUrl = verifiedDirectUrl;
    } else {
      delete film.directDownloadUrl; // File names are resolved from metadata at download time.
    }
    delete film.youtubeUrl; // Never silently substitute a different uploader/version.
    delete film.sourceIssue;
  } else if (film.identifier === 'kofa-madame-freedom-1956') {
    film.youtubeUrl = 'https://www.youtube.com/watch?v=V7MBFaVxyBc';
    film.thumbnailUrl = 'https://img.youtube.com/vi/V7MBFaVxyBc/hqdefault.jpg';
    film.sourcePageUrl = film.youtubeUrl;
  } else if (film.youtubeUrl) {
    film.sourcePageUrl = film.youtubeUrl;
  }
}

interface FilmIngestConfig {
  vaultDirectory: string;
}

const CONFIG_FILE_PATH = path.resolve(process.cwd(), 'config', 'film_vault_config.json');
const DEFAULT_VAULT_DIR = fs.existsSync('D:\\')
  ? path.resolve('D:\\plajah-media\\films')
  : path.resolve(process.cwd(), 'vault', 'films');

// Active download child processes and HTTP streams by film identifier
const activeProcesses: Record<string, ChildProcess> = {};
const activeHttpRequests: Record<string, http.ClientRequest> = {};
const inMemoryStatuses: Record<string, IngestJobStatus> = {};
const resolvedArchiveUrlCache: Record<string, { url: string; size: number; exp: number }> = {};
const activeMuxIngests = new Set<string>();

/**
 * Dynamically register or update a public-domain film in the vault catalog
 * so any movie opened in Taleo is automatically brought onto the platform and ingested into Mux.
 */
export function ensureFilmCatalogEntry(input: {
  identifier: string;
  title?: string;
  description?: string;
  director?: string;
  year?: string | number;
  runtime?: string;
  genre?: string;
  subType?: 'MOVIE' | 'TV_SERIES';
  seasons?: any[];
  country?: string;
  language?: string;
  thumbnailUrl?: string;
  source?: string;
  videoUrl?: string;
  sourceUrl?: string;
  rights?: string;
  curatorNote?: string;
}): FilmVaultItem {
  const cleanId = String(input.identifier || '').replace(/^public_domain_/, '').trim();
  let existing = SURFACED_PUBLIC_DOMAIN_FILMS.find(f => f.identifier === cleanId);
  if (existing) {
    if (input.seasons?.length && !existing.seasons?.length) existing.seasons = input.seasons;
    if (input.subType && !existing.subType) existing.subType = input.subType;
    return existing;
  }

  const archiveItem = ARCHIVE_FILM_ITEMS[cleanId] || cleanId;
  const rawSource = String(input.source || 'INTERNET_ARCHIVE').toUpperCase();
  const archive = (['KOFA', 'EUROPEANA', 'INTERNET_ARCHIVE', 'LIBRARY_OF_CONGRESS'].includes(rawSource)
    ? rawSource
    : 'INTERNET_ARCHIVE') as FilmVaultItem['archive'];
  const isYoutube = input.videoUrl && /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(input.videoUrl);

  const created: FilmVaultItem = {
    identifier: cleanId,
    title: input.title || cleanId,
    year: String(input.year || '').slice(0, 4) || 'Classic',
    director: input.director || 'Public Domain Cinema',
    archive,
    rights: input.rights || 'Public Domain',
    runtime: input.runtime || 'Feature',
    genre: input.genre || 'Classic Cinema',
    subType: input.subType || (input.seasons?.length ? 'TV_SERIES' : 'MOVIE'),
    seasons: input.seasons,
    country: input.country,
    language: input.language,
    youtubeUrl: isYoutube ? input.videoUrl : undefined,
    directDownloadUrl: !isYoutube && input.videoUrl ? input.videoUrl : undefined,
    thumbnailUrl: input.thumbnailUrl || `https://archive.org/services/img/${archiveItem}`,
    description: input.description || 'Preserved public domain motion picture.',
    curatorNote: input.curatorNote || 'Preserved in the Plajah Taleo Public Domain Vault.',
    dataProvider: archive === 'KOFA' ? 'Korean Film Archive (KOFA)' : archive === 'EUROPEANA' ? 'Europeana Film Heritage' : 'Internet Archive',
    sourcePageUrl: input.sourceUrl || `https://archive.org/details/${archiveItem}`,
    estimatedSizeBytes: 800 * 1024 * 1024,
  };
  SURFACED_PUBLIC_DOMAIN_FILMS.push(created);
  return created;
}

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
 * Inspect local directory for existing .mp4, .mp4.part, or mux.json files and sync in-memory status
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
    const muxFile = path.join(filmDir, 'mux.json');

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
        muxStatus: 'NONE',
        lastUpdated: Date.now(),
      };
      inMemoryStatuses[film.identifier] = current;
    }

    // Load persisted Mux sidecar if present
    if (!current.muxPlaybackId && fs.existsSync(muxFile)) {
      try {
        const muxMeta = JSON.parse(await fsp.readFile(muxFile, 'utf8'));
        if (muxMeta?.muxPlaybackId) {
          current.muxPlaybackId = muxMeta.muxPlaybackId;
          current.muxAssetId = muxMeta.muxAssetId;
          current.muxStatus = 'READY';
        } else if (muxMeta?.muxAssetId) {
          current.muxAssetId = muxMeta.muxAssetId;
          current.muxStatus = muxMeta.status || 'INGESTING';
        }
      } catch {}
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
      registerSelfHostedFilm({
        identifier: film.identifier,
        videoUrl: current.muxPlaybackId
          ? `https://stream.mux.com/${current.muxPlaybackId}.m3u8`
          : `/api/admin/film-ingest/stream/${encodeURIComponent(film.identifier)}`,
        muxPlaybackId: current.muxPlaybackId,
        muxAssetId: current.muxAssetId,
        thumbnailUrl: film.thumbnailUrl,
        sourceType: current.muxPlaybackId ? 'MUX' : 'LOCAL_VAULT',
        isAvailable: true,
        sizeBytes: s.size,
      });
    } else if (current.muxPlaybackId) {
      registerSelfHostedFilm({
        identifier: film.identifier,
        videoUrl: `https://stream.mux.com/${current.muxPlaybackId}.m3u8`,
        muxPlaybackId: current.muxPlaybackId,
        muxAssetId: current.muxAssetId,
        thumbnailUrl: film.thumbnailUrl,
        sourceType: 'MUX',
        isAvailable: true,
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
 * Persist or update a public-domain film in platform Firestore (`albums` & `videos`)
 * so it behaves identically to a natively uploaded movie on Plajah/Taleo.
 */
export async function syncFilmToPlatformFirestore(
  film: FilmVaultItem,
  opts: {
    videoUrl?: string;
    muxPlaybackId?: string;
    muxAssetId?: string;
    durationSec?: number;
  } = {}
): Promise<void> {
  try {
    const cleanId = film.identifier.replace(/^public_domain_/, '');
    const docId = `public_domain_${cleanId}`;
    const muxPlaybackId = opts.muxPlaybackId || inMemoryStatuses[cleanId]?.muxPlaybackId || getSelfHostedFilm(cleanId)?.muxPlaybackId;
    const muxAssetId = opts.muxAssetId || inMemoryStatuses[cleanId]?.muxAssetId || getSelfHostedFilm(cleanId)?.muxAssetId;
    const hlsUrl = muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}.m3u8` : undefined;
    const proxyStreamUrl = `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`;
    const streamUrl =
      hlsUrl ||
      opts.videoUrl ||
      getSelfHostedFilm(cleanId)?.videoUrl ||
      film.directDownloadUrl ||
      proxyStreamUrl;

    const runtimeMatch = String(film.runtime || '').match(/(\d+)/);
    const durationSec = opts.durationSec || (runtimeMatch ? parseInt(runtimeMatch[1], 10) * 60 : 5400);

    const trackPayload: Record<string, any> = {
      id: `${docId}_full`,
      title: film.title,
      artist: film.director,
      duration: durationSec,
      url: streamUrl,
      videoUrl: streamUrl,
      audioUrl: streamUrl,
      proxyStreamUrl,
      mediaKind: 'VIDEO',
      streamSource: muxPlaybackId ? 'MUX' : 'DIRECT_FILE',
      ...(muxPlaybackId ? { muxPlaybackId } : {}),
      ...(muxAssetId ? { muxAssetId } : {}),
    };

    const hasSeasons = Array.isArray(film.seasons) && film.seasons.length > 0;
    const episodeTracks: Record<string, any>[] = hasSeasons
      ? film.seasons!.flatMap((s) =>
          (s.episodes || []).map((ep, idx) => ({
            id: ep.id || `${docId}_s${s.number}_e${ep.number || idx + 1}`,
            title: `S${s.number}E${ep.number || idx + 1} · ${ep.title}`,
            artist: film.director,
            duration: ep.duration || 1560,
            trackNumber: ep.number || idx + 1,
            url: ep.videoUrl || streamUrl,
            videoUrl: ep.videoUrl || streamUrl,
            audioUrl: ep.videoUrl || streamUrl,
            proxyStreamUrl,
            thumbnailUrl: ep.thumbnailUrl || film.thumbnailUrl,
            mediaKind: 'VIDEO',
            isGlobalArchive: true,
          }))
        )
      : [];

    const existingAlbum = await fsGet('albums', docId).catch(() => null);
    const nowIso = new Date().toISOString();

    const directorProfile = getDirectorProfile(film.director, cleanId);
    const storyBundle = getHalloweenStoryIntelBundle(cleanId);
    const filmCharacters = getCharactersForFilm(cleanId);

    const albumPayload: Record<string, any> = {
      ...(existingAlbum || {}),
      id: docId,
      archiveIdentifier: cleanId,
      title: film.title,
      artist: film.director,
      artistId: 'public_domain_archive',
      type: 'VIDEO',
      subType: film.subType || (hasSeasons ? 'TV_SERIES' : 'MOVIE'),
      genre: film.genre || 'Classic Cinema',
      country: film.country,
      language: film.language,
      movement: film.movement,
      historicalContext: film.historicalContext,
      restorationInfo: film.restorationInfo,
      ...(hasSeasons ? { seasons: film.seasons } : {}),
      coverUrl: film.thumbnailUrl,
      thumbnailUrl: film.thumbnailUrl,
      releaseDate: `${film.year}-01-01`,
      releaseYear: parseInt(film.year, 10) || 1950,
      description: film.description,
      curatorNote: film.curatorNote,
      dataProvider: film.dataProvider,
      source: film.archive,
      sourceUrl: film.sourcePageUrl,
      isPublicDomain: true,
      price: 0,
      tracks: episodeTracks.length > 0 ? episodeTracks : [trackPayload],
      videoUrl: streamUrl,
      proxyStreamUrl,
      streamSource: muxPlaybackId ? 'MUX' : 'DIRECT_FILE',
      ...(muxPlaybackId ? { muxPlaybackId } : {}),
      ...(muxAssetId ? { muxAssetId } : {}),
      ...(directorProfile ? { directorProfile } : {}),
      ...(filmCharacters.length > 0
        ? {
            charactersWithActors: filmCharacters,
            characters: filmCharacters.map((c) => ({
              id: c.id,
              name: c.characterName,
              role: c.archetype,
              bio: `${c.characterBio} Portrayed by ${c.actor.name} (${c.actor.yearsLived}).`,
              imageUrl: c.actor.portraitUrl,
              actorName: c.actor.name,
            })),
          }
        : {}),
      movieMetadata: {
        ...(existingAlbum?.movieMetadata || {}),
        director: film.director,
        releaseYear: parseInt(film.year, 10) || 1950,
        castMembers: filmCharacters.map((c) => `${c.actor.name} (${c.characterName})`),
        synopsis: storyBundle?.report?.synopsis || film.description,
        logline: storyBundle?.report?.logline || film.curatorNote,
      },
      filmDistribution: {
        allowInFastChannel: true,
        editorialFeatured: true,
        accessModel: 'AVOD',
        ...(existingAlbum?.filmDistribution || {}),
      },
      updatedAt: nowIso,
      ...(existingAlbum?.createdAt ? {} : { createdAt: nowIso, syncedAt: nowIso }),
    };

    await fsSet('albums', docId, albumPayload);

    const existingVideo = await fsGet('videos', docId).catch(() => null);
    const videoPayload: Record<string, any> = {
      ...(existingVideo || {}),
      id: docId,
      archiveIdentifier: cleanId,
      title: film.title,
      creatorName: film.director,
      creatorId: 'public_domain_archive',
      description: film.description,
      genre: film.genre || 'Classic Cinema',
      category: 'Classic Cinema',
      thumbnailUrl: film.thumbnailUrl,
      videoUrl: streamUrl,
      proxyStreamUrl,
      duration: durationSec,
      durationFormatted: film.runtime || 'Feature',
      isPublicDomain: true,
      visibility: 'PUBLIC',
      status: muxPlaybackId ? 'READY' : (existingVideo?.status || 'READY'),
      streamSource: muxPlaybackId ? 'MUX' : 'DIRECT_FILE',
      allowInFastChannel: true,
      ...(muxPlaybackId ? { muxPlaybackId } : {}),
      ...(muxAssetId ? { muxAssetId } : {}),
      ...(directorProfile ? { directorProfile } : {}),
      ...(filmCharacters.length > 0 ? { charactersWithActors: filmCharacters } : {}),
      updatedAt: nowIso,
      ...(existingVideo?.createdAt ? {} : { createdAt: nowIso }),
    };

    await fsSet('videos', docId, videoPayload);

    // Sync Story Intelligence analysis job (`taleoAnalysis`) to Firestore if available
    const synthJobForClean = getSyntheticAnalysisJob(cleanId);
    const synthJobForDoc = getSyntheticAnalysisJob(docId);
    if (synthJobForClean && storyBundle) {
      await fsSet('taleoAnalysis', cleanId, {
        ...synthJobForClean,
        storyReportInline: storyBundle.report,
        charactersWithActors: storyBundle.characters,
        updatedAt: nowIso,
      }).catch(() => {});
    }
    if (synthJobForDoc && storyBundle) {
      await fsSet('taleoAnalysis', docId, {
        ...synthJobForDoc,
        storyReportInline: storyBundle.report,
        charactersWithActors: storyBundle.characters,
        updatedAt: nowIso,
      }).catch(() => {});
    }

    // Also patch unprefixed doc if one exists in albums/videos
    const rawAlbum = await fsGet('albums', cleanId).catch(() => null);
    if (rawAlbum) {
      await fsPatch('albums', cleanId, {
        videoUrl: streamUrl,
        tracks: [trackPayload],
        ...(muxPlaybackId ? { muxPlaybackId } : {}),
        ...(muxAssetId ? { muxAssetId } : {}),
        ...(directorProfile ? { directorProfile } : {}),
        ...(filmCharacters.length > 0 ? { charactersWithActors: filmCharacters } : {}),
        updatedAt: nowIso,
      }).catch(() => {});
    }
    const rawVideo = await fsGet('videos', cleanId).catch(() => null);
    if (rawVideo) {
      await fsPatch('videos', cleanId, {
        videoUrl: streamUrl,
        ...(muxPlaybackId ? { muxPlaybackId, status: 'READY' } : {}),
        ...(muxAssetId ? { muxAssetId } : {}),
        updatedAt: nowIso,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn(`[PublicDomainFirestore] Could not sync ${film.identifier} to Firestore:`, (err as any)?.message || err);
  }
}

/**
 * Pass a public-domain film through Mux just like a natively uploaded movie.
 * Supports both direct URL pull (`mux.video.assets.create`) and local vault file upload (`mux.video.uploads.create`).
 */
export async function ingestFilmIntoMux(
  film: FilmVaultItem,
  directMp4Url?: string
): Promise<{ muxAssetId?: string; muxPlaybackId?: string } | null> {
  const cleanId = film.identifier.replace(/^public_domain_/, '');
  const vaultDir = await getVaultDirectory();
  const filmDir = path.join(vaultDir, cleanId);
  const muxFile = path.join(filmDir, 'mux.json');

  await fsp.mkdir(filmDir, { recursive: true });

  // 1. Check local mux.json cache first
  if (fs.existsSync(muxFile)) {
    try {
      const existing = JSON.parse(await fsp.readFile(muxFile, 'utf8'));
      if (existing?.muxPlaybackId) {
        registerSelfHostedFilm({
          identifier: cleanId,
          videoUrl: `https://stream.mux.com/${existing.muxPlaybackId}.m3u8`,
          muxPlaybackId: existing.muxPlaybackId,
          muxAssetId: existing.muxAssetId,
          thumbnailUrl: film.thumbnailUrl,
          sourceType: 'MUX',
          isAvailable: true,
        });
        return existing;
      }
    } catch {}
  }

  // 2. Check Firestore to see if this film already has a muxPlaybackId
  try {
    const existingDoc = await fsGet('videos', `public_domain_${cleanId}`);
    if (existingDoc?.muxPlaybackId) {
      const meta = {
        muxAssetId: existingDoc.muxAssetId || '',
        muxPlaybackId: existingDoc.muxPlaybackId,
        status: 'READY',
        updatedAt: new Date().toISOString(),
      };
      await fsp.writeFile(muxFile, JSON.stringify(meta, null, 2), 'utf8');
      registerSelfHostedFilm({
        identifier: cleanId,
        videoUrl: `https://stream.mux.com/${existingDoc.muxPlaybackId}.m3u8`,
        muxPlaybackId: existingDoc.muxPlaybackId,
        muxAssetId: existingDoc.muxAssetId,
        thumbnailUrl: film.thumbnailUrl,
        sourceType: 'MUX',
        isAvailable: true,
      });
      return meta;
    }
  } catch {}

  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    return null;
  }

  if (activeMuxIngests.has(cleanId)) {
    return null;
  }
  activeMuxIngests.add(cleanId);

  try {
    const MuxModule = await import('@mux/mux-node');
    const MuxClass = (MuxModule as any).default || MuxModule;
    const mux = new MuxClass({ tokenId, tokenSecret });

    const status = inMemoryStatuses[cleanId];
    if (status) status.muxStatus = 'INGESTING';

    let assetId: string | undefined;
    let playbackId: string | undefined;

    if (directMp4Url && /^https?:\/\//i.test(directMp4Url)) {
      // Pull directly from verified archive MP4 URL into Mux
      const asset = await mux.video.assets.create({
        inputs: [{ url: directMp4Url }],
        playback_policy: ['public'],
        encoding_tier: 'smart',
        max_resolution_tier: '2160p',
        mp4_support: 'standard',
        normalize_audio: true,
        passthrough: `public_domain:${cleanId}`,
      });
      assetId = asset.id;
      playbackId = asset.playback_ids?.[0]?.id;
    } else {
      // Upload completed local vault file (`video.mp4`) directly to Mux
      const localVideoPath = path.join(filmDir, 'video.mp4');
      if (!fs.existsSync(localVideoPath)) {
        return null;
      }
      const upload = await mux.video.uploads.create({
        new_asset_settings: {
          playback_policy: ['public'],
          encoding_tier: 'smart',
          max_resolution_tier: '2160p',
          mp4_support: 'standard',
          normalize_audio: true,
          passthrough: `public_domain:${cleanId}`,
        },
        cors_origin: '*',
      });

      const fileStat = await fsp.stat(localVideoPath);
      const fileStream = fs.createReadStream(localVideoPath);
      const putRes = await fetch(upload.url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(fileStat.size),
        },
        body: fileStream as any,
        // @ts-ignore Node fetch duplex stream support
        duplex: 'half',
      });
      if (!putRes.ok) {
        throw new Error(`Mux direct upload PUT failed with HTTP ${putRes.status}`);
      }

      // Poll upload briefly for asset creation
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const check = await mux.video.uploads.retrieve(upload.id);
        if (check.asset_id) {
          assetId = check.asset_id;
          const asset = await mux.video.assets.retrieve(assetId);
          playbackId = asset.playback_ids?.[0]?.id;
          break;
        }
      }
    }

    // If assetId exists, poll briefly if playbackId wasn't immediately attached
    if (assetId && !playbackId) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const asset = await mux.video.assets.retrieve(assetId);
        playbackId = asset.playback_ids?.[0]?.id;
        if (playbackId) break;
      }
    }

    if (assetId || playbackId) {
      const muxMeta = {
        muxAssetId: assetId,
        muxPlaybackId: playbackId,
        status: playbackId ? 'READY' : 'INGESTING',
        updatedAt: new Date().toISOString(),
      };
      await fsp.writeFile(muxFile, JSON.stringify(muxMeta, null, 2), 'utf8');

      if (status) {
        status.muxAssetId = assetId;
        status.muxPlaybackId = playbackId;
        status.muxStatus = playbackId ? 'READY' : 'INGESTING';
      }

      if (playbackId) {
        registerSelfHostedFilm({
          identifier: cleanId,
          videoUrl: `https://stream.mux.com/${playbackId}.m3u8`,
          muxPlaybackId: playbackId,
          muxAssetId: assetId,
          thumbnailUrl: film.thumbnailUrl,
          sourceType: 'MUX',
          isAvailable: true,
        });
      }

      await syncFilmToPlatformFirestore(film, {
        muxAssetId: assetId,
        muxPlaybackId: playbackId,
      });

      return { muxAssetId: assetId, muxPlaybackId: playbackId };
    }
    return null;
  } catch (err) {
    console.warn(`[MuxPublicDomainIngest] Failed to ingest ${cleanId} into Mux:`, (err as any)?.message || err);
    if (inMemoryStatuses[cleanId]) {
      inMemoryStatuses[cleanId].muxStatus = 'ERROR';
    }
    return null;
  } finally {
    activeMuxIngests.delete(cleanId);
  }
}

/**
 * Webhook callback handler when Mux finishes transcoding a `public_domain:<identifier>` asset
 */
export async function handleMuxAssetReadyForPublicDomain(
  assetId: string,
  playbackId: string,
  passthrough?: string,
  durationSec?: number
): Promise<boolean> {
  if (!passthrough || !passthrough.startsWith('public_domain:')) return false;
  const cleanId = passthrough.replace(/^public_domain:/, '').trim();
  if (!cleanId) return false;

  const film = ensureFilmCatalogEntry({ identifier: cleanId });
  const vaultDir = await getVaultDirectory();
  const filmDir = path.join(vaultDir, cleanId);
  await fsp.mkdir(filmDir, { recursive: true });

  const muxMeta = {
    muxAssetId: assetId,
    muxPlaybackId: playbackId,
    status: 'READY',
    durationSec,
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(path.join(filmDir, 'mux.json'), JSON.stringify(muxMeta, null, 2), 'utf8');

  if (inMemoryStatuses[cleanId]) {
    inMemoryStatuses[cleanId].muxAssetId = assetId;
    inMemoryStatuses[cleanId].muxPlaybackId = playbackId;
    inMemoryStatuses[cleanId].muxStatus = 'READY';
  }

  registerSelfHostedFilm({
    identifier: cleanId,
    videoUrl: `https://stream.mux.com/${playbackId}.m3u8`,
    muxPlaybackId: playbackId,
    muxAssetId: assetId,
    thumbnailUrl: film.thumbnailUrl,
    sourceType: 'MUX',
    isAvailable: true,
  });

  await syncFilmToPlatformFirestore(film, {
    muxAssetId: assetId,
    muxPlaybackId: playbackId,
    durationSec,
  });

  console.log(`✅ [PublicDomainMux] Asset ready for ${cleanId}: muxPlaybackId=${playbackId}`);
  return true;
}

const MAX_CONCURRENT_DOWNLOADS = 2;
const MIN_FREE_DISK_BYTES = 5 * 1024 * 1024 * 1024; // Reserve at least 5 GB free disk space on the vault drive
const pendingDownloadQueue: string[] = [];

function countActiveDownloads(): number {
  return Object.values(inMemoryStatuses).filter((s) => s.status === 'DOWNLOADING').length;
}

function drainDownloadQueue(): void {
  while (countActiveDownloads() < MAX_CONCURRENT_DOWNLOADS && pendingDownloadQueue.length > 0) {
    const nextId = pendingDownloadQueue.shift();
    if (!nextId) break;
    const st = inMemoryStatuses[nextId];
    if (st && st.status === 'COMPLETED') continue;
    startOrResumeDownload(nextId, true).catch(() => {});
  }
}

export async function enqueueVaultDownload(identifier: string): Promise<IngestJobStatus> {
  const cleanId = identifier.replace(/^public_domain_/, '');
  const film = ensureFilmCatalogEntry({ identifier: cleanId });
  if (film.sourceIssue) throw new Error(film.sourceIssue);

  if (inMemoryStatuses[cleanId]?.status === 'DOWNLOADING' || inMemoryStatuses[cleanId]?.status === 'COMPLETED') {
    return inMemoryStatuses[cleanId];
  }

  if (countActiveDownloads() < MAX_CONCURRENT_DOWNLOADS) {
    return startOrResumeDownload(cleanId, true);
  }

  if (!pendingDownloadQueue.includes(cleanId)) {
    pendingDownloadQueue.push(cleanId);
  }

  const status: IngestJobStatus = inMemoryStatuses[cleanId] || {
    identifier: cleanId,
    status: 'PAUSED',
    bytesDownloaded: 0,
    totalBytes: film.estimatedSizeBytes,
    progressPercent: 0,
    speedFormatted: 'Queued',
    etaFormatted: `Queue #${pendingDownloadQueue.indexOf(cleanId) + 1}`,
    muxStatus: 'NONE',
    lastUpdated: Date.now(),
  };
  status.status = 'PAUSED';
  status.speedFormatted = 'Queued';
  status.etaFormatted = `Queue #${pendingDownloadQueue.indexOf(cleanId) + 1}`;
  inMemoryStatuses[cleanId] = status;
  return status;
}

/**
 * Core download execution dispatcher
 */
export async function startOrResumeDownload(identifier: string, bypassQueue = false): Promise<IngestJobStatus> {
  const cleanId = identifier.replace(/^public_domain_/, '');
  const film = ensureFilmCatalogEntry({ identifier: cleanId });
  if (film.sourceIssue) throw new Error(film.sourceIssue);

  if (inMemoryStatuses[film.identifier]?.status === 'DOWNLOADING') return inMemoryStatuses[film.identifier];

  if (!bypassQueue && countActiveDownloads() >= MAX_CONCURRENT_DOWNLOADS) {
    return enqueueVaultDownload(cleanId);
  }

  const status = inMemoryStatuses[film.identifier] || {
    identifier: film.identifier,
    status: 'IDLE',
    bytesDownloaded: 0,
    totalBytes: film.estimatedSizeBytes,
    progressPercent: 0,
    speedFormatted: 'Starting...',
    etaFormatted: '--:--',
    muxStatus: 'NONE',
    lastUpdated: Date.now(),
  };
  inMemoryStatuses[film.identifier] = status;

  status.status = 'DOWNLOADING';
  status.error = undefined;
  const isPaused = () => status.status === 'PAUSED';

  const vaultDir = await getVaultDirectory();
  const filmDir = path.join(vaultDir, film.identifier);
  await fsp.mkdir(filmDir, { recursive: true });

  // Run asynchronously so caller gets immediate response
  (async () => {
    try {
      let downloadUrl: string | undefined;
      if (ARCHIVE_FILM_ITEMS[film.identifier]) {
        const resolved = await resolveArchiveFilm(film.identifier);
        downloadUrl = resolved.url;
        status.totalBytes = resolved.size;
      } else if (film.archive === 'INTERNET_ARCHIVE' || (!film.youtubeUrl && !film.directDownloadUrl)) {
        try {
          const resolved = await resolveAnyArchiveItem(film.identifier);
          downloadUrl = resolved.url;
          status.totalBytes = resolved.size;
        } catch (resolveErr) {
          if (film.directDownloadUrl) {
            downloadUrl = film.directDownloadUrl;
          } else {
            throw resolveErr;
          }
        }
      } else if (film.directDownloadUrl) {
        downloadUrl = film.directDownloadUrl;
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

      // Immediately sync metadata + direct MP4 URL to Firestore and kick off Mux URL pull in parallel
      if (downloadUrl) {
        await syncFilmToPlatformFirestore(film, { videoUrl: downloadUrl });
        ingestFilmIntoMux(film, downloadUrl).catch(() => {});
      }

      // Disk space safety guard: ensure at least MIN_FREE_DISK_BYTES remain before pulling large MP4 onto local disk
      const disk = await getDiskStats(vaultDir);
      if (disk.freeBytes > 0 && disk.freeBytes < MIN_FREE_DISK_BYTES) {
        status.status = 'PAUSED';
        status.speedFormatted = 'Disk Reserve Guard';
        status.etaFormatted = '< 5 GB Free';
        status.error = `Local disk download paused to preserve ${disk.freeGb} GB free space (streaming remains active via Mux HLS & Native Proxy).`;
        return;
      }

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

      // After local vault download finishes, ensure Mux ingestion & Firestore sync
      await ingestFilmIntoMux(film, downloadUrl);
      await syncFilmToPlatformFirestore(film, { videoUrl: downloadUrl });
    } catch (err: any) {
      if (status.status !== 'PAUSED') {
        console.error(`Download failed for ${film.identifier}:`, err);
        status.status = 'ERROR';
        status.error = err?.message || 'Download failed';
      }
    } finally {
      drainDownloadQueue();
    }
  })();

  return status;
}

/**
 * Pause active download cleanly
 */
export function pauseDownload(identifier: string): IngestJobStatus {
  const cleanId = identifier.replace(/^public_domain_/, '');
  const qIdx = pendingDownloadQueue.indexOf(cleanId);
  if (qIdx !== -1) pendingDownloadQueue.splice(qIdx, 1);

  const status = inMemoryStatuses[cleanId];
  if (status) {
    status.status = 'PAUSED';
    status.speedFormatted = 'Paused';
    status.etaFormatted = 'Paused';
  }

  if (activeProcesses[cleanId]) {
    try {
      activeProcesses[cleanId].kill('SIGTERM');
    } catch {}
    delete activeProcesses[cleanId];
  }

  if (activeHttpRequests[cleanId]) {
    try {
      activeHttpRequests[cleanId].destroy();
    } catch {}
    delete activeHttpRequests[cleanId];
  }

  return status || {
    identifier: cleanId,
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
        name: 'National Film Archive of Japan (NFAJ) & Japanese Classic Animation',
        url: 'https://animation.filmarchives.jp',
        jurisdiction: 'Japan',
        notes: 'Digitally restored 1917–1965 Japanese animated works and classic public-domain cinema.',
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
        muxPlaybackId: status?.muxPlaybackId || null,
        muxAssetId: status?.muxAssetId || null,
      };
    }),
  };

  const manifestPath = path.join(vaultDir, 'attribution_manifest.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

/**
 * Pre-stage vault directories, metadata.json, download-source.json, and attribution_manifest.json
 * for all 134 surfaced public-domain films & TV series on disk.
 */
export async function stageAllVaultCatalogMetadata(): Promise<{ stagedCount: number; manifestPath: string }> {
  const vaultDir = await getVaultDirectory();
  await fsp.mkdir(vaultDir, { recursive: true });
  let stagedCount = 0;

  for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
    try {
      const filmDir = path.join(vaultDir, film.identifier);
      await fsp.mkdir(filmDir, { recursive: true });
      const metaPath = path.join(filmDir, 'metadata.json');
      await fsp.writeFile(metaPath, JSON.stringify(film, null, 2), 'utf8');
      const sourceUrl = film.directDownloadUrl || film.youtubeUrl;
      if (sourceUrl) {
        const sourceFile = path.join(filmDir, 'download-source.json');
        if (!fs.existsSync(sourceFile)) {
          await fsp.writeFile(sourceFile, JSON.stringify({ url: sourceUrl, sourcePageUrl: film.sourcePageUrl }, null, 2), 'utf8');
        }
      }
      stagedCount++;
    } catch {}
  }

  const manifestPath = await generateAttributionManifest();
  return { stagedCount, manifestPath };
}

let backgroundSchedulerStarted = false;

/**
 * Background server-side scheduler that brings all surfaced Taleo public domain films
 * directly onto the platform (Firestore + Mux + Local Vault) sequentially without blocking startup.
 */
export function startPublicDomainAutoIngestScheduler(): void {
  if (backgroundSchedulerStarted) return;
  backgroundSchedulerStarted = true;

  setTimeout(async () => {
    try {
      const vaultDir = await getVaultDirectory();
      await stageAllVaultCatalogMetadata();
      await syncVaultStatus(vaultDir);

      for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
        if (film.sourceIssue) continue;
        try {
          const existingSelfHosted = getSelfHostedFilm(film.identifier);
          let resolvedUrl = film.directDownloadUrl;
          if (!resolvedUrl && (ARCHIVE_FILM_ITEMS[film.identifier] || film.archive === 'INTERNET_ARCHIVE')) {
            try {
              const r = await resolveAnyArchiveItem(film.identifier);
              resolvedUrl = r.url;
            } catch {}
          }

          await syncFilmToPlatformFirestore(film, {
            videoUrl: resolvedUrl,
            muxPlaybackId: existingSelfHosted?.muxPlaybackId,
            muxAssetId: existingSelfHosted?.muxAssetId,
          });

          if (!existingSelfHosted?.muxPlaybackId && resolvedUrl) {
            await ingestFilmIntoMux(film, resolvedUrl);
          }

          const stat = inMemoryStatuses[film.identifier];
          if (!stat || (stat.status !== 'COMPLETED' && stat.status !== 'DOWNLOADING')) {
            await enqueueVaultDownload(film.identifier);
          }
        } catch (e) {
          console.warn(`[AutoIngestScheduler] Error syncing ${film.identifier}:`, (e as any)?.message || e);
        }
        // Gentle pacing between Archive.org / Mux API calls
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.warn('[AutoIngestScheduler] Startup sync error:', err);
    }
  }, 8000);
}

/**
 * Stream a remote HTTP/HTTPS video URL to an Express response with full Range support,
 * redirect following, and automatic metadata self-healing if an upstream URL changes.
 */
function proxyRemoteVideoStream(
  targetUrl: string,
  req: express.Request,
  res: express.Response,
  redirects = 0,
  onNotFoundFallback?: () => Promise<string | null>
): void {
  if (redirects > 6) {
    if (!res.headersSent) res.status(502).json({ error: 'Too many redirects from archive source' });
    return;
  }
  const parsed = new URL(targetUrl);
  const client = parsed.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = {
    'User-Agent': 'PlajahUniversalPlayer/1.0',
  };
  if (req.headers.range) {
    headers['Range'] = String(req.headers.range);
  }

  const upstreamReq = client.get(targetUrl, { headers }, (upstreamRes) => {
    if (
      upstreamRes.statusCode &&
      upstreamRes.statusCode >= 300 &&
      upstreamRes.statusCode < 400 &&
      upstreamRes.headers.location
    ) {
      upstreamRes.resume();
      const nextUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
      proxyRemoteVideoStream(nextUrl, req, res, redirects + 1, onNotFoundFallback);
      return;
    }

    // Self-healing fallback: if a cached direct URL ever returns 404/403/410, re-resolve live from Archive.org metadata
    if (
      onNotFoundFallback &&
      upstreamRes.statusCode &&
      [403, 404, 410].includes(upstreamRes.statusCode)
    ) {
      upstreamRes.resume();
      onNotFoundFallback()
        .then((freshUrl) => {
          if (freshUrl && freshUrl !== targetUrl) {
            proxyRemoteVideoStream(freshUrl, req, res, 0, undefined);
          } else if (!res.headersSent) {
            res.status(upstreamRes.statusCode || 404).json({ error: 'Archive stream unavailable' });
          }
        })
        .catch(() => {
          if (!res.headersSent) res.status(404).json({ error: 'Archive stream fallback failed' });
        });
      return;
    }

    const statusCode = upstreamRes.statusCode || 200;
    const resHeaders: Record<string, string | number | string[]> = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Content-Type': upstreamRes.headers['content-type'] || 'video/mp4',
    };
    if (upstreamRes.headers['content-length']) {
      resHeaders['Content-Length'] = upstreamRes.headers['content-length'];
    }
    if (upstreamRes.headers['content-range']) {
      resHeaders['Content-Range'] = upstreamRes.headers['content-range'];
    }

    res.writeHead(statusCode, resHeaders);
    upstreamRes.pipe(res);
    req.on('close', () => {
      upstreamRes.destroy();
    });
  });

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Archive stream proxy error: ${err.message}` });
    }
  });
}

/**
 * Create Admin Film Ingest Router
 */
export function createAdminFilmIngestRouter(deps?: {
  authenticate?: RequestHandler;
  isAdmin?: (uid: string) => Promise<boolean>;
}): Router {
  const router = Router();
  router.use(express.json());

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC PLAYBACK & PLATFORM INGEST ENDPOINTS (Accessible to Universal Player)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /catalog-playback — Returns all self-hosted & Mux-ingested public domain films
  router.get('/catalog-playback', async (_req, res) => {
    try {
      const vaultDir = await getVaultDirectory();
      await syncVaultStatus(vaultDir);
      res.json({
        success: true,
        films: Object.values(SELF_HOSTED_FILMS),
        entries: Object.values(SELF_HOSTED_FILMS),
        totalCuratedCatalog: SURFACED_PUBLIC_DOMAIN_FILMS.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /resolve/:identifier — Resolves best playback URL (Mux HLS > Local Vault > Verified Archive.org MP4)
  router.get('/resolve/:identifier', async (req, res) => {
    try {
      const cleanId = String(req.params.identifier || '').replace(/^public_domain_/, '').trim();
      if (!cleanId) return res.status(400).json({ error: 'Identifier is required' });

      const vaultDir = await getVaultDirectory();
      await syncVaultStatus(vaultDir);

      const selfHosted = getSelfHostedFilm(cleanId);
      if (selfHosted?.muxPlaybackId) {
        return res.json({
          identifier: cleanId,
          streamSource: 'MUX',
          muxPlaybackId: selfHosted.muxPlaybackId,
          muxAssetId: selfHosted.muxAssetId,
          streamUrl: `https://stream.mux.com/${selfHosted.muxPlaybackId}.m3u8`,
          proxyStreamUrl: `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`,
        });
      }

      const localVideoPath = path.join(vaultDir, cleanId, 'video.mp4');
      if (fs.existsSync(localVideoPath)) {
        return res.json({
          identifier: cleanId,
          streamSource: 'LOCAL_VAULT',
          streamUrl: `/api/admin/film-ingest/stream/${encodeURIComponent(cleanId)}`,
          proxyStreamUrl: `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`,
        });
      }

      const catalogEntry = SURFACED_PUBLIC_DOMAIN_FILMS.find(f => f.identifier === cleanId);
      if (catalogEntry?.directDownloadUrl) {
        return res.json({
          identifier: cleanId,
          streamSource: 'ARCHIVE_VERIFIED_DIRECT',
          streamUrl: catalogEntry.directDownloadUrl,
          proxyStreamUrl: `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`,
        });
      }

      const resolved = await resolveAnyArchiveItem(cleanId);
      return res.json({
        identifier: cleanId,
        streamSource: 'ARCHIVE_DIRECT',
        streamUrl: resolved.url,
        proxyStreamUrl: `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`,
        sizeBytes: resolved.size,
      });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Could not resolve archive stream' });
    }
  });

  // POST /ensure-on-platform — Ensures any public domain film opened by a user is immediately
  // resolved for playback AND queued in the background for local vault hosting + Mux transcoding.
  router.post('/ensure-on-platform', async (req, res) => {
    try {
      const body = req.body || {};
      const rawId = body.identifier || body.archiveIdentifier || body.id;
      if (!rawId) return res.status(400).json({ error: 'identifier is required' });

      const cleanId = String(rawId).replace(/^public_domain_/, '').trim();
      const film = ensureFilmCatalogEntry({
        identifier: cleanId,
        title: body.title,
        description: body.description,
        director: body.director || body.artist,
        year: body.year || body.releaseYear,
        runtime: body.runtime,
        genre: body.genre,
        subType: body.subType,
        seasons: body.seasons,
        country: body.country,
        language: body.language,
        thumbnailUrl: body.thumbnailUrl || body.coverUrl,
        source: body.source,
        videoUrl: body.videoUrl,
        sourceUrl: body.sourceUrl,
      });

      const vaultDir = await getVaultDirectory();
      await syncVaultStatus(vaultDir);

      const selfHosted = getSelfHostedFilm(cleanId);
      let muxPlaybackId = selfHosted?.muxPlaybackId || inMemoryStatuses[cleanId]?.muxPlaybackId;
      let muxAssetId = selfHosted?.muxAssetId || inMemoryStatuses[cleanId]?.muxAssetId;
      let directMp4Url: string | undefined = film.directDownloadUrl;

      if (!directMp4Url && (ARCHIVE_FILM_ITEMS[cleanId] || film.archive === 'INTERNET_ARCHIVE')) {
        try {
          const resolved = await resolveAnyArchiveItem(cleanId);
          directMp4Url = resolved.url;
          film.directDownloadUrl = resolved.url;
        } catch {}
      }

      const localVideoExists = fs.existsSync(path.join(vaultDir, cleanId, 'video.mp4'));
      const streamUrl = muxPlaybackId
        ? `https://stream.mux.com/${muxPlaybackId}.m3u8`
        : localVideoExists
        ? `/api/admin/film-ingest/stream/${encodeURIComponent(cleanId)}`
        : directMp4Url || `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`;

      // Trigger background platform sync, Mux ingest, and local vault download without blocking response
      (async () => {
        try {
          await syncFilmToPlatformFirestore(film, {
            videoUrl: directMp4Url || streamUrl,
            muxPlaybackId,
            muxAssetId,
          });
          if (!muxPlaybackId && directMp4Url) {
            await ingestFilmIntoMux(film, directMp4Url);
          }
          const currentStat = inMemoryStatuses[cleanId];
          if (!localVideoExists && (!currentStat || (currentStat.status !== 'DOWNLOADING' && currentStat.status !== 'COMPLETED'))) {
            await startOrResumeDownload(cleanId);
          }
        } catch (bgErr) {
          console.warn(`[EnsureOnPlatform] Background ingest note for ${cleanId}:`, (bgErr as any)?.message || bgErr);
        }
      })();

      return res.json({
        success: true,
        identifier: cleanId,
        muxPlaybackId: muxPlaybackId || null,
        muxAssetId: muxAssetId || null,
        streamUrl,
        proxyStreamUrl: `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`,
        status: inMemoryStatuses[cleanId]?.status || (localVideoExists ? 'COMPLETED' : 'INGESTING'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to ensure film on platform' });
    }
  });

  // POST /ingest-all-native — Brings the entire public-domain catalog (films, anime, cartoons, TV series)
  // natively onto the platform (Firestore albums/videos + Mux HLS queue + optional local vault download).
  router.post('/ingest-all-native', async (req, res) => {
    try {
      const downloadToLocalVault = Boolean(req.body?.downloadToLocalVault);
      const vaultDir = await getVaultDirectory();
      await syncVaultStatus(vaultDir);

      // Respond immediately while background sync & Mux ingestion progresses through the full catalog
      const totalCatalog = SURFACED_PUBLIC_DOMAIN_FILMS.length;
      (async () => {
        for (const film of SURFACED_PUBLIC_DOMAIN_FILMS) {
          if (film.sourceIssue) continue;
          try {
            const selfHosted = getSelfHostedFilm(film.identifier);
            let directUrl = film.directDownloadUrl;
            if (!directUrl && (ARCHIVE_FILM_ITEMS[film.identifier] || film.archive === 'INTERNET_ARCHIVE')) {
              try {
                const resolved = await resolveAnyArchiveItem(film.identifier);
                directUrl = resolved.url;
                film.directDownloadUrl = resolved.url;
              } catch {}
            }
            await syncFilmToPlatformFirestore(film, {
              videoUrl: directUrl,
              muxPlaybackId: selfHosted?.muxPlaybackId,
              muxAssetId: selfHosted?.muxAssetId,
            });
            if (!selfHosted?.muxPlaybackId && directUrl) {
              await ingestFilmIntoMux(film, directUrl);
            }
            if (downloadToLocalVault) {
              const stat = inMemoryStatuses[film.identifier];
              if (!stat || (stat.status !== 'COMPLETED' && stat.status !== 'DOWNLOADING')) {
                await startOrResumeDownload(film.identifier);
              }
            }
          } catch (e) {
            console.warn(`[IngestAllNative] Error processing ${film.identifier}:`, (e as any)?.message || e);
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      })();

      res.json({
        success: true,
        totalCatalog,
        downloadToLocalVault,
        message: `Queued ${totalCatalog} public-domain films, anime, cartoons, and TV series for native Firestore registration and Mux HLS ingestion.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /stream/:identifier (Resumable HTTP 206 Range video streaming directly from disk)
  router.get('/stream/:identifier', async (req, res) => {
    try {
      const cleanId = String(req.params.identifier || '').replace(/^public_domain_/, '').trim();
      const vaultDir = await getVaultDirectory();
      const filmDir = path.join(vaultDir, cleanId);
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
          'Access-Control-Allow-Origin': '*',
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };

        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Access-Control-Allow-Origin': '*',
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

  // GET /proxy-stream/:identifier — Same-origin Range proxy for Archive.org MP4s (avoids CORS / redirect issues
  // and self-heals via live Archive.org metadata if an upstream filename ever changes)
  router.get('/proxy-stream/:identifier', async (req, res) => {
    try {
      const cleanId = String(req.params.identifier || '').replace(/^public_domain_/, '').trim();
      const vaultDir = await getVaultDirectory();
      const localVideoPath = path.join(vaultDir, cleanId, 'video.mp4');
      if (fs.existsSync(localVideoPath)) {
        return res.redirect(`/api/admin/film-ingest/stream/${encodeURIComponent(cleanId)}`);
      }

      const film = SURFACED_PUBLIC_DOMAIN_FILMS.find((f) => f.identifier === cleanId);
      let targetUrl = film?.directDownloadUrl;
      if (!targetUrl) {
        const resolved = await resolveAnyArchiveItem(cleanId);
        targetUrl = resolved.url;
        if (film) film.directDownloadUrl = targetUrl;
      }

      // Queue background local vault caching on first stream so subsequent plays are served locally from disk
      const stat = inMemoryStatuses[cleanId];
      if (film && (!stat || (stat.status !== 'DOWNLOADING' && stat.status !== 'COMPLETED'))) {
        startOrResumeDownload(cleanId).catch(() => {});
      }

      proxyRemoteVideoStream(targetUrl, req, res, 0, async () => {
        const resolved = await resolveAnyArchiveItem(cleanId);
        if (film) film.directDownloadUrl = resolved.url;
        return resolved.url;
      });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Could not proxy stream for film' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN-ONLY VAULT MANAGEMENT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════
  if (deps?.authenticate) {
    router.use(async (req: any, res, next) => {
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

  return router;
}

