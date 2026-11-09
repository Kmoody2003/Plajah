// Plajah Build maker terms: safety responsibility, assumption of risk, IP responsibility and the
// supplier exchange. Plain-language draft in our own words, for counsel to review before launch.
// Acceptance is versioned; changing the text means bumping BUILD_TERMS_VERSION so everyone
// accepts the new version.

export const BUILD_TERMS_VERSION = '2026-11-08';

export const BUILD_TERMS: Array<{ heading: string; body: string }> = [
  { heading: 'A design aid, not an engineer or a certifier', body: 'Plajah Build helps you design, check and make things. Its simulations, safety checks, regulatory pre-checks, recall lookups and generated designs are aids. They can be incomplete or wrong, rules change, and nothing here is professional engineering, legal advice, testing or certification.' },
  { heading: 'Safety is your responsibility', body: 'You decide what to build and how. Before you use, give away or sell anything, you are responsible for making sure it is safe, tested, and meets the laws where it is used, including electrical safety, children\'s product, radio and labelling rules. If a design involves mains electricity, batteries, heat, moving machinery, children or the body, get qualified help.' },
  { heading: 'Assumption of risk and release', body: 'Making things carries real risk of injury and damage. To the fullest extent the law allows, you take on those risks and release Plajah, its people and partners from claims arising from designs you create, files you export, machines you run and products you make, use or sell. Plajah Build is provided "as is", without warranties. Some places do not allow some of these limits; where they cannot apply, they apply as far as the law permits.' },
  { heading: 'You make sure your design is yours to make', body: 'You are responsible for making sure what you design, make or sell does not infringe anyone else\'s patents, trademarks, copyrights, design rights or trade dress, and for any licences you need. Plajah does not run patent or trademark clearance searches. Starter designs and generated designs from Plajah are released as public domain (CC0) and avoid copying any brand\'s protected shapes, but combining them with other things is your responsibility. Report infringement through Plajah\'s copyright and IP notice process.' },
  { heading: 'Indemnity', body: 'If someone makes a claim against Plajah because of something you designed, made or sold with Plajah Build, you agree to cover the reasonable costs of that claim, to the extent the law allows.' },
  { heading: 'Suppliers, makers and manufacturers', body: 'Distributors, print services, machine shops, seamstresses and manufacturers you find through Plajah are independent. Plajah is not a party to your agreements with them, does not hold your money (payments go directly between you and them), and does not guarantee their work, prices, safety or delivery. Check samples before you order quantities.' },
  { heading: 'Recalls and safety notices', body: 'We look up public recall databases and show our own component advisories to help you. A clean result does not mean a part or product is safe. If you sell products, you are responsible for monitoring and acting on recalls and for reporting hazards where the law requires.' },
];

export interface TermsAcceptance { version: string; at: number }
const KEY = 'plajah.build.terms';
export function localAcceptance(): TermsAcceptance | null { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && v.version === BUILD_TERMS_VERSION ? v : null; } catch { return null; } }
export function saveLocalAcceptance(): TermsAcceptance { const a = { version: BUILD_TERMS_VERSION, at: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ } return a; }
