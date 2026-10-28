// Lab-only stand-in for services/meetings/meetingRecording: real pure logic, sample recording + captions.
export * from '../../services/meetings/meetingRecording';
import { rulesRecap, allowanceFor, type CaptionLine, type MeetingRecording, type MeetingRecap } from '../../services/meetings/meetingRecordingCore';

const t0 = Date.now() - 2 * 60 * 60 * 1000;
export const LAB_RECORDING: MeetingRecording = {
  id: 'lab-rec', hostUid: 'lab-me', hostName: 'Kenne', title: 'Worship Team · Oct 28', mode: 'CLOUD', kind: 'AUDIO',
  status: 'ENDED', startedAt: t0, endedAt: t0 + 1_742_000, durationSec: 1742, sizeBytes: 7_100_000, segmentUrls: [],
  expiresAt: t0 + 30 * 86_400_000,
};
const L = (uid: string, name: string, s: number, text: string): CaptionLine => ({ uid, name, at: s * 1000, text });
export const LAB_CAPTIONS: CaptionLine[] = [
  L('lab-me', 'Kenne', 4, 'Thanks for jumping on, everyone. Quick one tonight.'),
  L('lab-dana', 'Dana Reyes', 12, 'The set list for Sunday is in the shared folder. We are opening with Way Maker.'),
  L('lab-sam', 'Sam Okafor', 31, 'Can we move rehearsal to 6:30? Traffic on Thursdays is rough.'),
  L('lab-dana', 'Dana Reyes', 44, 'We decided to move rehearsal to 6:30 then. I will send the new schedule by Friday.'),
  L('lab-me', 'Kenne', 71, 'Sam, can you bring the extra mic stands to the youth room?'),
  L('lab-sam', 'Sam Okafor', 80, 'Yes, I will drop them off Saturday morning.'),
];
export const listenRecordings = (_roomId: string, cb: (r: MeetingRecording[]) => void) => { cb([LAB_RECORDING]); return () => {}; };
export const getRecording = async () => LAB_RECORDING;
export const loadCaptions = async () => LAB_CAPTIONS;
export const myRecordingAllowance = async () => allowanceFor(false);
export const availableRecapLanes = async () => ({ local: false, cloud: true });
export const writeRecap = async (_t: string, lines: CaptionLine[]): Promise<MeetingRecap> => rulesRecap(lines);
export const publishRecap = async () => {};
