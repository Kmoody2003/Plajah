import { assemble } from '../courseKit';
import { PART as t1 } from './law-music/t1';
import { PART as t2 } from './law-music/t2';
import { PART as t3 } from './law-music/t3';

export const COURSE_MODULE = assemble({ id: 'law-music', label: 'Music Law for Creators', blurb: 'The law every musician needs: the two copyrights in a track, co-writing and splits, registration, covers and the Music Modernization Act, SoundExchange, takedowns, sampling, similarity cases, fair use and the international basics. Read alongside the Music Law Library.', accent: '#C9A227', framework: 'plajah-law' }, [t1, t2, t3]);
