// roomPollCore — pure tally for room polls. Votes live one-doc-per-voter at
// rooms/{roomId}/polls/{pollId}/votes/{uid} = { uid, choice, at } (self-write only in rules),
// so nobody can overwrite anyone else's vote; tallies are computed on the client from that set.

export interface RoomPollVote { uid: string; choice: number; at?: number }

export interface PollTally {
  counts: number[];        // per option index
  total: number;           // valid votes counted
  myChoice: number | null; // the viewer's own choice, if any
  leader: number | null;   // index of the top option (null on no votes / tie at top)
}

export function tallyPollVotes(votes: RoomPollVote[], optionCount: number, myUid?: string | null): PollTally {
  const n = Math.max(0, Math.floor(optionCount));
  const counts = new Array<number>(n).fill(0);
  const byUid = new Map<string, number>();
  for (const v of votes) {
    if (!v || typeof v.uid !== 'string' || !v.uid) continue;
    const c = v.choice;
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= n) continue;
    byUid.set(v.uid, c); // one vote per uid (last wins)
  }
  for (const c of byUid.values()) counts[c]++;
  let leader: number | null = null; let best = 0; let tie = false;
  counts.forEach((c, i) => {
    if (c > best) { best = c; leader = i; tie = false; } else if (c === best && c > 0) tie = true;
  });
  return {
    counts,
    total: byUid.size,
    myChoice: myUid ? (byUid.get(myUid) ?? null) : null,
    leader: tie ? null : leader,
  };
}

export const pollPercent = (count: number, total: number): number =>
  total > 0 ? Math.round((count / total) * 100) : 0;
