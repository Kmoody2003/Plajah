// playbooks — a plan for every kind of event, so an easy invite still comes with "everything you need to run it".
// Personal events get a short, friendly checklist here; professional organizers can open the full production studio
// (Artist Manager · Event Production: vendors, budget, contracts, payroll) from the Command Center.
// Pure data + helpers; host progress is stored on the invite (`planDone`), never shown to guests.

export interface PlayStep { id: string; title: string; detail?: string; weeksBefore: number; area: 'Plan' | 'Guests' | 'Place' | 'Food' | 'Fun' | 'Day of' | 'After' }

const s = (id: string, weeksBefore: number, area: PlayStep['area'], title: string, detail?: string): PlayStep => ({ id, weeksBefore, area, title, detail });

const COMMON_AFTER: PlayStep[] = [
  s('thanks', -1, 'After', 'Send thank-yous', 'A note to everyone who came or sent a gift. Your reply list has every name.'),
  s('photos', -1, 'After', 'Share the photo pool', 'Guests with Plajah can add their best shots; you choose what goes public.'),
];

export const PLAYBOOKS: Record<string, PlayStep[]> = {
  kids: [
    s('date', 6, 'Plan', 'Pick the date, time and a 2–3 hour window', 'Weekend late mornings and early afternoons work best for little ones.'),
    s('place', 6, 'Place', 'Book the place', 'Home, park pavilion, play space. Check capacity and rain plans.'),
    s('invite', 4, 'Guests', 'Send the invite', 'Send the link to parents. The kids get the game; parents get the RSVP.'),
    s('allergies', 3, 'Food', 'Ask about allergies', 'Add an allergy question to the RSVP so parents can tell you.'),
    s('cake', 2, 'Food', 'Order the cake and snacks'),
    s('activities', 2, 'Fun', 'Plan 2–3 activities and a goodie bag'),
    s('remind', 1, 'Guests', 'Nudge anyone who hasn’t replied'),
    s('setup', 0, 'Day of', 'Set up 1 hour early: tables, music, a photo spot'),
    ...COMMON_AFTER,
  ],
  adult: [
    s('date', 5, 'Plan', 'Lock the date, time and vibe'),
    s('place', 5, 'Place', 'Book the venue or plan the space'),
    s('invite', 4, 'Guests', 'Send the invite'),
    s('menu', 3, 'Food', 'Plan food and drinks', 'Use the bring list for potluck-style help.'),
    s('music', 2, 'Fun', 'Music, lighting and one great moment'),
    s('remind', 1, 'Guests', 'Final headcount and reminders'),
    s('setup', 0, 'Day of', 'Set up, chill the drinks, light the candles'),
    ...COMMON_AFTER,
  ],
  wedding: [
    s('budget', 52, 'Plan', 'Set the budget and guest count'),
    s('venue', 48, 'Place', 'Book ceremony and reception venues'),
    s('vendors', 40, 'Plan', 'Book photographer, caterer, music and officiant', 'Open the Production Studio to track vendors, contracts and payments.'),
    s('savedate', 32, 'Guests', 'Send save-the-dates'),
    s('registry', 24, 'Plan', 'Set up the registry or gift fund'),
    s('invite', 10, 'Guests', 'Send the invitations', 'Turn on meal choice and plus-one limits in the RSVP.'),
    s('rsvpby', 4, 'Guests', 'RSVP deadline and final count to the caterer'),
    s('seating', 2, 'Place', 'Seating chart and timeline for the day'),
    s('rehearsal', 0, 'Day of', 'Rehearsal, then the day: share the timeline with the wedding party'),
    ...COMMON_AFTER,
  ],
  formal: [
    s('date', 8, 'Plan', 'Set the date and the order of the day'),
    s('place', 8, 'Place', 'Book the place and any officiant or speakers'),
    s('invite', 5, 'Guests', 'Send the invitations'),
    s('menu', 3, 'Food', 'Plan the meal or reception'),
    s('program', 2, 'Plan', 'Prepare the program, music and readings'),
    s('remind', 1, 'Guests', 'Confirm the headcount'),
    s('setup', 0, 'Day of', 'Arrive early; brief helpers'),
    ...COMMON_AFTER,
  ],
  gathering: [
    s('date', 3, 'Plan', 'Pick the date and time'),
    s('invite', 3, 'Guests', 'Send the invite'),
    s('bring', 2, 'Food', 'Set up a bring list so it’s easy to help'),
    s('remind', 1, 'Guests', 'Reminder and final count'),
    s('setup', 0, 'Day of', 'Set up: seating, lights, music'),
    ...COMMON_AFTER,
  ],
  sports: [
    s('date', 3, 'Plan', 'Pick the date (check the game schedule)'),
    s('place', 3, 'Place', 'Book the field, rink, venue or living room'),
    s('invite', 2, 'Guests', 'Send the invite to the team or crew'),
    s('food', 1, 'Food', 'Snacks and drinks for halftime'),
    s('setup', 0, 'Day of', 'Screens, seating and team colors'),
    ...COMMON_AFTER,
  ],
};

const MAP: Record<string, keyof typeof PLAYBOOKS> = {
  kids_everyone: 'kids', kids_boy: 'kids', kids_girl: 'kids', kids_kaiju: 'kids', gaming: 'kids',
  sports_kids: 'sports', sports_adult: 'sports', adult: 'adult', life: 'formal', faith: 'formal', anniversary: 'formal', military: 'formal',
  wedding: 'wedding', holidays: 'gathering', general: 'gathering', patriotic: 'gathering',
};
export const playbookFor = (collection: string): PlayStep[] => PLAYBOOKS[MAP[collection] || 'gathering'];

/** Steps with due dates relative to the event, sorted soonest first, and what's overdue. */
export function planTimeline(collection: string, startsAt: number, done: string[] = [], now = Date.now()) {
  return playbookFor(collection).map(st => {
    const due = startsAt - st.weeksBefore * 7 * 864e5;
    return { ...st, due, done: done.includes(st.id), overdue: !done.includes(st.id) && due < now && st.weeksBefore >= 0 };
  }).sort((a, b) => a.due - b.due);
}
