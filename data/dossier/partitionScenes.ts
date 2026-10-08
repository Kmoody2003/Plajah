/**
 * Planned reconstruction scenes for the Partition of India dossier. NONE HAS BEEN PAINTED YET: the
 * registry entry is flagged artPending until the owner approves the spend and the images exist.
 * Each scene is a labelled reconstruction, never a photograph, and cites the claims it illustrates.
 * This is a topic dossier with no characters: every scene shows a place or an object. No scene shows a
 * person, a face, a crowd, violence, injury or death, and none depicts the events of the killings; the
 * subject involves massacre and mass displacement, so even the displacement scenes show only the
 * empty places and the things left behind. Details marked "generic" are period-plausible staging,
 * not documented facts.
 */
import type { DossierScene } from './douglassScenes';

const STYLE =
  'museum-quality historical reconstruction painting, restrained naturalistic palette, soft period light, painterly but accurate period detail, quiet and dignified mood, no text, no lettering, no signs with legible writing, no people anywhere in the image';

export const partitionScenes: DossierScene[] = [
  {
    id: 'recon-census-office', roomId: 'r1', title: 'A census office, 1901',
    basis: 'Colonial censuses counted the population by religion and caste from 1871-72 and 1881 (Cohn; Metcalf and Metcalf); generic staging of a district office with ledgers and a district map',
    claimIds: ['c-census', 'c-census-effect'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a high-ceilinged district government office in British India in 1901, a wooden desk under a punkah fan, tall stacks of bound ledgers with ruled columns of abstract tally marks that are not legible, a framed district map on the wall with abstract coloured shading, brass inkwells, afternoon light through slatted shutters',
      action: 'no figures; a ledger lies open with a pen resting in the gutter as if someone just stepped away', cast: [] },
  },
  {
    id: 'recon-simla-table', roomId: 'r5', title: 'A conference table at Simla, July 1947',
    basis: 'Punjab Boundary Commission report, paragraph 6: after the Lahore sittings the commission adjourned to Simla, where the judges could not agree and Radcliffe gave his own decision (generic staging; no description of the room survives in the sources consulted)',
    claimIds: ['c-no-sittings', 'c-commission-members'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a plain panelled hill-station government room in the Himalayan foothills in July 1947, a long wooden table with four empty chairs on each side and one at the head, foolscap papers and large survey maps with abstract coloured district shading that is not legible, a jug of water and glasses, cool grey cloud light at tall windows',
      action: 'no figures; the table is laid for a meeting that has just ended in disagreement, papers pushed away from the middle', cast: [] },
  },
  {
    id: 'recon-radcliffe-desk', roomId: 'r5', title: 'A map and a desk, New Delhi, August 1947',
    basis: 'Radcliffe awards dated 12 and 13 August 1947 and published in the Gazette of India Extraordinary on 17 August 1947; the Foreign Office boundary maps of September 1948 (generic staging of a desk in a hot New Delhi summer)',
    claimIds: ['c-radcliffe-india', 'c-award-dates', 'c-radcliffe-quote'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a hot New Delhi government study in August 1947, a heavy desk with a large unrolled map of a province whose coloured district shading is abstract and not legible, a set square and ruler, a stack of district gazetteers, an inkwell, a ceiling fan turning above, closed shutters and a bar of white light',
      action: 'no figures; a closed set square and a pen rest on the unrolled map', cast: [] },
  },
  {
    id: 'recon-empty-platform', roomId: 'r7', title: 'An empty platform at dawn',
    basis: 'Refugee movement by rail across Punjab in 1947 (Khan; Talbot and Singh); the scene shows only a station after the trains have gone, generic staging, and depicts no passengers and no incident',
    claimIds: ['c-displaced', 'c-trains'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a quiet North Indian railway platform at dawn in 1947 with a steel and wood canopy, empty tracks running into mist, a single tin trunk tied with rope and a roll of bedding left on a wooden bench, a station clock with no legible numerals, grey-gold light, scattered sparrows',
      action: 'no figures, no train in view; the platform is empty and still, with only the left-behind trunk and bedding to suggest a departure', cast: [] },
  },
  {
    id: 'recon-camp-tents', roomId: 'r8', title: 'Rows of tents beside an old fort, autumn 1947',
    basis: 'Refugee camps at Delhi (the old fort and monuments) and at Kurukshetra in autumn 1947 (Khan; Zamindar; the Government of India Photo Division record of 27 September 1947); generic staging, shown empty',
    claimIds: ['c-camps', 'c-delhi'],
    spec: { style: STYLE, aspect: '16:9', setting: 'long rows of grey-white canvas tents on open ground beside the high red sandstone wall of an old Mughal fort in Delhi in October 1947, rope-strung washing lines with plain cloth, a row of clay cooking stoves, water pitchers, rope cots stacked to one side, morning haze',
      action: 'no figures; the camp is quiet at first light, smoke rising from one cooking stove', cast: [] },
  },
  {
    id: 'recon-vacant-house', roomId: 'r8', title: 'A house left in a hurry, Lahore, 1947',
    basis: 'Evacuee property and abandoned houses in 1947 (Zamindar; Khan); generic staging of an urban courtyard house in Lahore, and depicts no violence and no occupant',
    claimIds: ['c-evacuee', 'c-lahore-amritsar-city'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the inner courtyard of a brick-and-timber townhouse in the old walled city of Lahore in 1947, a carved wooden door standing ajar, a charpai (rope bed) with a folded quilt, a tea set still on a low table, a brass lota, a neem tree in the corner, late golden light',
      action: 'no figures; the household has gone, the tea cups still set out, the door open to the lane', cast: [] },
  },
  {
    id: 'recon-boundary-pillar', roomId: 'r9', title: 'A boundary pillar in the wheat',
    basis: 'The Radcliffe line as a modern international border (Radcliffe report; the Attari-Wagah crossing); generic staging, with no flags and no legible lettering',
    claimIds: ['c-line-effect', 'c-wagah'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a flat Punjab landscape of ripe wheat fields at sunrise, a single plain unmarked stone pillar standing in the wheat with no lettering, no fence and no flag, a dirt track, a few trees and a distant mud-walled village roofline',
      action: 'no figures; wind moves through the wheat on both sides of the line', cast: [] },
  },
  {
    id: 'recon-kartarpur-dawn', roomId: 'r9', title: 'A gurdwara dome seen across the fields at dawn',
    basis: 'The Kartarpur Corridor, opened 9 November 2019, linking Dera Baba Nanak with Gurdwara Darbar Sahib Kartarpur about four kilometres away (press and encyclopaedia sources); a generic view across open fields, with no people',
    claimIds: ['c-kartarpur'],
    spec: { style: STYLE, aspect: '16:9', setting: 'open fields of flowering mustard in Punjab at dawn, a long straight pale path running across them toward a distant white gurdwara with a golden dome, no flag or banner anywhere, a low field edge at the near side, mist over the river plain, soft rose-gold light',
      action: 'no figures; light reaches the dome across the fields', cast: [] },
  },
];
