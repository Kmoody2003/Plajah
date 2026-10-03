/**
 * Math in context — the same arithmetic, algebra and growth models students already practice, but
 * taught THROUGH running a small shop, making music and making film, from preschool to grade 12.
 * The idea (Kenne's brief): math is learned fastest when it does a job, so money and enterprise
 * start with the first coin, and music and film supply real ratios, rates and budgets.
 *
 * Every generator returns a PracticeItem with a worked explanation and a `connect` pointer to the
 * Plajah school where that idea lives (School of Money, Business School, Melos, Film School...), so
 * a learner who just worked out a break-even point can step straight into the Business School.
 * Pure and dependency-free so it can be unit-tested.
 */
import type { PracticeItem } from '../components/learn/PracticeView';

type Rng = () => number;
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const sh = <T,>(r: Rng, a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const cents = (n: number) => `${n}¢`;

export type ContextBand = 'prek2' | 'g35' | 'g68' | 'g912';
export type ContextTopic = 'shop' | 'music' | 'film' | 'sports';

export interface ContextSkill {
  id: string; band: ContextBand; topic: ContextTopic; title: string;
  /** Shown under the skill: where this idea lives in the real world. */
  realWorld: string;
  gen: (r: Rng, n: number) => PracticeItem;
}

const L_MONEY = { label: 'School of Money', view: 'MONEY_SCHOOL' };
const L_BIZ = { label: 'Business School', view: 'BUSINESS_SCHOOL' };
const L_MUSIC = { label: 'Music history in Chora', view: 'MUSIC' };
const L_FILM = { label: 'Film School', view: 'FILM_SCHOOL' };
const L_SPORT = { label: 'Plajah Sports', view: 'PLAJAH_SPORTS' };

function mc(r: Rng, id: string, prompt: string, right: string, wrong: string[], explanation: string, hint: string, level: 1 | 2 | 3, connect?: { label: string; view: string }): PracticeItem {
  const uniq = [...new Set(wrong.filter(w => w !== right))];
  let pad = 1;
  while (uniq.length < 3) { uniq.push(`${right} (${pad++})`); }
  const choices = sh(r, [right, ...uniq.slice(0, 3)]);
  return { id, prompt, choices, answer: choices.indexOf(right), hint, explanation, level, connect };
}

export const CONTEXT_SKILLS: ContextSkill[] = [
  // ───────────── PreK-2: Little Shop ─────────────
  { id: 'ls-coins', band: 'prek2', topic: 'shop', title: 'Counting pennies at the shop', realWorld: 'Every shop starts with counting money.', gen: (r, n) => {
    const a = ri(r, 1, 6), b = ri(r, 1, 6), item = pick(r, ['apple', 'sticker', 'cookie', 'pencil']);
    return mc(r, `ls1.${n}`, `At the Little Shop, a ${item} costs ${cents(a + b)}. You have ${a} pennies and ${b} more pennies. How many pennies is that in all?`, `${a + b}`, [`${a + b + 1}`, `${Math.max(1, a + b - 1)}`, `${a}`], `${a} + ${b} = ${a + b} pennies. That is exactly enough for the ${item}.`, 'Count the first group, then count on with the second.', 1, L_MONEY);
  } },
  { id: 'ls-coin-values', band: 'prek2', topic: 'shop', title: 'Nickels and dimes', realWorld: 'Coins have different values, so a shop can make change.', gen: (r, n) => {
    const kind = ri(r, 0, 2);
    if (kind === 0) { const k = ri(r, 2, 4); return mc(r, `ls2.${n}`, `A nickel is worth 5 cents. How many cents are ${k} nickels?`, `${5 * k}`, [`${5 * k + 5}`, `${k + 5}`, `${5 * k - 5}`], `Count by fives: ${Array.from({ length: k }, (_, i) => 5 * (i + 1)).join(', ')}. So ${k} nickels = ${5 * k} cents.`, 'Skip count by 5.', 1, L_MONEY); }
    if (kind === 1) { const k = ri(r, 2, 5); return mc(r, `ls2.${n}`, `A dime is worth 10 cents. How many cents are ${k} dimes?`, `${10 * k}`, [`${10 * k + 10}`, `${k + 10}`, `${10 * k - 10}`], `Count by tens: ${Array.from({ length: k }, (_, i) => 10 * (i + 1)).join(', ')}. So ${k} dimes = ${10 * k} cents.`, 'Skip count by 10.', 1, L_MONEY); }
    return mc(r, `ls2.${n}`, 'Which is worth more: 1 dime or 1 nickel?', '1 dime', ['1 nickel', 'They are worth the same', 'You cannot tell'], 'A dime is worth 10 cents and a nickel is worth 5 cents, so the dime is worth more.', 'Which coin is worth more cents?', 1, L_MONEY);
  } },
  { id: 'ls-compare', band: 'prek2', topic: 'shop', title: 'Which costs more?', realWorld: 'Shoppers compare prices; sellers choose them.', gen: (r, n) => {
    const a = ri(r, 2, 9); let b = ri(r, 2, 9); if (b === a) b = a + 1;
    const [x, y] = sh(r, ['apple', 'pear', 'banana', 'orange']);
    const ans = a > b ? x : y;
    return mc(r, `ls3.${n}`, `At the Little Shop, the ${x} costs ${cents(a)} and the ${y} costs ${cents(b)}. Which one costs MORE?`, ans, [a > b ? y : x, 'They cost the same', 'Neither'], `${Math.max(a, b)} is bigger than ${Math.min(a, b)}, so the ${ans} costs more.`, 'Which number is bigger?', 1, L_MONEY);
  } },
  { id: 'ls-sell', band: 'prek2', topic: 'shop', title: 'How many did we sell?', realWorld: 'Counting sales shows a seller what people want.', gen: (r, n) => {
    const a = ri(r, 2, 9), b = ri(r, 2, 9), what = pick(r, ['cups of lemonade', 'cookies', 'paintings', 'bracelets']);
    return mc(r, `ls4.${n}`, `Your stand sold ${a} ${what} in the morning and ${b} in the afternoon. How many ${what} did you sell?`, `${a + b}`, [`${a + b + 1}`, `${Math.abs(a - b) || 1}`, `${a + b - 1}`], `${a} + ${b} = ${a + b}.`, 'Put the two groups together.', 1, L_BIZ);
  } },
  { id: 'ls-beats', band: 'prek2', topic: 'music', title: 'Beats in the drum circle', realWorld: 'Music is counting: every song has a steady number of beats.', gen: (r, n) => {
    const per = pick(r, [2, 3, 4]), bars = ri(r, 2, 5);
    return mc(r, `ls5.${n}`, `The drum plays ${per} beats in every bar. How many beats are in ${bars} bars?`, `${per * bars}`, [`${per * bars + per}`, `${per + bars}`, `${per * bars - 1}`], `${bars} groups of ${per} is ${per * bars}. Count by ${per}s: ${Array.from({ length: bars }, (_, i) => per * (i + 1)).join(', ')}.`, `Count by ${per}s once for each bar.`, 1, L_MUSIC);
  } },

  // ───────────── Grades 3-5: Market Day ─────────────
  { id: 'md-total', band: 'g35', topic: 'shop', title: 'Total cost at the class store', realWorld: 'Multiplication is how every checkout adds up.', gen: (r, n) => {
    const q = ri(r, 3, 9), p = ri(r, 2, 8), item = pick(r, ['notebooks', 'bracelets', 'plant pots', 'posters']);
    return mc(r, `md1.${n}`, `At Market Day, ${item} cost ${money(p)} each. How much do ${q} ${item} cost?`, money(p * q), [money(p * q + p), money(p + q), money(p * q - p)], `${q} × ${money(p)} = ${money(p * q)}.`, 'Multiply the number of items by the price of one.', 1, L_MONEY);
  } },
  { id: 'md-change', band: 'g35', topic: 'shop', title: 'Making change', realWorld: 'A cashier subtracts to give the right change.', gen: (r, n) => {
    const paid = pick(r, [10, 20, 20, 50]), cost = ri(r, 2, paid - 1) + pick(r, [0, 0.5, 0.25, 0.75]);
    const c = Math.round((paid - cost) * 100) / 100;
    return mc(r, `md2.${n}`, `A customer buys a ${money(cost)} item and pays with ${money(paid)}. How much change do they get back?`, money(c), [money(Math.round((c + 1) * 100) / 100), money(Math.round((c - 1) * 100) / 100), money(Math.round((paid + cost) * 100) / 100)], `${money(paid)} - ${money(cost)} = ${money(c)}.`, 'Subtract the cost from what they paid.', 2, L_MONEY);
  } },
  { id: 'md-profit', band: 'g35', topic: 'shop', title: 'Profit: what is left over', realWorld: 'Profit is money earned minus what it cost to make.', gen: (r, n) => {
    const q = ri(r, 6, 20), p = ri(r, 2, 6), cost = ri(r, 5, q * p - 4), what = pick(r, ['friendship bracelets', 'lemonade cups', 'painted rocks', 'cookies']);
    return mc(r, `md3.${n}`, `You sell ${q} ${what} for ${money(p)} each. The supplies cost you ${money(cost)}. What is your profit?`, money(q * p - cost), [money(q * p), money(q * p + cost), money(Math.abs(q * p - cost - p) || 1)], `Money earned: ${q} × ${money(p)} = ${money(q * p)}. Profit = earned - cost = ${money(q * p)} - ${money(cost)} = ${money(q * p - cost)}.`, 'First find all the money you earned, then take away the cost.', 2, L_BIZ);
  } },
  { id: 'md-notes', band: 'g35', topic: 'music', title: 'Fractions of a beat', realWorld: 'Rhythm is fractions: a quarter note is one beat, an eighth note is half a beat.', gen: (r, n) => {
    const kind = ri(r, 0, 1), b = ri(r, 2, 5);
    if (kind === 0) return mc(r, `md4.${n}`, `A quarter note lasts 1 beat and an eighth note lasts half a beat. How many eighth notes fill ${b} beats?`, `${b * 2}`, [`${b}`, `${b * 4}`, `${b * 2 + 1}`], `Each beat holds 2 eighth notes, so ${b} beats hold ${b} × 2 = ${b * 2}.`, 'How many halves make one whole?', 2, L_MUSIC);
    return mc(r, `md4.${n}`, `A whole note lasts 4 beats. How many quarter notes (1 beat each) fit in ${b} whole notes?`, `${4 * b}`, [`${b}`, `${4 * b + 4}`, `${4 + b}`], `${b} whole notes × 4 beats = ${4 * b} beats, and each quarter note is 1 beat, so ${4 * b} quarter notes.`, 'One whole note is the same as how many quarter notes?', 2, L_MUSIC);
  } },
  { id: 'md-tickets', band: 'g35', topic: 'film', title: 'Film night ticket sales', realWorld: 'Event revenue is tickets times price.', gen: (r, n) => {
    const t = ri(r, 20, 80), p = pick(r, [2, 3, 4, 5]);
    return mc(r, `md5.${n}`, `Your school film night sells ${t} tickets at ${money(p)} each. How much money do you collect?`, money(t * p), [money(t * p + p * 10), money(t + p), money(t * p - p * 10)], `${t} × ${money(p)} = ${money(t * p)}.`, 'Multiply tickets by the price of one ticket.', 2, L_FILM);
  } },

  // ───────────── Grades 6-8: Small business ─────────────
  { id: 'bm-markup', band: 'g68', topic: 'shop', title: 'Percent markup', realWorld: 'Shops add a percent to what an item costs them.', gen: (r, n) => {
    const cost = pick(r, [20, 40, 50, 80, 100, 120]), pct = pick(r, [10, 20, 25, 50]), price = cost + (cost * pct) / 100;
    return mc(r, `bm1.${n}`, `A shop buys a hoodie for ${money(cost)} and adds a ${pct}% markup. What is the selling price?`, money(price), [money(cost + pct), money(cost * pct / 100), money(price + cost * pct / 100)], `Markup = ${pct}% of ${money(cost)} = ${money(cost * pct / 100)}. Price = ${money(cost)} + ${money(cost * pct / 100)} = ${money(price)}.`, 'Find the percent of the cost, then add it to the cost.', 2, L_BIZ);
  } },
  { id: 'bm-discount', band: 'g68', topic: 'shop', title: 'Sale prices', realWorld: 'A discount is a percent taken off the price.', gen: (r, n) => {
    const price = pick(r, [20, 30, 40, 60, 80, 120]), pct = pick(r, [10, 20, 25, 30, 50]), sale = price - (price * pct) / 100;
    return mc(r, `bm2.${n}`, `A ${money(price)} item is ${pct}% off. What is the sale price?`, money(sale), [money(price * pct / 100), money(price - pct), money(price + price * pct / 100)], `Discount = ${pct}% of ${money(price)} = ${money(price * pct / 100)}. Sale price = ${money(price)} - ${money(price * pct / 100)} = ${money(sale)}.`, 'Work out the discount first, then subtract it.', 2, L_MONEY);
  } },
  { id: 'bm-breakeven', band: 'g68', topic: 'shop', title: 'Break-even point', realWorld: 'A business has to sell enough to cover its costs before it earns a profit.', gen: (r, n) => {
    const per = ri(r, 2, 6), price = per + ri(r, 2, 6), units = ri(r, 10, 40), fixed = (price - per) * units;
    return mc(r, `bm3.${n}`, `You spend ${money(fixed)} on a market stall. Each item costs ${money(per)} to make and sells for ${money(price)}. How many items must you sell to break even?`, `${units}`, [`${units + 5}`, `${Math.max(1, units - 5)}`, `${Math.round(fixed / price)}`], `Each sale leaves ${money(price)} - ${money(per)} = ${money(price - per)} toward the stall. ${money(fixed)} ÷ ${money(price - per)} = ${units} items.`, 'How much does each sale contribute after making the item?', 3, L_BIZ);
  } },
  { id: 'bm-bpm', band: 'g68', topic: 'music', title: 'Tempo and song length', realWorld: 'Producers use beats per minute to plan a track.', gen: (r, n) => {
    const bpm = pick(r, [60, 80, 90, 100, 120, 140]), mins = ri(r, 2, 5), beats = bpm * mins;
    return mc(r, `bm4.${n}`, `A song is played at ${bpm} beats per minute. How many beats are in a ${mins}-minute song?`, `${beats}`, [`${beats + bpm}`, `${bpm + mins}`, `${Math.round(beats / 2)}`], `Beats = tempo × minutes = ${bpm} × ${mins} = ${beats}.`, 'Multiply beats per minute by the number of minutes.', 2, L_MUSIC);
  } },
  { id: 'bm-ratio', band: 'g68', topic: 'music', title: 'Frequency ratios: octaves and fifths', realWorld: 'Musical intervals are whole-number ratios of frequency (an octave is 2:1, a fifth is 3:2).', gen: (r, n) => {
    const f = pick(r, [110, 220, 330, 440]), oct = ri(r, 0, 1) === 0;
    if (oct) return mc(r, `bm5.${n}`, `A note vibrates at ${f} Hz. The note an octave higher has twice the frequency. What is its frequency?`, `${f * 2} Hz`, [`${f + 2} Hz`, `${f / 2} Hz`, `${f * 3} Hz`], `An octave is a 2:1 ratio, so ${f} × 2 = ${f * 2} Hz.`, 'Octave means double.', 2, L_MUSIC);
    return mc(r, `bm5.${n}`, `A perfect fifth above a ${f} Hz note has a frequency in the ratio 3:2. What is it?`, `${(f * 3) / 2} Hz`, [`${f * 2} Hz`, `${f + 3} Hz`, `${(f * 2) / 3} Hz`], `Multiply by 3/2: ${f} × 3 ÷ 2 = ${(f * 3) / 2} Hz.`, 'Multiply by 3, then divide by 2.', 3, L_MUSIC);
  } },
  { id: 'bm-frames', band: 'g68', topic: 'film', title: 'Frames per second', realWorld: 'Film runs at 24 frames per second; editors count frames to time every cut.', gen: (r, n) => {
    const fps = pick(r, [24, 24, 30, 25]), secs = ri(r, 3, 12), frames = fps * secs;
    return mc(r, `bm6.${n}`, `A film runs at ${fps} frames per second. How many frames are in a ${secs}-second shot?`, `${frames}`, [`${frames + fps}`, `${fps + secs}`, `${frames - secs}`], `${fps} frames × ${secs} seconds = ${frames} frames.`, 'Multiply frames per second by the seconds.', 2, L_FILM);
  } },

  // ───────────── Grades 9-12: Venture math ─────────────
  { id: 'vm-profit-line', band: 'g912', topic: 'shop', title: 'Profit as a linear function', realWorld: 'A business model is a line: profit = (price - cost) x units - fixed costs.', gen: (r, n) => {
    const price = ri(r, 8, 20), v = ri(r, 2, 7), F = ri(r, 3, 12) * 10, x = ri(r, 15, 60), P = (price - v) * x - F;
    return mc(r, `vm1.${n}`, `A founder sells a product for ${money(price)}. It costs ${money(v)} to make, and fixed costs are ${money(F)}. What is the profit on ${x} units?`, money(P), [money((price - v) * x), money(price * x - F), money(P + F)], `Profit = (${money(price)} - ${money(v)})(${x}) - ${money(F)} = ${money((price - v) * x)} - ${money(F)} = ${money(P)}.`, 'Per-unit profit times units, then subtract fixed costs.', 3, L_BIZ);
  } },
  { id: 'vm-compound', band: 'g912', topic: 'shop', title: 'Compound growth', realWorld: 'Money (and audiences) grow by a percent each period, so growth compounds.', gen: (r, n) => {
    const P = pick(r, [500, 1000, 2000, 5000]), rate = pick(r, [5, 10, 20]), t = ri(r, 2, 3), A = Math.round(P * Math.pow(1 + rate / 100, t) * 100) / 100;
    return mc(r, `vm2.${n}`, `You invest ${money(P)} at ${rate}% interest, compounded yearly. How much do you have after ${t} years?`, money(A), [money(P + (P * rate * t) / 100), money(Math.round(P * Math.pow(1 + rate / 100, t + 1) * 100) / 100), money(P * t)], `A = P(1 + r)^t = ${P}(${(1 + rate / 100).toFixed(2)})^${t} = ${money(A)}. Simple interest would only give ${money(P + (P * rate * t) / 100)}.`, 'Multiply by 1 + the rate once for each year.', 3, L_MONEY);
  } },
  { id: 'vm-audience', band: 'g912', topic: 'music', title: 'Exponential audience growth', realWorld: 'A song or channel that doubles its audience again and again grows exponentially.', gen: (r, n) => {
    const s = pick(r, [50, 100, 200, 500]), t = ri(r, 3, 5), v = s * Math.pow(2, t);
    return mc(r, `vm3.${n}`, `A band has ${s} monthly listeners and the number doubles every month. How many listeners after ${t} months?`, `${v}`, [`${s * t}`, `${s + 2 * t}`, `${s * Math.pow(2, t + 1)}`], `${s} × 2^${t} = ${s} × ${Math.pow(2, t)} = ${v}.`, 'Doubling t times means multiplying by 2^t.', 3, L_MUSIC);
  } },
  { id: 'vm-margin', band: 'g912', topic: 'shop', title: 'Gross margin', realWorld: 'Margin tells you what share of each sale is left after the direct cost.', gen: (r, n) => {
    const rev = pick(r, [200, 400, 500, 800, 1000]), pct = pick(r, [20, 25, 40, 50, 60]), cogs = rev - (rev * pct) / 100;
    return mc(r, `vm4.${n}`, `A shop has revenue of ${money(rev)} and cost of goods of ${money(cogs)}. What is its gross margin?`, `${pct}%`, [`${100 - pct}%`, `${Math.round((cogs / rev) * 100) + 5}%`, `${pct + 10}%`], `Margin = (revenue - cost) ÷ revenue = (${rev} - ${cogs}) ÷ ${rev} = ${(rev * pct) / 100} ÷ ${rev} = ${pct}%.`, 'Subtract cost from revenue, then divide by revenue.', 3, L_BIZ);
  } },
  { id: 'vm-aspect', band: 'g912', topic: 'film', title: 'Aspect ratio and proportion', realWorld: 'Screens and films keep a fixed width-to-height ratio, like 16:9.', gen: (r, n) => {
    const h = pick(r, [360, 540, 720, 1080, 1440]), w = (h * 16) / 9;
    return mc(r, `vm5.${n}`, `A 16:9 video is ${h} pixels tall. How many pixels wide is it?`, `${w}`, [`${h * 9}`, `${Math.round((h * 4) / 3)}`, `${w + 16}`], `Width ÷ height = 16 ÷ 9, so width = ${h} × 16 ÷ 9 = ${w}.`, 'Set up the proportion width / height = 16 / 9.', 3, L_FILM);
  } },
  { id: 'vm-budget', band: 'g912', topic: 'film', title: 'Production budget algebra', realWorld: 'A film budget is an equation: fixed costs plus a daily rate times shoot days.', gen: (r, n) => {
    const fixed = ri(r, 4, 12) * 100, day = ri(r, 2, 6) * 50, d = ri(r, 3, 9), total = fixed + day * d;
    return mc(r, `vm6.${n}`, `A short film has ${money(fixed)} in fixed costs plus ${money(day)} per shoot day. The budget is ${money(total)}. How many shoot days can you afford?`, `${d}`, [`${d + 1}`, `${Math.max(1, d - 1)}`, `${Math.round(total / day)}`], `${money(fixed)} + ${money(day)}d = ${money(total)}. Subtract ${money(fixed)}: ${money(day)}d = ${money(day * d)}. Divide by ${money(day)}: d = ${d}.`, 'Subtract the fixed costs first, then divide by the daily rate.', 3, L_FILM);
  } },

  // ───────────── Sports math (real rules: scoring values, pitch and race lengths) ─────────────
  { id: 'sp-score', band: 'prek2', topic: 'sports', title: 'Counting goals and baskets', realWorld: 'Every game keeps score by counting.', gen: (r, n) => {
    const a = ri(r, 1, 6), b = ri(r, 1, 6), what = pick(r, ['goals', 'baskets', 'runs', 'points']);
    return mc(r, `sp1.${n}`, `Your team scored ${a} ${what} in the first half and ${b} in the second half. How many ${what} in all?`, `${a + b}`, [`${a + b + 1}`, `${Math.abs(a - b) || 1}`, `${a + b - 1}`], `${a} + ${b} = ${a + b}.`, 'Put the two halves together.', 1, L_SPORT);
  } },
  { id: 'sp-laps', band: 'prek2', topic: 'sports', title: 'Laps around the track', realWorld: 'Runners count laps to know how far they have gone.', gen: (r, n) => {
    const per = pick(r, [2, 3, 4, 5]), laps = ri(r, 2, 5);
    return mc(r, `sp2.${n}`, `A runner jogs ${laps} laps. Each lap takes ${per} minutes. How many minutes in all?`, `${per * laps}`, [`${per * laps + per}`, `${per + laps}`, `${per * laps - 1}`], `${laps} laps × ${per} minutes = ${per * laps} minutes. Count by ${per}s: ${Array.from({ length: laps }, (_, i) => per * (i + 1)).join(', ')}.`, `Count by ${per}s once for each lap.`, 1, L_SPORT);
  } },
  { id: 'sp-points', band: 'g35', topic: 'sports', title: 'Basketball scoring', realWorld: 'In basketball a basket is worth 2 points, a three-pointer 3, and a free throw 1.', gen: (r, n) => {
    const t2 = ri(r, 3, 9), t3 = ri(r, 1, 5), ft = ri(r, 2, 6), total = 2 * t2 + 3 * t3 + ft;
    return mc(r, `sp3.${n}`, `A player makes ${t2} two-point baskets, ${t3} three-pointers and ${ft} free throws (1 point each). How many points?`, `${total}`, [`${total + 3}`, `${t2 + t3 + ft}`, `${total - 2}`], `${t2} × 2 = ${2 * t2}; ${t3} × 3 = ${3 * t3}; ${ft} × 1 = ${ft}. Total: ${2 * t2} + ${3 * t3} + ${ft} = ${total}.`, 'Multiply each kind of shot by its value, then add.', 2, L_SPORT);
  } },
  { id: 'sp-field', band: 'g35', topic: 'sports', title: 'Perimeter and area of a field', realWorld: 'Groundskeepers measure fields to paint the lines and order turf.', gen: (r, n) => {
    const L = ri(r, 4, 10) * 10, W = ri(r, 3, 8) * 10, per = 2 * (L + W), area = L * W;
    if (ri(r, 0, 1) === 0) return mc(r, `sp4.${n}`, `A school field is ${L} m long and ${W} m wide. How far is it around the edge (the perimeter)?`, `${per} m`, [`${area} m`, `${L + W} m`, `${per + 20} m`], `Perimeter = 2 × (${L} + ${W}) = 2 × ${L + W} = ${per} m.`, 'Add all four sides.', 2, L_SPORT);
    return mc(r, `sp4.${n}`, `A school field is ${L} m long and ${W} m wide. What is its area?`, `${area} m²`, [`${per} m²`, `${L + W} m²`, `${area + 100} m²`], `Area = length × width = ${L} × ${W} = ${area} m².`, 'Multiply length by width.', 2, L_SPORT);
  } },
  { id: 'sp-half', band: 'g35', topic: 'sports', title: 'Fractions of a 90-minute match', realWorld: 'A soccer match is 90 minutes, played in two halves of 45.', gen: (r, n) => {
    const [num, den] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 5], [3, 5], [1, 10]] as Array<[number, number]>), mins = (90 * num) / den;
    return mc(r, `sp5.${n}`, `A soccer match lasts 90 minutes. A substitute plays ${num}/${den} of the match. How many minutes is that?`, `${mins}`, [`${mins + 10}`, `${90 - mins}`, `${Math.round(90 / den) + num}`], `${num}/${den} of 90 = 90 ÷ ${den} × ${num} = ${90 / den} × ${num} = ${mins} minutes.`, 'Divide 90 by the bottom number, then multiply by the top number.', 2, L_SPORT);
  } },
  { id: 'sp-average', band: 'g68', topic: 'sports', title: 'Averages: goals per game', realWorld: 'Coaches and fans compare players by averages, such as points per game.', gen: (r, n) => {
    const g = ri(r, 4, 10), avg = ri(r, 2, 9), total = g * avg;
    return mc(r, `sp6.${n}`, `A striker scored ${total} goals in ${g} games. What is the average number of goals per game?`, `${avg}`, [`${avg + 1}`, `${total + g}`, `${Math.max(1, avg - 1)}`], `Average = total ÷ games = ${total} ÷ ${g} = ${avg}.`, 'Divide the total by the number of games.', 2, L_SPORT);
  } },
  { id: 'sp-percent', band: 'g68', topic: 'sports', title: 'Shooting percentage', realWorld: 'Shooting percentage is made shots divided by attempts, as a percent.', gen: (r, n) => {
    const [made, tried] = pick(r, [[3, 4], [7, 10], [9, 20], [12, 20], [16, 25], [18, 25], [45, 50], [30, 40]] as Array<[number, number]>), pct = Math.round((made / tried) * 100);
    return mc(r, `sp7.${n}`, `A player made ${made} of ${tried} shots. What is the shooting percentage?`, `${pct}%`, [`${pct + 10}%`, `${Math.max(1, pct - 10)}%`, `${tried - made}%`], `${made} ÷ ${tried} = ${(made / tried).toFixed(2)}, which is ${pct}%.`, 'Divide shots made by shots tried, then write it as a percent.', 2, L_SPORT);
  } },
  { id: 'sp-speed', band: 'g68', topic: 'sports', title: 'Speed, distance and time', realWorld: 'Distance = speed × time: how coaches work out pace.', gen: (r, n) => {
    const v = ri(r, 3, 9), t = ri(r, 10, 60), d = v * t;
    return mc(r, `sp8.${n}`, `A sprinter runs at ${v} metres per second for ${t} seconds. How far does the sprinter run?`, `${d} m`, [`${d + v} m`, `${v + t} m`, `${Math.round(d / 2)} m`], `Distance = speed × time = ${v} × ${t} = ${d} m.`, 'Multiply the speed by the time.', 2, L_SPORT);
  } },
  { id: 'sp-marathon', band: 'g68', topic: 'sports', title: 'Marathon distances', realWorld: 'A marathon is 42.195 kilometres.', gen: (r, n) => {
    const done = ri(r, 5, 40), left = Math.round((42.195 - done) * 1000) / 1000;
    return mc(r, `sp9.${n}`, `A marathon is 42.195 km. A runner has finished ${done} km. How many km are left?`, `${left} km`, [`${Math.round((left + 1) * 1000) / 1000} km`, `${Math.round((left - 1) * 1000) / 1000} km`, `${Math.round((42.195 + done) * 1000) / 1000} km`], `42.195 - ${done} = ${left} km.`, 'Subtract the distance already run from the full 42.195 km.', 2, L_SPORT);
  } },
  { id: 'sp-probability', band: 'g912', topic: 'sports', title: 'Probability: free throws in a row', realWorld: 'Independent events multiply: two shots in a row.', gen: (r, n) => {
    const p = pick(r, [50, 60, 70, 80, 90]), both = Math.round((p * p) / 100);
    return mc(r, `sp10.${n}`, `A player makes ${p}% of free throws. Assuming each shot is independent, what is the chance of making two in a row?`, `${both}%`, [`${p}%`, `${Math.min(99, 2 * p)}%`, `${Math.max(1, p - 10)}%`], `Multiply the probabilities: ${p / 100} × ${p / 100} = ${(p * p) / 10000}, which is ${both}%.`, 'For independent events, multiply the chances.', 3, L_SPORT);
  } },
  { id: 'sp-expected', band: 'g912', topic: 'sports', title: 'Expected value: which shot is better?', realWorld: 'Analysts compare shots by expected points per attempt (probability × points).', gen: (r, n) => {
    let p2 = pick(r, [45, 50, 55, 60]); const p3 = pick(r, [30, 35, 40, 45]);
    if (2 * p2 === 3 * p3) p2 += 5; // never an exact tie
    const e2 = (2 * p2) / 100, e3 = (3 * p3) / 100;
    const better = e3 > e2 ? 'the three-pointer' : 'the two-pointer';
    return mc(r, `sp11.${n}`, `A player makes ${p2}% of two-point shots and ${p3}% of three-point shots. Which shot gives more expected points per attempt?`, better, [e3 > e2 ? 'the two-pointer' : 'the three-pointer', 'They are exactly equal', 'It cannot be worked out'],
      `Two-pointer: 2 × ${p2 / 100} = ${e2.toFixed(2)}. Three-pointer: 3 × ${p3 / 100} = ${e3.toFixed(2)}. So ${better} gives more.`, 'Multiply each probability by the points it is worth.', 3, L_SPORT);
  } },
  { id: 'sp-projectile', band: 'g912', topic: 'sports', title: 'The flight of a ball (quadratics)', realWorld: 'A thrown or kicked ball follows a parabola, h(t) = -5t² + vt (metres, seconds).', gen: (r, n) => {
    const t = ri(r, 2, 6), v = 5 * t;
    return mc(r, `sp12.${n}`, `A ball is kicked from the ground so its height in metres is h(t) = -5t² + ${v}t. After how many seconds does it land?`, `${t} s`, [`${t / 2} s`, `${t * 2} s`, `${v} s`], `It lands when h = 0: t(-5t + ${v}) = 0, so t = 0 (the kick) or t = ${v}/5 = ${t} seconds.`, 'Set h(t) = 0 and factor out t.', 3, L_SPORT);
  } },
];

export const CONTEXT_BANDS: Array<{ id: ContextBand; title: string; blurb: string; ages: string }> = [
  { id: 'prek2', title: 'Little Shop', blurb: 'Coins, counting, beats and scoreboards: the first math of a shop, a band and a game.', ages: 'PreK-2' },
  { id: 'g35', title: 'Market Day', blurb: 'Prices, change, profit, fractions of a beat, film night tickets and sports scoring.', ages: 'Grades 3-5' },
  { id: 'g68', title: 'Small Business', blurb: 'Markup, break-even, tempo, frequency ratios, frame rates and sports statistics.', ages: 'Grades 6-8' },
  { id: 'g912', title: 'Venture Math', blurb: 'Profit lines, compound growth, margins, audiences, budgets, probability and projectile motion.', ages: 'Grades 9-12' },
];

export const skillsForBand = (b: ContextBand) => CONTEXT_SKILLS.filter(s => s.band === b);
export const seededRng = (seed: number): Rng => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

export function contextItems(skillId: string, count = 12, rng: Rng = Math.random): PracticeItem[] {
  const sk = CONTEXT_SKILLS.find(s => s.id === skillId);
  if (!sk) return [];
  const out: PracticeItem[] = []; const seen = new Set<string>();
  for (let i = 0; i < count * 8 && out.length < count; i++) { const it = sk.gen(rng, i); if (!seen.has(it.prompt)) { seen.add(it.prompt); out.push(it); } }
  return out;
}
