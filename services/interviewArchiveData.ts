/**
 * Authentic Library of Congress Oral History Transcripts & Media Registry
 *
 * Sourced directly from Library of Congress American Folklife Center Collections:
 * - AFS 00342 (Wallace Quarterman, 1935, Alan Lomax & Zora Neale Hurston)
 * - AFS 03974 (Uncle Billy McCrea, 1940, John A. Lomax & Ruby T. Lomax)
 * - AFS 09990 (Fountain Hughes, 1949, Hermond Norwood)
 * - AFS 03992 (Uncle Bob Ledbetter, 1940, John A. Lomax)
 *
 * Verbatim text parsed from original Library of Congress TEI XML records.
 */

export interface InterviewMediaEntry {
  interviewee: string;
  primaryPhoto: string;
  pdfUrl?: string;
  fulltextUrl?: string;
  companionArtifacts: Array<{ title: string; url: string; type: 'PHOTO' | 'DOCUMENT' | 'LEDGER' }>;
  historicalContext?: string;
  birthYear?: number;
  recordingYear?: number;
  location?: string;
  interviewers?: string;
}

export const INTERVIEW_MEDIA_REGISTRY: Record<string, InterviewMediaEntry> = {
  quarterman_b: {
    interviewee: 'Wallace Quarterman',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00369r.jpg',
    pdfUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342b.pdf',
    fulltextUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342b.xml',
    birthYear: 1844,
    recordingYear: 1935,
    location: 'Fort Frederica, St. Simons Island, Georgia (Side B)',
    interviewers: 'Alan Lomax, Zora Neale Hurston & Mary Elizabeth Barnicle',
    companionArtifacts: [
      {
        title: 'Wallace Quarterman Official LoC Portrait (1935)',
        url: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/WallaceQuarterman.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Wallace Quarterman at Frederica, St. Simons Island (Alan Lomax, 1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00369r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Official Library of Congress Session Log & Field Documentation — Side B (PDF)',
        url: 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342b.pdf',
        type: 'DOCUMENT',
      },
    ],
  },
  quarterman: {
    interviewee: 'Wallace Quarterman',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00369r.jpg',
    pdfUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342a.pdf',
    fulltextUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342a.xml',
    birthYear: 1844,
    recordingYear: 1935,
    location: 'Fort Frederica, St. Simons Island, Georgia',
    interviewers: 'Alan Lomax, Zora Neale Hurston & Mary Elizabeth Barnicle',
    companionArtifacts: [
      {
        title: 'Wallace Quarterman Official LoC Portrait (1935)',
        url: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/WallaceQuarterman.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Wallace Quarterman at Frederica, St. Simons Island (Alan Lomax, 1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00369r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Historic Quarters at St. Simons Island (1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00368r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Zora Neale Hurston during Georgia Expedition (1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00375r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Official Library of Congress Session Log & Field Documentation (PDF)',
        url: 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342a.pdf',
        type: 'DOCUMENT',
      },
    ],
  },
  mccrea: {
    interviewee: 'Uncle Billy McCrea',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38700/38764r.jpg',
    pdfUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1940003/afc1940003_afs03974/afc1940003_afs03974a.pdf',
    fulltextUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1940003/afc1940003_afs03974/afc1940003_afs03974a.xml',
    birthYear: 1852,
    recordingYear: 1940,
    location: 'Jasper, Texas',
    interviewers: 'John A. Lomax & Ruby T. Lomax',
    companionArtifacts: [
      {
        title: 'Uncle Billy McCrea in Yard, Jasper, Texas (Ruby T. Lomax, 1940)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38700/38764r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Uncle Billy McCrea with John A. Lomax during Recording Session (1940)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38700/38766r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Official Library of Congress Session Log & Field Documentation (PDF)',
        url: 'https://tile.loc.gov/storage-services/service/afc/afc1940003/afc1940003_afs03974/afc1940003_afs03974a.pdf',
        type: 'DOCUMENT',
      },
    ],
  },
  hughes: {
    interviewee: 'Fountain Hughes',
    primaryPhoto: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/FountainHughes.jpg',
    pdfUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1950037/afc1950037_afs09990/afc1950037_afs09990a.pdf',
    fulltextUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1950037/afc1950037_afs09990/afc1950037_afs09990a.xml',
    birthYear: 1848,
    recordingYear: 1949,
    location: 'Baltimore, Maryland',
    interviewers: 'Hermond Norwood',
    companionArtifacts: [
      {
        title: 'Fountain Hughes, Age 101, Baltimore, Maryland (Hermond Norwood, 1949)',
        url: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/FountainHughes.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Original Field Disc Sleeve & Catalog Card (AFS 09990)',
        url: 'https://tile.loc.gov/image-services/iiif/public:afc:afc9999005-3735:0470/full/pct:50.0/0/default.jpg',
        type: 'LEDGER',
      },
      {
        title: 'Official Library of Congress Session Log & Field Documentation (PDF)',
        url: 'https://tile.loc.gov/storage-services/service/afc/afc1950037/afc1950037_afs09990/afc1950037_afs09990a.pdf',
        type: 'DOCUMENT',
      },
    ],
  },
  ledbetter: {
    interviewee: 'Uncle Bob Ledbetter',
    primaryPhoto: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/BobLedbetter.jpg',
    pdfUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1940003/afc1940003_afs03992/afc1940003_afs03992a.pdf',
    fulltextUrl: 'https://tile.loc.gov/storage-services/service/afc/afc1940003/afc1940003_afs03992/afc1940003_afs03992a.xml',
    birthYear: 1861,
    recordingYear: 1940,
    location: 'Oil City, Louisiana',
    interviewers: 'John A. Lomax',
    companionArtifacts: [
      {
        title: 'Uncle Bob Ledbetter Official LoC Portrait (1940)',
        url: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/BobLedbetter.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Uncle Bob Ledbetter in Yard, Mooringsport / Oil City, LA (1940)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38700/38780r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Official Library of Congress Session Log & Field Documentation (PDF)',
        url: 'https://tile.loc.gov/storage-services/service/afc/afc1940003/afc1940003_afs03992/afc1940003_afs03992a.pdf',
        type: 'DOCUMENT',
      },
    ],
  },
  smith: {
    interviewee: 'Charlie Smith',
    primaryPhoto: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/CharlieSmith.jpg',
    birthYear: 1842,
    recordingYear: 1975,
    location: 'Bartow, Florida',
    interviewers: 'Library of Congress Field Worker',
    companionArtifacts: [
      {
        title: 'Charlie Smith Official LoC Portrait (Bartow, Florida)',
        url: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/CharlieSmith.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Archival Florida Homestead & Community Portrait',
        url: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8b29000/8b29700/8b29798r.jpg',
        type: 'PHOTO',
      },
    ],
  },
  johnson: {
    interviewee: 'George Johnson',
    primaryPhoto: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/GeorgeJohnson.jpg',
    birthYear: 1855,
    recordingYear: 1941,
    location: 'Mound Bayou, Mississippi',
    interviewers: 'Library of Congress Field Worker',
    companionArtifacts: [
      {
        title: 'George Johnson Official LoC Portrait (Mound Bayou, Mississippi, 1941)',
        url: 'https://www.loc.gov/static/collections/voices-remembering-slavery/images/GeorgeJohnson.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Historic Mound Bayou Town Site & Historic Buildings (1939)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8a25000/8a25005r.jpg',
        type: 'PHOTO',
      },
    ],
  },
  moseley: {
    interviewee: 'Isom Moseley & Alice Gaston',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8b35000/8b35900/8b35953r.jpg',
    birthYear: 1856,
    recordingYear: 1941,
    location: "Gee's Bend, Alabama",
    interviewers: 'John Henry Faulk',
    companionArtifacts: [
      {
        title: "Gee's Bend Community Portrait (Arthur Rothstein, 1937)",
        url: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8b35000/8b35900/8b35953r.jpg',
        type: 'PHOTO',
      },
      {
        title: "Gee's Bend Historic Setting (1937)",
        url: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8b35000/8b35900/8b35954r.jpg',
        type: 'PHOTO',
      },
    ],
  },
  smalley: {
    interviewee: 'Laura Smalley & Aunt Harriet Smith',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c30000/3c32000/3c32600/3c32613r.jpg',
    birthYear: 1858,
    recordingYear: 1941,
    location: 'Hempstead, Texas',
    interviewers: 'John Henry Faulk',
    companionArtifacts: [
      {
        title: 'John Henry Faulk with Field Recording Machine, Texas (1941)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c30000/3c32000/3c32600/3c32613r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Texas Historic Homestead & Field Setting (1941)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8b32000/8b32900/8b32971r.jpg',
        type: 'PHOTO',
      },
    ],
  },
  mcdonald: {
    interviewee: 'Joe McDonald',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8c15000/8c15400/8c15468r.jpg',
    birthYear: 1857,
    recordingYear: 1940,
    location: 'Livingston, Alabama',
    interviewers: 'John A. Lomax & Ruby T. Lomax',
    companionArtifacts: [
      {
        title: 'Livingston, Alabama Countryside (John Lomax Expedition, 1940)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/fsa/8c15000/8c15400/8c15468r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Lomax Field Recording Expedition (1940)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38700/38766r.jpg',
        type: 'PHOTO',
      },
    ],
  },
  seaislands: {
    interviewee: 'Samuel Polite & Dave White',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00368r.jpg',
    birthYear: 1850,
    recordingYear: 1932,
    location: 'St. Helena & Johns Island, South Carolina',
    interviewers: 'Lorenzo Dow Turner',
    companionArtifacts: [
      {
        title: 'Historic Quarters & Settlement, Sea Islands (1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00368r.jpg',
        type: 'PHOTO',
      },
      {
        title: 'Sea Islands Cultural Landscape (1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsc/00300/00369r.jpg',
        type: 'PHOTO',
      },
    ],
  },
};

export function resolveInterviewKey(titleOrId: string): string | null {
  const s = (titleOrId || '').toLowerCase();
  const isSideB = s.includes('side b') || s.includes('part 2') || s.includes('part b') || /\bafs\s*0*342b\b/i.test(s) || s.includes('afs00342b') || s.includes('_b.') || s.includes('-b');
  if (s.includes('quarterman') || s.includes('afs00342') || s.includes('afs 00342')) return isSideB ? 'quarterman_b' : 'quarterman';
  if (s.includes('mccrea') || s.includes('billy mccrea') || s.includes('afs03974') || s.includes('afs 03974')) return 'mccrea';
  if (s.includes('fountain hughes') || s.includes('hughes') || s.includes('afs09990') || s.includes('afs 09990')) return 'hughes';
  if (s.includes('bob ledbetter') || s.includes('uncle bob') || s.includes('ledbetter') || s.includes('afs03992') || s.includes('afs 03992')) return 'ledbetter';
  if (s.includes('charlie smith')) return 'smith';
  if (s.includes('george johnson') || (s.includes('mound bayou') && s.includes('johnson'))) return 'johnson';
  if (s.includes('alice moseley') || s.includes('richard gaston') || s.includes("gee's bend") || s.includes("gees bend")) return 'moseley';
  if (s.includes('isom smalley') || s.includes('harriet smith') || s.includes('laura smalley')) return 'smalley';
  if (s.includes('celia mcdonald') || s.includes('joe mcdonald')) return 'mcdonald';
  if (s.includes('laura polite') || s.includes('dave white') || s.includes('samuel polite') || (s.includes('sea island') && (s.includes('oral') || s.includes('interview')))) return 'seaislands';
  return null;
}

export function getInterviewMedia(titleOrId: string): InterviewMediaEntry | undefined {
  const key = resolveInterviewKey(titleOrId);
  return key ? INTERVIEW_MEDIA_REGISTRY[key] : undefined;
}

export function getAuthenticTranscript(titleOrId: string): Array<{ time: number; speaker: string; text: string; translatedText?: Record<string, string> }> | undefined {
  const key = resolveInterviewKey(titleOrId);
  return key ? AUTHENTIC_INTERVIEW_TRANSCRIPTS[key] : undefined;
}

export const AUTHENTIC_INTERVIEW_TRANSCRIPTS: Record<string, Array<{ time: number; speaker: string; text: string; translatedText?: Record<string, string> }>> = {
  quarterman_b: [
  {
    "time": 0,
    "speaker": "Alan Lomax",
    "text": "[brief pause here and scratching throughout recording] All right now!"
  },
  {
    "time": 4,
    "speaker": "Zora Neale Hurston",
    "text": "After they said you can go free, then what did you do? Did you run on off the plantation that day? Did you leave the plantation that day after they told you to go free?"
  },
  {
    "time": 19,
    "speaker": "Wallace Quarterman",
    "text": "That day master promised so, to give we forty dollars a month in pay. The [lot (?)] said the boys said they ain't want it. They rather go free you know."
  },
  {
    "time": 32,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 35,
    "speaker": "Wallace Quarterman",
    "text": "Well, of course, why I have them pay us, you understand? I get along with them you know. He brought out the big pot, you know. [loud thump]"
  },
  {
    "time": 47,
    "speaker": "Zora Neale Hurston",
    "text": "Yeah."
  },
  {
    "time": 50,
    "speaker": "Wallace Quarterman",
    "text": "And ah, after they, after this place closed down, sword down they just make them, sword down, and they just lay down their sword, and squash them down. You go in Hawkinsville and you see all the swords down now—"
  },
  {
    "time": 67,
    "speaker": "Zora Neale Hurston",
    "text": "[Yeah (?)]."
  },
  {
    "time": 70,
    "speaker": "Wallace Quarterman",
    "text": "—in the ground. And after the sword was down the tension, in the South tension. And after the South tension then they play. Yeah. Play they. [he thumbs a washtub base and sings]"
  },
  {
    "time": 84,
    "speaker": "Narrator",
    "text": "Kingdom Coming"
  },
  {
    "time": 87,
    "speaker": "Narrator",
    "text": "One foot one way. One foot the other way. One foot all around. Jumping. Standing. Couldn't cut a figure. And he couldn't go halfway around. Old master run aw-a-a-a-a-y. And set them darkies free. For you must be think thy kingdom a coming in the hour of jubilee."
  },
  {
    "time": 107,
    "speaker": "Wallace Quarterman",
    "text": "So we had a big breaking up right there, you know, after it. That's right."
  },
  {
    "time": 113,
    "speaker": "Alan Lomax",
    "text": "[says something inaudible] What about afterwards? You know when the, when the colored people had the jailer and everything? Tell us about that."
  },
  {
    "time": 123,
    "speaker": "Wallace Quarterman",
    "text": "Yes, we, everything been in we hand. But they couldn't control the colored people. [thumbs washtub] They do so much mischief until we have to go on back and to the white people we had education. You know when a man ain't got no education he ain't got nothing. All we tried to show them they wouldn't they just killone another and going on. So we had to nominate democrat over they head. They didn't like it the many got killed by nominate the democrat but we couldn't help it, to stop them so much killing. You understand?"
  },
  {
    "time": 145,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 148,
    "speaker": "Wallace Quarterman",
    "text": "So we nominate the democrat, [washtub] and we had a big time from that till now."
  },
  {
    "time": 155,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 158,
    "speaker": "Wallace Quarterman",
    "text": "The time ain't bad no because we been then."
  },
  {
    "time": 162,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 165,
    "speaker": "Wallace Quarterman",
    "text": "Because a man think nothing killing a man and taking a drink of water."
  },
  {
    "time": 171,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 174,
    "speaker": "Wallace Quarterman",
    "text": "But since we nominate the democrat we have more assurance. You understand."
  },
  {
    "time": 179,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 182,
    "speaker": "Wallace Quarterman",
    "text": "The law come in protecting them, you know they wouldn't [yell (?)] at the colored people."
  },
  {
    "time": 189,
    "speaker": "Zora Neale Hurston",
    "text": "Yeah."
  },
  {
    "time": 192,
    "speaker": "Wallace Quarterman",
    "text": "At all ma'am, at all."
  },
  {
    "time": 195,
    "speaker": "Zora Neale Hurston",
    "text": "Mhmm."
  },
  {
    "time": 198,
    "speaker": "Wallace Quarterman",
    "text": "Yes. And that's the way they come in protect them. But we had we own lawyers, judge and everything, well they just would, run everything in the dust, you know."
  },
  {
    "time": 211,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 214,
    "speaker": "Wallace Quarterman",
    "text": "Kill everything. Couldn't stand it. No, no—"
  },
  {
    "time": 217,
    "speaker": "Zora Neale Hurston",
    "text": "Well, did you ever have a office? Did you, would you ever, did you ever hold a office?"
  },
  {
    "time": 225,
    "speaker": "Wallace Quarterman",
    "text": "I wouldn't want an office."
  },
  {
    "time": 228,
    "speaker": "Zora Neale Hurston",
    "text": "Oh, yeah?"
  },
  {
    "time": 231,
    "speaker": "Wallace Quarterman",
    "text": "No ma'am. I'm a man. I wouldn't want an office. An office ??? kind of thing."
  },
  {
    "time": 238,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 241,
    "speaker": "Wallace Quarterman",
    "text": "You understand. You got to go and please the, the fellow you know."
  },
  {
    "time": 246,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 249,
    "speaker": "Wallace Quarterman",
    "text": "You got to stop do what God said. You don't go please that fellow."
  },
  {
    "time": 255,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 258,
    "speaker": "Wallace Quarterman",
    "text": "And they're right there where you left out."
  },
  {
    "time": 261,
    "speaker": "Zora Neale Hurston",
    "text": "But what become of your old master?"
  },
  {
    "time": 264,
    "speaker": "Wallace Quarterman",
    "text": "Old master? He died in the yellow fever."
  },
  {
    "time": 267,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 270,
    "speaker": "Wallace Quarterman",
    "text": "He was a nice man to me."
  },
  {
    "time": 273,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 276,
    "speaker": "Wallace Quarterman",
    "text": "I wouldn't take anything from him."
  },
  {
    "time": 279,
    "speaker": "Zora Neale Hurston",
    "text": "What was his name?"
  },
  {
    "time": 282,
    "speaker": "Wallace Quarterman",
    "text": "Colonel [Fedwary (?)]."
  },
  {
    "time": 285,
    "speaker": "Zora Neale Hurston",
    "text": "[Fedwary (?)]."
  },
  {
    "time": 288,
    "speaker": "Wallace Quarterman",
    "text": "Yes. And he was a colonel."
  },
  {
    "time": 291,
    "speaker": "Zora Neale Hurston",
    "text": "Mhmm."
  },
  {
    "time": 294,
    "speaker": "Wallace Quarterman",
    "text": "I wouldn't take anything, why me and he was just like one, you know."
  },
  {
    "time": 300,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 303,
    "speaker": "Wallace Quarterman",
    "text": "Yes, ma'am."
  },
  {
    "time": 306,
    "speaker": "Zora Neale Hurston",
    "text": "Well, where was his plantation?"
  },
  {
    "time": 309,
    "speaker": "Wallace Quarterman",
    "text": "His plantation on, on Savannah River. You know, Skidaway Island?"
  },
  {
    "time": 313,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 316,
    "speaker": "Wallace Quarterman",
    "text": "And he had another one Chattum County, you know. Savannah."
  },
  {
    "time": 320,
    "speaker": "Zora Neale Hurston",
    "text": "Yeah."
  },
  {
    "time": 323,
    "speaker": "Wallace Quarterman",
    "text": "Skidaway Island."
  },
  {
    "time": 326,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 329,
    "speaker": "Wallace Quarterman",
    "text": "[And umh, yes, sir (?)], I wouldn't take nothing from him."
  },
  {
    "time": 334,
    "speaker": "Alan Lomax",
    "text": "Well, did the white folks like it when you all were in power?"
  },
  {
    "time": 339,
    "speaker": "Wallace Quarterman",
    "text": "Oh, they liked me. They would like me all the way, because I protect them, you know."
  },
  {
    "time": 346,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 349,
    "speaker": "Wallace Quarterman",
    "text": "I protect them I told them, I told them the Yankee myself and they didn't feel sorry them you know. You see I just would understand how they think, you know."
  },
  {
    "time": 362,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 365,
    "speaker": "Wallace Quarterman",
    "text": "Tell me things you know."
  },
  {
    "time": 368,
    "speaker": "Zora Neale Hurston",
    "text": "Ahha."
  },
  {
    "time": 371,
    "speaker": "Wallace Quarterman",
    "text": "I see a man going a do a wrong thing I should stop it though. I stop him. Why—"
  },
  {
    "time": 379,
    "speaker": "Zora Neale Hurston",
    "text": "Well, did the white people, did your master and all them, like to see the Negroes be the judge and the jailer and everything?"
  },
  {
    "time": 389,
    "speaker": "Wallace Quarterman",
    "text": "Whooo! You see according to law you know, they don't mind you be that, I mean, if you know what you doing."
  },
  {
    "time": 398,
    "speaker": "Zora Neale Hurston",
    "text": "Uhmm."
  },
  {
    "time": 401,
    "speaker": "Wallace Quarterman",
    "text": "Don't you see?"
  },
  {
    "time": 404,
    "speaker": "Zora Neale Hurston",
    "text": "Yes."
  },
  {
    "time": 407,
    "speaker": "Wallace Quarterman",
    "text": "Yeah. We, we, you see, they, they don't know what they doing."
  },
  {
    "time": 412,
    "speaker": "Zora Neale Hurston",
    "text": "Yeah."
  },
  {
    "time": 415,
    "speaker": "Wallace Quarterman",
    "text": "And they prove that they don't know."
  },
  {
    "time": 418,
    "speaker": "Zora Neale Hurston",
    "text": "Mhmm."
  },
  {
    "time": 421,
    "speaker": "Narrator",
    "text": "END OF SIDE A"
  }
],
  quarterman: [
    { time: 0, speaker: "Wallace Quarterman", text: "[seems to quote religious text] The Lord gave the whole earth my grace with thee." },
    { time: 6, speaker: "Unidentified Woman Interviewer", text: "Uh huh." },
    { time: 8, speaker: "Wallace Quarterman", text: "For them that do [loud dog bark] and trust my word he shall be saved. [barking] [unintelligible]. But he that won't believest [shall go to hell (?)] [four barks]." },
    { time: 16, speaker: "Unidentified Woman Interviewer", text: "Uh huh." },
    { time: 18, speaker: "Wallace Quarterman", text: "I make him great [loud barking] commission. Know that he is preach my gospel truth by all the work that him can do, that all the wonder I will do." },
    { time: 27, speaker: "Unidentified Woman Interviewer", text: "Uh huh." },
    { time: 30, speaker: "Wallace Quarterman", text: "You must teach all nation my command, I am with you until the world shall end. Well I think that's enough [I had enough (?)]. [barking and yelping]" },
    { time: 33, speaker: "Unidentified Woman Interviewer", text: "Uh humm. Okay." },
    { time: 35, speaker: "Wallace Quarterman", text: "Okay" },
    { time: 68, speaker: "Narrator", text: "[short pause before Wallace Quarterman sings]" },
    { time: 71, speaker: "Narrator", text: "I Surrender" },
    { time: 74, speaker: "Narrator", text: "Oh, let me come on i-in. I surrender, and open the door. Let me come in open up. Yeah, let me come i-inn. Oh, let me come i-i-i-innn. I surrender, yes open the door, and let me come in. I said baby don't you cry, mothers and father are born to die. I surrender [recording gets stuck]. Oh, let me come i-inn. I surrender and open the door and let me come in." },
    { time: 77, speaker: "Wallace Quarterman", text: "[heavy cough, singing stops] I can't sing much." },
    { time: 80, speaker: "Unidentified Woman Interviewer", text: "Humm. [brief pause in recording]" },
    { time: 82, speaker: "Wallace Quarterman", text: "Born in 1844." },
    { time: 85, speaker: "Unidentified Woman Interviewer", text: "What's your name sir?" },
    { time: 95, speaker: "Wallace Quarterman", text: "Huh?" },
    { time: 98, speaker: "Mary Elizabeth Barnicle", text: "What's your name?" },
    { time: 102, speaker: "Wallace Quarterman", text: "My name is Wallace Quarterman in and through the state of Georgia. [brief pause in the recording— interview resumes in the middle of conversation] Morning I was toting in breakfast in the house." },
    { time: 104, speaker: "Unidentified Woman Interviewer", text: "Yeah." },
    { time: 106, speaker: "Wallace Quarterman", text: "And the, the, the big gun shot—" },
    { time: 108, speaker: "Unidentified Woman Interviewer", text: "Uh huh." },
    { time: 125, speaker: "Wallace Quarterman", text: "—suppose to have." },
    { time: 128, speaker: "Unidentified Woman Interviewer", text: "Yes." },
    { time: 165, speaker: "Wallace Quarterman", text: "The big gun shot so I buy a ??? take back within the house. The overseer ask me: “What is that, if that is thunder?” I tell him I don't know. I know what the Yankees. [background noise] I'm sorry." },
    { time: 168, speaker: "Alan Lomax", text: "That's all right." },
    { time: 205, speaker: "Wallace Quarterman", text: "Three time and he commence to shoot until the plate commence to rattle on the table. And he call me and told me to run down in the field and tell Peter to turn the people loose, that the Yankee coming. And so I run down in the field and, and whooped and holler, they done, he done told them Mr. [Gaeggles (?)] said turn the people loose because the Yankee coming." },
    { time: 208, speaker: "Alan Lomax", text: "And who was Peter?" },
    { time: 248, speaker: "Wallace Quarterman", text: "The driver. And so he said that, uh, Wallace is lying if he, he said so, then he said so, then the Yankee [beat to the landing the drum (?)]. You understand? [starts to recite] Way Down South getting mighty poor. Say they, used to drink coffee but now they drinking rye. They said, left [music Union Band (?)] make the rebel understand. To leave our land for the sake of Uncle Sam. Way down South getting might poor. Shot at the wildcat and see the Rebel run. I ain't going [anywhere them see me (?)] again. I've been to war already I—" },
    { time: 254, speaker: "Unidentified Woman Interviewer", text: "???" },
    { time: 258, speaker: "Wallace Quarterman", text: "Yeah, yeah. And that, the people then throws away their hoe then. They throwed away they hoe, and, and they call we all up, you know and, and give we all freedom because we are just as much as free as them. Now you understand. But the Yankees saying we must go back to the South they'll help we. Well they didn't. Of course there was so much doubt, and [it seems to me (?)] I, they would have done more, but it so much doubt in the way. They couldn't because the colored people sure [been (?)] poor, and some white people sure [went (?)] poor too. You understand and they rather help them than, uh, help we. I satisfied so far, for the Lord has done for me, I come through, through all the, been up and downs through the ??? ." },
    { time: 262, speaker: "Unidentified Woman Interviewer", text: "Well tell me about how they went to Hawkinsville and drove the sword down in the ground?" },
    { time: 351, speaker: "Wallace Quarterman", text: "They told them, said now you—" },
    { time: 355, speaker: "Alan Lomax", text: "??? . [conversation trails off]" },
    { time: 359, speaker: "Narrator", text: "END OF SIDE A" }
  ],
  mccrea: [
    { time: 0, speaker: "John A. Lomax", text: "Miss Sarah, this is Uncle Billy." },
    { time: 3, speaker: "Ruby T. Lomax", text: "How ya doing Uncle Billy? How are you this evening?" },
    { time: 7, speaker: "Uncle Billy McCrea", text: "I'm feeling very well ??? ." },
    { time: 9, speaker: "Ruby T. Lomax", text: "Have a seat?" },
    { time: 11, speaker: "John A. Lomax", text: "Uncle Billy, come sit right here and let's, oh, you want sit—" },
    { time: 15, speaker: "Ruby T. Lomax", text: "I think maybe he—" },
    { time: 17, speaker: "John A. Lomax", text: "??? right over [over] there. Sit in that." },
    { time: 20, speaker: "Uncle Billy McCrea", text: "Yes, sir." },
    { time: 22, speaker: "John A. Lomax", text: "And I want sit over here by you and talk to you some. [equipment set-up noise and pause]" },
    { time: 28, speaker: "Uncle Billy McCrea", text: "This ??? always ??? ." },
    { time: 31, speaker: "Ruby T. Lomax", text: "Rest your hat down there. That right. Rest your hat down there." },
    { time: 36, speaker: "Uncle Billy McCrea", text: "I didn't want come, [door slams] my voice is not good. I can't, I'm afraid I can't do what I, talk like I wanna talk." },
    { time: 43, speaker: "Ruby T. Lomax", text: "Well, that'll be fine. We—" },
    { time: 45, speaker: "Uncle Billy McCrea", text: "[grunts]" },
    { time: 46, speaker: "Ruby T. Lomax", text: "—get along fine." },
    { time: 48, speaker: "John A. Lomax", text: "If you don't sing, Mr., please you tonight I'll, we'll bring you back in the daytime." },
    { time: 53, speaker: "Uncle Billy McCrea", text: "Sir?" },
    { time: 55, speaker: "John A. Lomax", text: "If you're not satisfied with them tonight, well I'll bring you back in the daytime, when you're feeling better." },
    { time: 61, speaker: "Uncle Billy McCrea", text: "Yes, sir." },
    { time: 63, speaker: "John A. Lomax", text: "Now go head and, and ah sing one of those steamboat songs." },
    { time: 67, speaker: "Uncle Billy McCrea", text: "[pause] You want hear one of those steamboat songs?" },
    { time: 70, speaker: "John A. Lomax", text: "Yep." },
    { time: 72, speaker: "Uncle Billy McCrea", text: "[I'm just steady now. I don't wanna start then (?)]. They want me to sing that song sort of like—" },
    { time: 76, speaker: "John A. Lomax", text: "Blow Cornie Blow." },
    { time: 78, speaker: "Uncle Billy McCrea", text: "You want me sing that song like before they going to work." },
    { time: 82, speaker: "John A. Lomax", text: "Yeah." },
    { time: 84, speaker: "Uncle Billy McCrea", text: "Yeah. Well. I'll sing ??? going to work. I'll sing it for you." },
    { time: 89, speaker: "John A. Lomax", text: "Go head. Nothing here gonna hurt you, Uncle Billy. [microphone noise before Uncle Billy sings]" },
    { time: 94, speaker: "Narrator", text: "Blow Cornie Blow" },
    { time: 97, speaker: "Narrator", text: "I think I hear a the captain call me—blow cornie blow. I think I hear the captain calling—blow cornie blow." },
    { time: 105, speaker: "Narrator", text: "A blow cornie blow. Blow cornie blow. A blew it cold, loud and mournful. Blow cornie blow." },
    { time: 113, speaker: "Narrator", text: "I think I hear the captain [say (?)] ??? —blow cornie blow. They carried lo-o-o-o-ong onto bend. Blow cornie blow. They soon will be to the landing corner. Blow cornie blow. De captain hand me down my [salary (?)]. Blow cornie blow. Oh, blow boy and let them hear you. Blow cornie blow." },
    { time: 122, speaker: "Narrator", text: "Oh, blow loud and ??? . Blow cornie blow. Oh, blow loud just so he can hear you. Blow cornie blow. I think I hear the captain call you. Blow cornie blow." },
    { time: 130, speaker: "Uncle Billy McCrea", text: "[concludes song] Yeah. That's the best I—" },
    { time: 138, speaker: "Narrator", text: "John A. Lomax. Now, what were the boys doing when they were singing that—" },
    { time: 146, speaker: "Uncle Billy McCrea", text: "??? . What you ??? doing?" },
    { time: 155, speaker: "John A. Lomax", text: "Yeah." },
    { time: 163, speaker: "Uncle Billy McCrea", text: "Toting salt." },
    { time: 171, speaker: "John A. Lomax", text: "Toting salt?" },
    { time: 180, speaker: "Uncle Billy McCrea", text: "Yes, sir." },
    { time: 188, speaker: "John A. Lomax", text: "Where from the boat to the bank?" },
    { time: 196, speaker: "Uncle Billy McCrea", text: "From the boat goes back to the warehouse." },
    { time: 205, speaker: "John A. Lomax", text: "Where that salt come from?" },
    { time: 213, speaker: "Uncle Billy McCrea", text: "I don't know where it come from. We used, we got, they got it for old master." },
    { time: 221, speaker: "John A. Lomax", text: "Yeah." },
    { time: 229, speaker: "Uncle Billy McCrea", text: "Old master just sit beside you know and they ah, when they land now, then you had to tote it up this bank and put it in the warehouse. And they would sing the while they's toting it." },
    { time: 238, speaker: "John A. Lomax", text: "Well [now (?)] they'd sing Handy Gal also, wouldn't they?" },
    { time: 246, speaker: "Uncle Billy McCrea", text: "No. This here's another one." },
    { time: 254, speaker: "Narrator", text: "John A. Lomax. All right." },
    { time: 263, speaker: "Uncle Billy McCrea", text: "Let's see here how's that go. [We used to just tear that up (?)]. Now I sung them you see—" },
    { time: 271, speaker: "John A. Lomax", text: "Oh, Sally, What Ya Gonna Have For Dinner? was that one of them?" },
    { time: 279, speaker: "Uncle Billy McCrea", text: "??? that's one of them." },
    { time: 287, speaker: "John A. Lomax", text: "Well, sing that one." },
    { time: 296, speaker: "Uncle Billy McCrea", text: "Let's see now how that [go (?)]. I got to study it a while. That's the reason why I didn't even, didn't want come cause I done have it preach now—see, I tell you how this. Let, I need talk a little bit. You see here? Why yes. See, I had to run here for two years, and, and not going, and you hurt me. It seem like it, aged my voice. But you don't hurt me on just this time. Well, now I see, let me see how that go?" },
    { time: 304, speaker: "John A. Lomax", text: "How about the [Jerah Rall (?)] Don't Come To My House?" },
    { time: 312, speaker: "Uncle Billy McCrea", text: "Yeah. That's a good one too." },
    { time: 321, speaker: "John A. Lomax", text: "Alright. Sing in that one." },
    { time: 329, speaker: "Uncle Billy McCrea", text: "[sings]" },
    { time: 337, speaker: "Narrator", text: "Ju Rawsy Row, Row, Don't Come To My House" },
    { time: 345, speaker: "Narrator", text: "Ju rawsy raw, raw, don't come to my house. Ju rawsy raw, raw, don't come to my house. Ju rawsy raw, raw, hoe ??? hoe. Ju rawsy raw, raw, hoe nigga hoe. Ju rawsy raw, raw, hoe nigga hoe. Ju rawsy raw, raw, a good dog. Ju rawsy raw, raw, ??? . Ju rawsy raw, raw, [old ties (?)] they frighten me. Ju rawsy raw, raw, [old ties could (?)] bake your bread. Ju rawsy raw, raw, ??? [old ties (?)] a good dog. Ju rawsy raw, raw, ??? [old ties (?)] a horse ??? . Ju rawsy raw, raw, tote boy. Tote boy. Ju rawsy raw, raw, ??? . Ju rawsy raw, raw, ju rawsy raw. Ju rawsy raw, raw, ??? [old ties (?)] a good dog. Ju rawsy raw, raw, ??? . Ju rawsy raw, raw, [s'ick them old ties up (?)]. Ju rawsy raw, raw, [take them old ties up (?)]. Ju rawsy raw, raw, ??? [to go (?)]. Ju rawsy raw, raw, [old ties tend the crop (?)]. Ju rawsy raw, raw, [old ties tend the crop (?)]. Ju rawsy raw, raw, [old ties to bake your bread (?)]. Ju rawsy raw, raw, [old ties a good dog (?)]. Ju rawsy raw, raw, ju rawsy raw, raw. Ju rawsy raw, raw, [s'ick them old ties up (?)]. Ju rawsy raw, raw, [cut them old ties up (?)]. Ju rawsy raw, raw, [cut them old ties up (?)]. Ju rawsy raw, raw. [drumming] Ju rawsy raw, raw. [drumming] Ju rawsy raw, raw, [old ties a biting dog (?)]. Ju rawsy raw, raw, [old ties will bite you (?)]. Ju rawsy raw, raw, [old ties will hurt you (?)]. Ju rawsy raw, raw [old ties a good dog (?)]. Ju rawsy raw, raw, [s'ick them old ties up (?)]. Ju rawsy raw, raw, [cut them old ties up (?)]. Ju rawsy raw, raw, [hold them ties up (?)]. Ju rawsy raw, raw." },
    { time: 354, speaker: "Uncle Billy McCrea", text: "—how you like that?" },
    { time: 362, speaker: "John A. Lomax", text: "I'd say that's a good one." },
    { time: 370, speaker: "Uncle Billy McCrea", text: "[laughs]" },
    { time: 379, speaker: "John A. Lomax", text: "Now, well now, hold up. Ah, go on. Let's finish with those, ah, how about that one Walk Darley. How did that one go?" },
    { time: 387, speaker: "Uncle Billy McCrea", text: "Which?" },
    { time: 395, speaker: "John A. Lomax", text: "Walk Darley, you said, or, Dooley or something like, or—" },
    { time: 404, speaker: "Uncle Billy McCrea", text: "[sings] Walk Dooley ." },
    { time: 412, speaker: "Narrator", text: "Walk Dooley. Walk dooley. Dooley's a good. Do walk a dooley. Dooley's my honey [girl (?)]. Do raz ??? Walk dooley. Walking and a talking. Walk dooley. Walking and a talk. Walk dooley, dooley's a hand gal. Dooley ???" },
    { time: 420, speaker: "Uncle Billy McCrea", text: "Let me see. I got that wrong. That's why you don't want my mind don't process nothing. Let me see now. Let me see how I can get that started again. Nope. Cause ??? . That's it. Let's see, now. [he attempts to sing and Ruby T. Lomax comments about something] Ahha. I got it wrong. [Uncle Billy McCrea, resumes song]" },
    { time: 428, speaker: "Narrator", text: "Walk dooley. Walk, talk and dooley. Walk dooley. Walk, talk, dooley. Walk dooley. Dooley is a— Walk dooley. Oh, dooley. Do walk. Dooley. Oh, dooley. Walk dooley. Walk them and a talking. Walk dooley. Walk them and a talk." },
    { time: 437, speaker: "Narrator", text: "Do raz. Araz-raz. ??? dooley. Walk dooley. ??? dooley. Do raz. Araz-raz, hoe nigga. Hoe man. Do raz. ???" },
    { time: 445, speaker: "Narrator", text: "Walk dooley, hoe down nigga. Walk dooley, I am a good man. Walk dooley, I can do ??? . Walk dooley, walk, talk dooley. Walk dooley, run along dooley. Walk dooley, talk long dooley. Walk dooley, stepping on dooley. Walk dooley, dooley is a good thing. Walk dooley, dooley let the hogs out. Walk dooley, hoe nigga hoe me. Walk dooley, hoe nigga hoe me." },
    { time: 453, speaker: "Narrator", text: "Do raza I am ??? Do raza I could pull two men. Do raza I could handle three men." },
    { time: 462, speaker: "Narrator", text: "Walk dooley, I could whoop five men. Walk dooley, dooley she's a good gal. Walk dooley, I could slap her husband. Walk I slap Julia. Walk sometime I slap Julia. Walk sometime I slap her jaw. Walk Julia is a good gal. Walk when I slap Julia on the jaw. Walk then she come to be a good girl. Walk Julie—" },
    { time: 470, speaker: "Uncle Billy McCrea", text: "[laugh] I got, now, now let me see now. ???" },
    { time: 478, speaker: "John A. Lomax", text: "Handy Gal." },
    { time: 486, speaker: "Uncle Billy McCrea", text: "Handy Gal. Let me see how it is. [he attempts to sing] Handy Gal . Handy gal. Handyeeee. Handy gal. Handyeeee. Let me see. Handy gal. Handy. Let me see. Handy gal. Let me see. Walk. Handy gal. Let's see. Handy gal. See, I've got to study it. You see. I've got to get to study it, before I could sing it." },
    { time: 495, speaker: "John A. Lomax", text: "That's all right. Ah, oh what about ta— [recording glitch]" },
    { time: 503, speaker: "Uncle Billy McCrea", text: "Let me see how it is. How that, that song is. That's one of those songs on the boat I was just talking about." },
    { time: 511, speaker: "John A. Lomax", text: "Yeah." },
    { time: 520, speaker: "Uncle Billy McCrea", text: "I don't know what's going happen here." },
    { time: 528, speaker: "John A. Lomax", text: "Yeah." },
    { time: 536, speaker: "Uncle Billy McCrea", text: "Let's see. [he sings one note—Oh.] Let's see. How's that go. I had that down good today. Because I told them, I remember sort of leaving. See. [sings—Ohhhh] [leave won't you ??? (?)]. Told you I come around here and g-o-o-o-o. G-o-o-o-o, sunny your horse is gonna have a [good stable (?)]. Let's see. ??? carry on. ???" },
    { time: 545, speaker: "John A. Lomax", text: "What did you do on the boats? Ah, ah Uncle Billy?" },
    { time: 553, speaker: "Uncle Billy McCrea", text: "Cook. I cooked." },
    { time: 561, speaker: "John A. Lomax", text: "How long?" },
    { time: 569, speaker: "Uncle Billy McCrea", text: "On the boat?" },
    { time: 578, speaker: "John A. Lomax", text: "Yeah." },
    { time: 586, speaker: "Uncle Billy McCrea", text: "I cooked boats about six years." },
    { time: 594, speaker: "John A. Lomax", text: "And where did the boats run?" },
    { time: 603, speaker: "Uncle Billy McCrea", text: "From Beaumont to Jasper here [Gulfport (?)]." },
    { time: 611, speaker: "John A. Lomax", text: "How many miles was that?" },
    { time: 619, speaker: "Uncle Billy McCrea", text: "N-nnn, I think they taught us, fifty-miles, from Jasper to Beaumont. I cooked on. I cooked on about, cooked for about six years on steamboats." },
    { time: 627, speaker: "John A. Lomax", text: "And how old are you Uncle Billy?" },
    { time: 636, speaker: "Uncle Billy McCrea", text: "Well I—" },
    { time: 644, speaker: "John A. Lomax", text: "Sit over a little bit." },
    { time: 652, speaker: "Uncle Billy McCrea", text: "—could tell you my age. Now I, I don't rightly know my age. But I can tell you what I go for. The fifteenth of this, of October, I be eighty-nine. Eighty-nine-years-old. And on the second time, the way they've got my age fixed there on the fifteenth I will be a hundred-and-seventeen-years-old. But I register in the courthouse, of my age be ninety-eight, ah eight, no eighty-nine, this coming, the fifteenth of this month. Next Oc, October." },
    { time: 661, speaker: "John A. Lomax", text: "How many children have you, Uncle?" },
    { time: 669, speaker: "Uncle Billy McCrea", text: "How many children? I have [Ruby T. Lomax utters—Two children.] I, how many children? Let's see. Thirty-six." },
    { time: 677, speaker: "John A. Lomax", text: "Thirty-six?" },
    { time: 685, speaker: "Uncle Billy McCrea", text: "That's right." },
    { time: 694, speaker: "John A. Lomax", text: "How many boys?" },
    { time: 702, speaker: "Uncle Billy McCrea", text: "How many boys? Eighteen boys." },
    { time: 710, speaker: "John A. Lomax", text: "And how many girls?" },
    { time: 719, speaker: "Uncle Billy McCrea", text: "I don't know. Cain't [can't] rightly tell you how many girls. But the boys I got sixteen raised right here in Jasper County." },
    { time: 727, speaker: "John A. Lomax", text: "Sixteen boys?" },
    { time: 735, speaker: "Uncle Billy McCrea", text: "Yes, sir. And them two boys you seen with ??? the other day?" },
    { time: 744, speaker: "John A. Lomax", text: "Yeah." },
    { time: 752, speaker: "Uncle Billy McCrea", text: "Them my boys. Twin boys. You see another boy there?" },
    { time: 760, speaker: "John A. Lomax", text: "Yeah." },
    { time: 768, speaker: "Narrator", text: "That's my boy. And another boy come out there, and that's one of my boys raised right here. I have, I have one in, I have one in ah, in Beaumont. And I have one boy— [recording ends]" },
    { time: 777, speaker: "Narrator", text: "END OF SIDE A" }
  ],
  hughes: [
    { time: 0, speaker: "Fountain Hughes", text: "Talk to who?" },
    { time: 3, speaker: "Hermond Norwood", text: "Well, just tell me what your name is." },
    { time: 7, speaker: "Fountain Hughes", text: "My name is Fountain Hughes. I was born in Charlottesville, Virginia. My grandfather belong to Thomas Jefferson. My grandfather was a hundred and fifteen years old when he died. And now I am one hundred and, and one year old. That's enough. [recording stops and starts again]. She used to work, but what she made I don't know. I never ask her." },
    { time: 22, speaker: "Hermond Norwood", text: "You just go ahead and talk away there. You don't mind, do you, Uncle Fountain?" },
    { time: 28, speaker: "Fountain Hughes", text: "No. And when, now, your husband and you both are young. You all try to live like young people ought to live. Don't want everything somebody else has got. Whatever you get, if its yours be satisfied. And don't spend your money till you get it. So many people get in debt. Well, that all was so cheap when I bought it. You spend your money before you get it because you're going in debt for what you want. When you want something, wait until you get the money and pay for it cash. That's the way I've done. If I've wanted anything, I'd wait until I got the money and I paid for it cash. I never bought nothing on time in my life. Now plenty people if they want a suit of clothes, they go to work and they'll buy them on time. Well they say they was cheap. They cheap. If you got the money you can buy them cheaper. They want something for, for waiting on you for, uh, till you get ready to pay them. And if you got the money you can go where you choose and buy it when you go, when you want it. You see? Don't buy it because somebody else go down and run a debt and run a bill or, I'm going to run it too. Don't do that. I never done it. Now, I'm a hundred years old and I don't owe nobody five cents, and I ain't got no money either. And I'm happy, just as happy as somebody that's oh, got million. Nothing worries me. I'm not, my head ain't even white. I, nothing in the world worries me. I can sit here in this house at night, nobody can come and say, \"Mr. Hughes, you owe me a quarter, you owe me a dollar, you owe me five cents.\" No you can't. I don't owe you nothing. Why? I never made no bills in my life. And I'm living too. And I'm a hundred years old. And if you take my advice today, you'll never make a bill. Because what you want, give your money, pay them cash, and then the rest of the money is yours. But if you run a bill they, well, so much and so much and you don't have to pay. Nothing down it's, it's all when you come to pay. It's all, you don't have to pay no more. But they, they'll, they'll charge you more. They getting something or other or else they wouldn't trust you. But I can't just say what they getting. But they getting something or other else they wouldn't want your credit. Now I tell you that anybody that trusts you for two dollars or have a account with them by the month or by the week, store count or any account. They're getting something out of it. Else they don't want to accommodate you that much to trust you. Now, if I want, course I ain't got no clothes, but if I want some clothes, I, I ain't got no money, I'm going to wait till I get the money to buy them. Indeed I am. I'm not a going to say because I can get them on trust, I go down and get them. I got to pay a dollar more anyhow. But either they charge you more or they say taxes are so much. But if I've got the money to pay cash, I'll pay the taxes and all down in cash, you know. It's all done with. So many of colored people is head over heels in debt. Trust me trust. I'll get it on time. They want a set of furniture, go down and pay down so much and the rest on time. You done paid that, you done paid for them then. When you pay down so much and they charge you fifty dollar, hundred dollars for a set and you pay down twenty-five dollars cash, you done paid them. That's all it was worth, twenty-five dollars, and you pay, now you, I'm seventy-five dollars in debt now. Because I, I have to pay a hundred dollars for that set, and it's only worth about twenty-five dollar. But you buying it on time. But people ain't got sense enough to know it. But when you get old like I am, you commence to think, well, I have done wrong. I should have kept my money until I wanted this thing, and when I want it, I take my money and go pay cash for it. Or else I will do without it. That's supposing you want a new dress. You say, well I'll, I'll buy it, but, uh, I don't need it. But I can get it on time. Well let's go down the store today and get something on time. Well you go down and get a dress on time. Something else in there, I want that. They'll sell that to you on time. You won't have to pay nothing down. But there's a payday coming. And when that payday comes, they want you come pay them. If you don't, they can't get no more. Well, if you never do that, if you don't start it, you will never end it. I never did buy nothing on time. I must tell you on this, I'm sitting right here now today, and if I's the last word I've got to tell you, I never even much as tried to buy a, a shirt on time. And plenty people go to work, go down to the store and buy uh, three and four dollars for a shirt. Two, three uh, seven, eight dollars for a pair of pants. Course they get them on time. I don't, no, no, no. I say, I got, I buy something for five dollars. Because I got the five dollars, I'll pay for it. I'm done with that." },
    { time: 75, speaker: "Hermond Norwood", text: "You talk about how old you are Uncle Fountain. Do you, tell how far back do you remember?" },
    { time: 84, speaker: "Fountain Hughes", text: "I remember [pause]. Well I'll tell you, uh. Things come to me in spells, you know. I remember things, uh, more when I'm laying down than I do when I'm standing or when I'm walking around. Now in my boy days, why, uh, boys lived quite different from the way they live now. But boys wasn't as mean as they are now either. Boys lived to, they had a good time. The masters di, didn't treat them bad. And they was always satisfied. They never wore no shoes until they was twelve or thirteen years old. And now people put on shoes on babies you know, when they're two year, when they month old. I be, I don't know how old they are. Put shoes on babies. Just as soon as you see them out in the street they got shoes on. I told a woman the other day, I said, \"I never had no shoes till I was thirteen years old.\" She say, \"Well but you bruise your feet all up, and stump your toes.\" I say, \"Yes, many time I've stump my toes, and blood run out them. That didn't make them buy me no shoes.\" And I been, oh, oh you wore a dress like a woman till I was, I [be-believe [?] ten, twelve, thirteen years old." },
    { time: 135, speaker: "Hermond Norwood", text: "So you wore a dress." },
    { time: 139, speaker: "Fountain Hughes", text: "Yes. I didn't wear no pants, and of course didn't make boys' pants. Boys wore dresses. Now only womens wearing the dresses and the boys is going with the, with the womens wearing the pants now and the boys wearing the dresses. Still [laughs]." },
    { time: 158, speaker: "Hermond Norwood", text: "Who did you work for Uncle Fountain when ... ?" },
    { time: 161, speaker: "Fountain Hughes", text: "Who'd I work for?" },
    { time: 163, speaker: "Hermond Norwood", text: "Yeah." },
    { time: 165, speaker: "Fountain Hughes", text: "When I, you mean when I was slave?" },
    { time: 168, speaker: "Hermond Norwood", text: "Yeah, when you were a slave. Who did you work for?" },
    { time: 170, speaker: "Fountain Hughes", text: "Well, I belonged to, uh, B., when I was a slave. My mother belonged to B. But my, uh, but, uh, we, uh, was all slave children. And after, soon after when we found out that we was free, why then we was, uh, bound out to different people. [names of people] and an all such people as that. And we would run away, and wouldn't stay with them. Why then we'd just go and stay anywheres we could. Lay out a night in underwear. We had no home, you know. We was just turned out like a lot of cattle. You know how they turn cattle out in a pasture? Well after freedom, you know, colored people didn't have nothing. Colored people didn't have no beds when they was slaves. We always slept on the floor, pallet here, and a pallet there. Just like, uh, lot of, uh, wild people, we didn't, we didn't know nothing. Didn't allow you to look at no book. And then there was some free born colored people, why they had a little education, but there was very few of them, where we was. And they all had uh, what you call, I might call it now, uh, jail centers, was just the same as we was in jail. Now I couldn't go from here across the street, or I couldn't go through nobody's house without I have a note, or something from my master. And if I had that pass, that was what we call a pass, if I had that pass, I could go wherever he sent me. And I'd have to be back, you know, when uh. Whoever he sent me to, they, they'd give me another pass and I'd bring that back so as to show how long I'd been gone. We couldn't go out and stay a hour or two hours or something like. They send you. Now, say for instance I'd go out here to S.'s place. I'd have to walk. And I would have to be back maybe in a hour. Maybe they'd give me hour. I don't know just how long they'd give me. But they'd give me a note so there wouldn't nobody interfere with me, and tell who I belong to. And when I come back, why I carry it to my master and give that to him, that'd be all right. But I couldn't just walk away like the people does now, you know. It was what they call, we were slaves. We belonged to people. They'd sell us like they sell horses and cows and hogs and all like that. Have a auction bench, and they'd put you on, up on the bench and bid on you just same as you bidding on cattle you know." },
    { time: 175, speaker: "Hermond Norwood", text: "Was that in Charlotte that you were a slave?" },
    { time: 185, speaker: "Fountain Hughes", text: "Hmmm?" },
    { time: 195, speaker: "Hermond Norwood", text: "Was that in Charlotte or Charlottesville?" },
    { time: 205, speaker: "Fountain Hughes", text: "That was in Charlottesville." },
    { time: 215, speaker: "Hermond Norwood", text: "Charlottesville, Virginia." },
    { time: 225, speaker: "Fountain Hughes", text: "Selling women, selling men. All that. Then if they had any bad ones, they'd sell them to the nigga traders, what they called the nigga traders. And they'd ship them down south, and sell them down south. But, uh, otherwise if you was a good, good person they wouldn't sell you. But if you was bad and mean and they didn't want to beat you and knock you around, they'd sell you what to the, what was call the nigga trader. They'd have a regular, have a sale every month, you know, at the courthouse. And then they'd sell you, and get two hundred dollar, hundred dollar, five hundred dollar." },
    { time: 235, speaker: "Hermond Norwood", text: "Were you ever sold from one person to another?" },
    { time: 245, speaker: "Fountain Hughes", text: "Mmmm?" },
    { time: 255, speaker: "Hermond Norwood", text: "Were you ever sold?" },
    { time: 265, speaker: "Fountain Hughes", text: "No, I never was sold." },
    { time: 275, speaker: "Hermond Norwood", text: "Always stayed with the same person. [Hermond Norwood and Fountain Hughes overlap)" },
    { time: 285, speaker: "Fountain Hughes", text: "All, all. I was too young to sell." },
    { time: 295, speaker: "Hermond Norwood", text: "Oh I see." },
    { time: 305, speaker: "Fountain Hughes", text: "See I wasn't old enough during the war to sell, during the Army. And uh, my father got killed in the Army, you know. So it left us small children just to live on whatever people choose to, uh, give us. I was, I was bound out for a dollar a month. And my mother used to collect the money. Children wasn't, couldn't spend money when I come along.In, in, in fact when I come along, young men, young men couldn't spend no money until they was twenty-one years old. And then you was twenty-one, why then you could spend your money. But if you wasn't twenty-one, you couldn't spend no money. I couldn't take, I couldn't spend ten cents if somebody give it to me. Because they'd say, \"Well, he might have stole it.\" We all come along, you might say, we had to give an account of what you done. You couldn't just do things and walk off and say I didn't do it. You'd have to, uh, give an account of it. Now, uh, after we got freed and they turned us out like cattle, we could, we didn't have nowhere to go. And we didn't have nobody to boss us, and, uh, we didn't know nothing. There wasn't, wasn't no schools. And when they started a little school, why, the people that were slaves, there couldn't many of them go to school, except they had a father and a mother. And my father was dead, and my mother was living, but she had three, four other little children, and she had to put them all to work for to help take care of the others. So we had, uh, we had what you call, worse than dogs has got it now. Dogs has got it now better than we had it when we come along. I know, I remember one night, I was out after I, I was free, and I didn't have nowhere to go. I didn't have nowhere to sleep. I didn't know what to do. My brother and I was together. So we knew a man that had a, a livery stable. And we crept in that yard, and got into one of the hacks of the automobile, and slept in that hack all night long. So next morning, we could get out and go where we belonged. But we was afraid to go at night because we didn't know where to go, and didn't know what time to go. But we had got away from there, and we afraid to go back, so we crept in, slept in that thing all night until the next morning, and we got back where we belong before the people got up. Soon as day commenced, come, break, we got out and commenced to go where we belonged. But we never done that but the one time. After that we always, if there, if there was a way, we'd try to get back before night come. But then that was on a Sunday too, that we done that. Now, uh, when we were slaves, we couldn't do that, see. And after we got free we didn't know nothing to do. And my mother, she, then she hunted places, and bound us out for a dollar a month, and we stay there maybe a couple of years. And, she'd come over and collect the money every month. And a dollar was worth more then than ten dollars is now. And I, and the men used to work for ten dollars a month, hundred and twenty dollars a year. Used to hire that a way. And, uh, now you can't get a man for, fifty dollars a month. You paying a man now fifty dollars a month, he don't want to work for it." },
    { time: 315, speaker: "Hermond Norwood", text: "More like fifty dollars a week now a days." },
    { time: 325, speaker: "Fountain Hughes", text: "[laughs] That's just it exactly. He wants fifty dollars a week and they ain't got no more now than we had then. And we, no more money, but course they bought more stuff and more property and all like that. We didn't have no property. We didn't have no home. We had nowhere or nothing. We didn't have nothing only just, uh, like your cattle, we were just turned out. And uh, get along the best you could. Nobody to look after us. Well, we been slaves all our lives. My mother was a slave, my sisters was slaves, father was a slave." },
    { time: 335, speaker: "Hermond Norwood", text: "Who was you father a slave for Uncle Fountain?" },
    { time: 345, speaker: "Fountain Hughes", text: "He was a slave for B. He belong, he belong to B." },
    { time: 355, speaker: "Hermond Norwood", text: "Didn't he belong to Thomas Jefferson at one time?" },
    { time: 365, speaker: "Fountain Hughes", text: "He didn't belong to Thomas Jefferson. My grandfather belong to" },
    { time: 375, speaker: "Narrator", text: "Thomas Jefferson." },
    { time: 385, speaker: "Hermond Norwood", text: "Oh your grandfather did." },
    { time: 395, speaker: "Fountain Hughes", text: "Yeah. And, uh, my father belong to, uh, B. And, uh, and B. died during the wartime because, uh, he was afraid he'd have to go to war. But, then now, you, and in them days you could hire a substitute to take your place. Well he couldn't get a substitute to take his place so he run away from home. And he took cold. And when he come back, the war was over but he died. And then, uh, if he had lived, couldn't been no good. The Yankees just come along and, just broke the mill open and hauled all the flour out in the river and broke the, broke the store open and throwed all the meat out in the street and throwed all the sugar out. And we, we boys would pick it up and carry it and give it to our missus and master, young masters, told we come to be, well I don't know how old. I don't know, to tell you the truth when I think of it today, I don't know how I'm living. None, none of the rest of them that I know of is living. I'm the oldest one that I know that's living. But, still, I'm thankful to the Lord. Now, if, uh, if my master wanted send me, he never say, you couldn't get a horse and ride. You walk, you know, you walk. And you be barefooted and collapse. That didn't make no difference. You wasn't no more than a dog to some of them in them days. You wasn't treated as good as they treat dogs now. But still I didn't like to talk about it. Because it makes, makes people feel bad you know. Uh, I, I could say a whole lot I don't like to say. And I won't say a whole lot more." },
    { time: 405, speaker: "Hermond Norwood", text: "Do you remember much about the Civil War?" },
    { time: 415, speaker: "Fountain Hughes", text: "No, I don't remember much about it." },
    { time: 425, speaker: "Hermond Norwood", text: "You were a little young then I guess, huh." },
    { time: 435, speaker: "Fountain Hughes", text: "I, uh, I remember when the Yankees come along and took all the good horses and took all the, throwed all the meat and flour and sugar and stuff out in the river and let it go down the river. And they knowed the people wouldn't have nothing to live on, but they done that. And that's the reason why I don't like to talk about it. Them people, and, and if you was cooking anything to eat in there for yourself, and if they, they was hungry, they would go and eat it all up, and we didn't get nothing. They'd just come in and drink up all your milk, milk. Just do as they please. Sometimes they be passing by all night long, walking, muddy, raining. Oh, they had a terrible time. Colored people that's free ought to be awful thankful. And some of them is sorry they are free now. Some of them now would rather be slaves." },
    { time: 445, speaker: "Hermond Norwood", text: "Which had you rather be Uncle Fountain?" },
    { time: 455, speaker: "Fountain Hughes", text: "Me? Which I'd rather be ? [Norwood laughs]You know what I'd rather do? If I thought, had any idea, that I'd ever be a slave again, I'd take a gun and just end it all right away. Because you're nothing but a dog. You're not a thing but a dog. Night never comed out, you had nothing to do. Time to cut tobacco, if they want you to cut all night long out in the field, you cut. And if they want you to hang all night long, you hang, hang tobacco. It didn't matter about your tired, being tired. You're afraid to say you're tired. They just, well [voice trails off]." },
    { time: 465, speaker: "Hermond Norwood", text: "When, when did you come to Baltimore?" },
    { time: 475, speaker: "Fountain Hughes", text: "You know when, you don't remember when Garfield died, do you? When they, when they shot Garfield? No, I don't think you was born." },
    { time: 485, speaker: "Hermond Norwood", text: "I don't think I was then." },
    { time: 495, speaker: "Fountain Hughes", text: "No, you wasn't [overlaps with Hermond Norwood]. Well, I don't remember what year that was myself now, but I know you wasn't born. Well, I come to Baltimore that year anyhow. I don't remember what year it was now myself. But if I laid, if I was laying in the bed I could have remembered. But uh, I don't remember now." },
    { time: 505, speaker: "Hermond Norwood", text: "But did you go to work for Mr. S. when you came to Baltimore?" },
    { time: 515, speaker: "Fountain Hughes", text: "Oh no, no. I work for a man by the name of R. when I first come to Baltimore. I used to, I commence to haul manure for him. The old horses was here then. No elec, and no electric cars, and no cable cars. They were all horse cars. And I used to haul manure, go around to different stables, you know. Why people, everybody had horses for, for their use when I first come here. They had coachmen, and men to drive them around. Didn't have no, automobiles, they hadn't been here so long. And uh, and then they put on a cable car, what they call cable car. Well they run them for a little while, or maybe a couple or three years or four years. Then somebody invented the electric car. And that first run on North Avenue. Well, uh, that run a while and they kep't on inventing and inventing till they got them all, different kinds of cars, you know. It was, uh, horse cars. Wasn't no electric cars at all. Wasn't no, wasn' no big cars like they got now you know. I just can't, I just can't think of, uh, what year it was. But uh, [pause and then some unintelligible conversation]" },
    { time: 525, speaker: "Hermond Norwood", text: "You're not getting tired are you Uncle Fountain?" },
    { time: 535, speaker: "Fountain Hughes", text: "No, no I ain't. I'm just same as at home. Just like I was setting in the house. And uh, see what. I was thinking about oh, now you know how we served the Lord when I come along, a boy?" },
    { time: 545, speaker: "Hermond Norwood", text: "How was that?" },
    { time: 555, speaker: "Fountain Hughes", text: "We would go to somebody's house. And uh, well we didn't have no houses like they got now, you know. We had these what they call log cabin. And they have one, old colored man maybe one would be there, maybe he'd be as old as I am. And he'd be the preacher. Not as old as I am now, but, he'd be the preacher, and then we all sit down and listen at him talk about the Lord. Well, he'd say, well I wonder, uh, sometimes you say I wonder if we'll ever be free. Well, some of them would say, well, we going to go ask the Lord to free us. So they'd say, well, we, we going to sing \"One Day Shall I Ever Reach Heaven and One Day Shall I Fly.\" Then they would sing that for about a hour. Then they, next one they'd get up and say let's sing a song, \"We Gonna Live on Milk and Honey, Way By and By.\" They'd, they'd, oh I can hear them singing now but I can't, can't, uh, repeat it like I could in them days. But some day when I'm not hoarse, I could tell you, I could sing it for you, but I'm too hoarse now. And then we'd sing, [pause] \"I'm Gonna,\" \"I'm A-Gonna Sing Around the Altar.\" Oh, I, I wish I could, I wish I could sing it for you, \"I'm Gonna Sing Around the Altar.\"" },
    { time: 565, speaker: "Hermond Norwood", text: "Well I wish you could too. [overlaps with Fountain Hughes]." },
    { time: 575, speaker: "Fountain Hughes", text: "And they, they, well this, someday when you come over here and I'm not hoarse, you get me to come up here and I, I'll sing, I'll try to sing it for you." },
    { time: 585, speaker: "Hermond Norwood", text: "O. K. I'm going to do that." },
    { time: 595, speaker: "Fountain Hughes", text: "This is the. Now, I heard, people here now sing about \"Roll Jordan Roll.\" Well that's a old time, that's what the old people used to sing in old back days." },
    { time: 605, speaker: "Hermond Norwood", text: "Is that \"Roll Jordan Roll?\"" },
    { time: 615, speaker: "Fountain Hughes", text: "Yeah. But they don't sing it like the old people used to sing it in them day. They sing it quite different now. [pause] And, and another one they sing, \"By and By When the Morning Come.\" Well they sing that different too. But the old, they're getting the old people's song. I hear them come over the radio. I know them all just as good as they, but they sing them different." },
    { time: 625, speaker: "Hermond Norwood", text: "Have different names to some of them, huh?" },
    { time: 635, speaker: "Fountain Hughes", text: "[overlaps with Hermond Norwood] Yes. Well they cut them off shorter and all like that. It's a, if I had my voice, I would sing just one for you so you go in that [unintelligible] but I can't do it on account of my voice. But someday you come over here, you come in, you call me up and let me know and how my voice is. Ever since I took that medicine from my doctor, well it hurt my voice. I, I, I, now there was a preacher in my house the other night, he live right next door to me, and he played on the piano. And he played something and I sung it for him. And now he wants me to go down to his church next Sunday. I told him, I says, \"Now if I go down to your church, I'll not sing nothing. Because if I do I'll get ho, hoarse I can't talk.\" But he said, \"Brother Hughes, I don't care whether you sing or not. I just want you to go down there and let the people see who you are. Let them see what a, what a old people is.\" I said, \"Well uh, Reverend, why I'll, I'll be glad to go down with you.\" So, on next Sunday I'm going down to his church if I living, and nothing happen. But if he, if he sing something old, I, I, [laughs]." },
    { time: 645, speaker: "Hermond Norwood", text: "Just sing along." },
    { time: 655, speaker: "Fountain Hughes", text: "[Becomes excited, slapping noise in background] I feel, I feel the spirit now, but I can't, I got to keep quiet. Now you, do you ever hear this fellow that comes over the radio? I think they call him H. Comes on Sunday night about twelve o'clock, on WFBR?" },
    { time: 665, speaker: "Hermond Norwood", text: "No I don't know whether I've ever heard him or not." },
    { time: 675, speaker: "Fountain Hughes", text: "Well I, you turn him on. He comes on a quarter after eleven, on Sunday night. Well, you, you must have heard him cause he says, \"Can't uh, can't, can't keep a good man down.\" So, it makes so much noise, look like everybody ought to hear him. But now when that fellow comes around, I'm laying in the bed, don't you know, I get just so I got to be in that, because it's, it's all old time business." },
    { time: 685, speaker: "Hermond Norwood", text: "Uh um." },
    { time: 695, speaker: "Fountain Hughes", text: "And, uh, somebody don't like it. They says, \"I don't like H.\" I says, \"Why?\" \"Oh,\" he says, \"he make too much noise.\" I say, \"Well, well, the, the Bible say make a noise over Jesus? Jesus said make a noise over me, so he makes a noise over him.\" And I does enjoy certain of his show. Oh, he's oh everybody, he's got a big crowd and we just get so happy I got to do that too. [slapping noise in background] Boy, when you feel the grace of God you've got to jump up. I lay in bed, I got to get up. Have, you have to carry on. And then next morning I can't talk. [break on the tape for a new reel] Doctor gave me that medicine, it just tore me all to pieces." },
    { time: 705, speaker: "Hermond Norwood", text: "Uh huh, uh, I see. I sure hope it comes back again because I'd love, I'd like to hear you sing." },
    { time: 715, speaker: "Fountain Hughes", text: "Well old people used to say, \"Wonder If I Shall Ever Reach Heaven or Wonder Shall I Fly.\" I, I used to could sing it. I can sing, well sometimes I hear the spirit, you know and I may get to singing something again someday. People now, I [voice trails off]." },
    { time: 725, speaker: "Hermond Norwood", text: "Do you go to church every Sunday Uncle Fountain?" },
    { time: 735, speaker: "Fountain Hughes", text: "Uh uh. Don't go to church at all. I set and listen to the radio." },
    { time: 745, speaker: "Hermond Norwood", text: "Listen to it on the radio huh." },
    { time: 755, speaker: "Fountain Hughes", text: "Because I'll tell you why I don't go to church." },
    { time: 765, speaker: "Hermond Norwood", text: "You rather not have this on? Hm? You rather not tell me or you rather not have this on when you tell me?" },
    { time: 775, speaker: "Fountain Hughes", text: "It don't make any difference. I ain't going to say nothing wrong. I ain't going to [unintelligible]. If I, I, I, I say..." },
    { time: 785, speaker: "Narrator", text: "END OF TAPE" }
  ],
  ledbetter: [
    { time: 0, speaker: "John A. Lomax", text: "What was that you said, uh? What was that you said, uh, Uncle Bob?" },
    { time: 5, speaker: "Bob Ledbetter", text: "What about?" },
    { time: 8, speaker: "John A. Lomax", text: "Uh, then. I, the machine went off I didn't hear you." },
    { time: 12, speaker: "Bob Ledbetter", text: "I said I'm glad [Norris (?)]. got acquainted with you because I believe you is a good man and I want him to be with a good man ??? ." },
    { time: 22, speaker: "John A. Lomax", text: "Well, tell, tell me, where were you born Uncle Bob?" },
    { time: 26, speaker: "Bob Ledbetter", text: "I was born not far from this place. Up here south, uh, west of here. About five miles." },
    { time: 32, speaker: "John A. Lomax", text: "And how old are you?" },
    { time: 36, speaker: "Bob Ledbetter", text: "Well now uh, I told you about, oh, they say I'm seventy something, two or three. My daddy told me I was uh, nineteen years old on eight, on the eighteenth, of, uh, December. And that's all I can go by." },
    { time: 48, speaker: "John A. Lomax", text: "Eighteenth of Decem, December when?" },
    { time: 51, speaker: "Bob Ledbetter", text: "Well, 1880." },
    { time: 54, speaker: "John A. Lomax", text: "Yeah. And you, you don't know to figure how much that is, that makes you now?" },
    { time: 58, speaker: "Bob Ledbetter", text: "No sir. I'm a poor figurer." },
    { time: 62, speaker: "John A. Lomax", text: "Uh, you told me, uh, uh, you told me a story or two about yourself and about your father as we came along. What were they?" },
    { time: 70, speaker: "Bob Ledbetter", text: "Well they, mention it so I know what you talking about and I can start it over again I reckon." },
    { time: 74, speaker: "John A. Lomax", text: "Well, was your father a songster like you?" },
    { time: 80, speaker: "Bob Ledbetter", text: "Nothing but old hymns, hymns. He was regular church man." },
    { time: 82, speaker: "John A. Lomax", text: "Well what kind of songs did you sing when you were young?" },
    { time: 85, speaker: "Bob Ledbetter", text: "Well, I didn't, just hollered reels, just fiddle and reels, you know, all the time, my singing." },
    { time: 87, speaker: "John A. Lomax", text: "Was it, were you a fiddler yourself?" },
    { time: 90, speaker: "Bob Ledbetter", text: "No sir, no sir. I couldn't make no music at all." },
    { time: 92, speaker: "John A. Lomax", text: "Well you could make music with your mouth." },
    { time: 94, speaker: "Bob Ledbetter", text: "Oh yes sir, I could do that. I sure would do that. Everywhere you hears me you hear me singing a song, a reel." },
    { time: 97, speaker: "John A. Lomax", text: "And out in the field what did you do when you were working?" },
    { time: 99, speaker: "Bob Ledbetter", text: "That's what I'd do. Hollering, singing reels." },
    { time: 101, speaker: "John A. Lomax", text: "And, and what was it you sang about, the cotton?" },
    { time: 104, speaker: "Bob Ledbetter", text: "About uh, little Joe?" },
    { time: 106, speaker: "John A. Lomax", text: "Yeah." },
    { time: 109, speaker: "Bob Ledbetter", text: "[recites] Little Joe, my Sam told me to pick a little cotton, the boy says don't for the seeds all rotten." },
    { time: 111, speaker: "John A. Lomax", text: "I said just like you did to me in the car and say it louder." },
    { time: 113, speaker: "Bob Ledbetter", text: "[laughs] [starts to sing]" },
    { time: 116, speaker: "Narrator", text: "My Sam told me to pick a little cotton." },
    { time: 118, speaker: "Narrator", text: "My boy says don't, the seeds all rotten. Get out off the way, old Dan Tucker, Come too late to get your supper. I don't remember, I never did sing it." },
    { time: 120, speaker: "John A. Lomax", text: "Well how, how did you tell me you used to call your sweetheart out at night?" },
    { time: 123, speaker: "Bob Ledbetter", text: "Let me see, I'm near forgot what I was to holler, what sort of holler. [John A. Lomax interrupts]" },
    { time: 125, speaker: "John A. Lomax", text: "And holler." },
    { time: 128, speaker: "Bob Ledbetter", text: "Just tell me one word of it so I'll know what you talking about." },
    { time: 130, speaker: "John A. Lomax", text: "You said you didn't have any starch or soap." },
    { time: 132, speaker: "Bob Ledbetter", text: "Yeah. [starts to sing] No soap." },
    { time: 135, speaker: "John A. Lomax", text: "Louder. Sing it louder." },
    { time: 137, speaker: "Bob Ledbetter", text: "No soap, no starch. Nobody, nobody to wash my clothes, nobody to wash my clothes. I hate to sing to anybody. My voice, it, it broke." },
    { time: 139, speaker: "John A. Lomax", text: "Well uh, didn't you say you used to sing that in the field too?" },
    { time: 142, speaker: "Bob Ledbetter", text: "Yeah I sing that in the field too. Yes sir." },
    { time: 144, speaker: "John A. Lomax", text: "Would your sweetheart be out there in the field?" },
    { time: 147, speaker: "Bob Ledbetter", text: "No, she'd be enjoining [enjoying], enjoining fields you know." },
    { time: 149, speaker: "John A. Lomax", text: "Uh huh. Well what was some of the other old field hollers that you used to have???" },
    { time: 151, speaker: "Bob Ledbetter", text: "[starts to sing] I'm going home. I'm going home. I'm going home. That was one of them." },
    { time: 154, speaker: "John A. Lomax", text: "Well when you wanted to, when you wanted to summon a boy from across the creek way far off, how would you, how would you notify him?" },
    { time: 156, speaker: "Bob Ledbetter", text: "I just holler that holler, you hear me a-hollering. And he'd answer me way over yonder." },
    { time: 158, speaker: "John A. Lomax", text: "Well what was, what was the holler?" },
    { time: 161, speaker: "Bob Ledbetter", text: "That same thing I was singing. [starts to sing] No soap, no starch," },
    { time: 163, speaker: "Narrator", text: "Nobody to wash my clothes, nobody to wash my clothes. That same old holler. And he'd answer me way out at his field." },
    { time: 166, speaker: "Ruby T. Lomax", text: "What'd he say?" },
    { time: 168, speaker: "Bob Ledbetter", text: "Ma'am?" },
    { time: 170, speaker: "John A. Lomax", text: "What would he say?" },
    { time: 173, speaker: "Bob Ledbetter", text: "Well he'd sing the same thing." },
    { time: 175, speaker: "John A. Lomax", text: "And how would he sing it? Sing it like he did." },
    { time: 177, speaker: "Bob Ledbetter", text: "[starts to sing]" },
    { time: 180, speaker: "Narrator", text: "No soap, no starch," },
    { time: 182, speaker: "Narrator", text: "Nobody to wash my clothes, nobody to wash my clothes. And if he took a notion then he'd say: [sings] I'm going home. I'm going home. I'm going home." },
    { time: 185, speaker: "Narrator", text: "I knowed that he's coming soon as he got supper. At the white folk kitchen [laughs] I looking for him." },
    { time: 187, speaker: "John A. Lomax", text: "Now you told me about the, the man that you worked for, for ten or twelve years." },
    { time: 189, speaker: "Bob Ledbetter", text: "Mr. [Norris (?)]" },
    { time: 192, speaker: "John A. Lomax", text: "Yeah, and you said he was the meanest man in the country." },
    { time: 194, speaker: "Bob Ledbetter", text: "Well they said so. Them [Norris' (?)] would work for the meanest people there was around." },
    { time: 196, speaker: "John A. Lomax", text: "Well, how'd they treat you?" },
    { time: 199, speaker: "Bob Ledbetter", text: "They treat me all right. Nary a one of them never did cuss at me the whole twelve year. And didn't care what I went to them for, I got it. Barrels of flour, middlings of meat, kegs of molasses, money any time. Now that [Judge Norris (?)], that was the oldest boy. And his store would be full of hands you know, and he wouldn't want them all to know what he's doing. I just tell him, give me [your (?)] pencil and piece of paper. He'd hand it to me and I'd write on there, I'd tell him I want five dollar, please sir. I'd hand it to him and go on about my business. First thing you know he'd come on by me, touch me, and give it to me. He'd do me that-a-way just as sure as he is, just as sure as I'm living." },
    { time: 201, speaker: "John A. Lomax", text: "Well now what was it the old merchant, what was it the old merchant told you? You told the old merchant down here that ???" },
    { time: 204, speaker: "Bob Ledbetter", text: "Uh, Mr. [John A. Lomax interrupts]" },
    { time: 206, speaker: "John A. Lomax", text: "[Morinfort (?)]." },
    { time: 208, speaker: "Bob Ledbetter", text: "Me and him was talking now one day and uh, wasn't nobody in there but me." },
    { time: 211, speaker: "John A. Lomax", text: "Now say exactly what you said now." },
    { time: 213, speaker: "Bob Ledbetter", text: "Yes sir. Wasn't nobody in there but me and him and his son and his son's daughter. And I say \"Mr. C.,\" I forgot what just exactly how old I was, but anyhow I said, \"I'm sixty-one or two years old, and I never had no trouble in my life.\" I say \"I never ask the [Norris' (?)] for a nickel what they didn't give it to me, in my life and nary a one of them never did cuss at me.\" And say \"I ain't never been summoned and ain't never been arrested, and ain't never been to the jail house but twice in my life and I ain't been to the courthouse but twice.\" He, he looked at me and he cussed. He said, \"Well, Bob, I be damn if that ain't too much for a nigga to say.\" Said \"there ain't nary a white man can say any better than that.\" Said, \"There ain't.\" I say, \"Well, I'm telling you the truth,\" I say, \"You can ask these people all around [Morinfort (?)] that know me, and they'll tell you I ain't never been no trouble since I been there.\"" },
    { time: 215, speaker: "John A. Lomax", text: "Well you said you hadn't been in, to the jailhouse but twice. Did they put you in jail twice?" },
    { time: 218, speaker: "Bob Ledbetter", text: "No sir, no sir, just went by there." },
    { time: 220, speaker: "John A. Lomax", text: "Went by the jail." },
    { time: 223, speaker: "Bob Ledbetter", text: "Down the street, yes." },
    { time: 225, speaker: "John A. Lomax", text: "Well when you had friends in jail, didn't you go see them?" },
    { time: 227, speaker: "Bob Ledbetter", text: "I didn't go see them because I always said practice makes perfect. [laughs] I was proud I said so, and I just wouldn't go to see them. I says no I ain't going see them. I said practice makes perfect. I ain't going there. Well Lord knows I'm telling you the truth what I said." },
    { time: 230, speaker: "John A. Lomax", text: "Uh, uh, how much, how much school did you go to?" },
    { time: 232, speaker: "Bob Ledbetter", text: "I never went to school a day in my life, not a hour. [someone enters the room]" },
    { time: 234, speaker: "Narrator", text: "Hey, hey, hey, hey, howdy, howdy, howdy, howdy." },
    { time: 237, speaker: "Unidentified Person", text: "Is that you?" },
    { time: 239, speaker: "Bob Ledbetter", text: "Yeah. How you folks feel?" },
    { time: 242, speaker: "Unidentified Person", text: "All right." },
    { time: 244, speaker: "Ruby T. Lomax", text: "We're gonna have to get some more chairs." },
    { time: 246, speaker: "Bob Ledbetter", text: "Well Nora here can tell you I never went to school a hour in my life." },
    { time: 249, speaker: "Ruby T. Lomax", text: "See if I can get you a chair." },
    { time: 251, speaker: "John A. Lomax", text: "Well is it still running here?" },
    { time: 253, speaker: "Ruby T. Lomax", text: "Yeah." },
    { time: 256, speaker: "Bob Ledbetter", text: "Well go ahead. Talk to Nora" },
    { time: 258, speaker: "John A. Lomax", text: "So you never went to ??? ." },
    { time: 261, speaker: "Bob Ledbetter", text: "I, I say, he can tell you, I never went to school a hour in my life." },
    { time: 263, speaker: "John A. Lomax", text: "Uh huh." },
    { time: 265, speaker: "Bob Ledbetter", text: "Not a hour." },
    { time: 268, speaker: "John A. Lomax", text: "Well, you, you, then could you read and write?" },
    { time: 270, speaker: "Bob Ledbetter", text: "I could read and write too. I do, I can send a letter all over this world if I just knowed where to send it. Course I can't write it pretty like people do do, but anywhere I know where to send it, I can send it." },
    { time: 272, speaker: "John A. Lomax", text: "Well, uh, how did you learn to write?" },
    { time: 275, speaker: "Bob Ledbetter", text: "Well my daddy just taught me how to spell a little at night. Well after that then he kept, uh, copies, and I take copies and just learn myself." },
    { time: 277, speaker: "John A. Lomax", text: "And how you learn to read?" },
    { time: 280, speaker: "Bob Ledbetter", text: "Well he learn me at night. He said he, he wasn't no educated man. He could just read printing. And he set up at night and teach his children. That's the way we learned." },
    { time: 282, speaker: "John A. Lomax", text: "I heard a story about, uh, a judge asking a colored boy on the witness stand, he said, uh, \"Jim, can you read writing?\" He said, \"No sir, Judge. I can't even read reading.\" [all laugh] But you can read reading and writing both." },
    { time: 284, speaker: "Bob Ledbetter", text: "Yes sir. [coughing in background] They had a, they had a preacher treated us fine. He could make a, uh, preacher out of him. And they ask him could he, did he know, did he know theology. He said, \"No sir, I never knowed that man in my life. I, I never have been acquainted with him.\" [laughs] So I don't know, knownothing about no, nothing like that." },
    { time: 287, speaker: "John A. Lomax", text: "Uh, how old were you when you joined the church?" },
    { time: 289, speaker: "Bob Ledbetter", text: "I was, uh, uh, nineteen years old." },
    { time: 291, speaker: "John A. Lomax", text: "And how old were you when you got married?" },
    { time: 294, speaker: "Bob Ledbetter", text: "I was, uh, just, just in my twenty. Just started in my twenties." },
    { time: 296, speaker: "John A. Lomax", text: "Well did your wife make you join the church?" },
    { time: 299, speaker: "Bob Ledbetter", text: "No sir. Just joined myself. Just took a notion and join myself." },
    { time: 301, speaker: "John A. Lomax", text: "Well how have you got along so well in life? What, what, what, what's been your principles?" },
    { time: 303, speaker: "Bob Ledbetter", text: "Well people around, ask the people, anybody you know around here, ask them about my principles. I just went on, just knowed, I just ??? knowed what was right to do and I always try to do what's right." },
    { time: 306, speaker: "John A. Lomax", text: "Well that's a mighty good way to do Uncle Bob." },
    { time: 308, speaker: "Bob Ledbetter", text: "Yes sir, I know what's right and I tried my best to do what's right in everything I do." },
    { time: 310, speaker: "John A. Lomax", text: "How many times have you voted?" },
    { time: 313, speaker: "Bob Ledbetter", text: "Ain't voted but twice. Vote for whiskey once and voted President election once." },
    { time: 315, speaker: "John A. Lomax", text: "What President election?" },
    { time: 318, speaker: "Narrator", text: "END OF SIDE A" }
  ],
};
