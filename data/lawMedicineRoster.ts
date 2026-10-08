/**
 * Roster of the open Law and Medicine curricula, PreK to professional school. One row per course;
 * the course content lives in data/practice/courses/<id>.ts. The Learn map, the practice-bank
 * loader and the living-knowledge job all read this list.
 *
 * Stages follow the Academia age bands (ISCED-aligned) and then continue past school:
 *   prek2 · g35 · g68 · g912 · college (undergraduate / pre-professional) · pro (JD / MD level)
 */
export type LadderStage = 'prek2' | 'g35' | 'g68' | 'g912' | 'college' | 'pro';
export const STAGE_LABEL: Record<LadderStage, string> = {
  prek2: 'PreK to Grade 2', g35: 'Grades 3 to 5', g68: 'Grades 6 to 8', g912: 'Grades 9 to 12', college: 'College and pre-professional', pro: 'Professional school level',
};
export const STAGE_ORDER: LadderStage[] = ['prek2', 'g35', 'g68', 'g912', 'college', 'pro'];

export interface RosterCourse { id: string; subject: 'law' | 'medicine'; stage: LadderStage; title: string; blurb: string; /** Group label inside the professional stage. */ group?: string }

export const LAW_ACCENT = '#C9A227';
export const INTL_ACCENT = '#5B8DEF';
export const MED_ACCENT = '#E5484D';

export const ROSTER: RosterCourse[] = [
  // ── Law ────────────────────────────────────────────────────────────────────
  { id: 'law-prek2', subject: 'law', stage: 'prek2', title: 'Rules, Fairness and Helping Each Other', blurb: 'Why we have rules, taking turns, what is fair, telling the truth, and who helps us stay safe.' },
  { id: 'law-g35', subject: 'law', stage: 'g35', title: 'Rights, Rules and Courts', blurb: 'Rights and responsibilities, how laws are made, what judges do, and the rules between countries.' },
  { id: 'law-g68', subject: 'law', stage: 'g68', title: 'Law in Everyday Life', blurb: 'Where laws come from, civil and criminal law, your rights online and at school, and international law.' },
  { id: 'law-g912', subject: 'law', stage: 'g912', title: 'Foundations of Law and Mock Trial', blurb: 'The Constitution, the courts, how a case moves, evidence, and how to run a mock trial.' },
  { id: 'law-college', subject: 'law', stage: 'college', title: 'Legal Studies and Legal Reasoning', blurb: 'Legal history, the world’s legal systems, reading cases, interpreting statutes and arguing well.' },
  { id: 'law-legalwriting', subject: 'law', stage: 'pro', group: 'Law school: skills', title: 'Legal Research, Writing and Advocacy', blurb: 'Finding the law, IRAC, memos, briefs, drafting and oral argument.' },
  { id: 'law-contracts', subject: 'law', stage: 'pro', group: 'Law school: first year', title: 'Contracts', blurb: 'Formation, defenses, interpretation, breach and remedies, with the UCC.' },
  { id: 'law-torts', subject: 'law', stage: 'pro', group: 'Law school: first year', title: 'Torts', blurb: 'Intentional torts, negligence, strict liability, defamation and damages.' },
  { id: 'law-civpro', subject: 'law', stage: 'pro', group: 'Law school: first year', title: 'Civil Procedure', blurb: 'Jurisdiction, pleading, discovery, trial, judgments and appeals in federal court.' },
  { id: 'law-crimlaw', subject: 'law', stage: 'pro', group: 'Law school: first year', title: 'Criminal Law', blurb: 'Elements of crimes, homicide, defenses, inchoate crimes and punishment.' },
  { id: 'law-property', subject: 'law', stage: 'pro', group: 'Law school: first year', title: 'Property', blurb: 'Acquisition, estates, landlord and tenant, easements, recording and takings.' },
  { id: 'law-conlaw', subject: 'law', stage: 'pro', group: 'Law school: first year', title: 'Constitutional Law', blurb: 'Judicial review, separation of powers, federalism, equal protection and the First Amendment.' },
  { id: 'law-evidence', subject: 'law', stage: 'pro', group: 'Law school: upper level', title: 'Evidence', blurb: 'Relevance, hearsay, witnesses, expert testimony and privilege under the Federal Rules.' },
  { id: 'law-crimpro', subject: 'law', stage: 'pro', group: 'Law school: upper level', title: 'Criminal Procedure', blurb: 'Search and seizure, interrogation, counsel, trial rights and habeas.' },
  { id: 'law-admin', subject: 'law', stage: 'pro', group: 'Law school: upper level', title: 'Administrative Law', blurb: 'Agencies, rulemaking, adjudication and judicial review.' },
  { id: 'law-business-orgs', subject: 'law', stage: 'pro', group: 'Law school: upper level', title: 'Business Organizations', blurb: 'Agency, partnerships, LLCs, corporations, fiduciary duties and securities basics.' },
  { id: 'law-profresp', subject: 'law', stage: 'pro', group: 'Law school: upper level', title: 'Professional Responsibility and Legal Ethics', blurb: 'The lawyer’s duties to clients, courts and the public.' },
  { id: 'law-jurisprudence', subject: 'law', stage: 'pro', group: 'Law school: upper level', title: 'Jurisprudence: The Philosophy of Law', blurb: 'Natural law, positivism, realism, justice and what law is for.' },
  { id: 'law-intl-public', subject: 'law', stage: 'pro', group: 'International and comparative law', title: 'Public International Law', blurb: 'Treaties, custom, statehood, use of force, the UN and the ICJ.' },
  { id: 'law-intl-human-rights', subject: 'law', stage: 'pro', group: 'International and comparative law', title: 'International Human Rights Law', blurb: 'The UDHR and treaties, regional courts, refugee law and the great debates.' },
  { id: 'law-intl-humanitarian-criminal', subject: 'law', stage: 'pro', group: 'International and comparative law', title: 'Laws of War and International Criminal Law', blurb: 'The Geneva Conventions, war crimes, genocide and the ICC.' },
  { id: 'law-intl-trade-business', subject: 'law', stage: 'pro', group: 'International and comparative law', title: 'International Trade, Investment and Business Law', blurb: 'The WTO, trade agreements, arbitration, sanctions and cross-border deals.' },
  { id: 'law-comparative', subject: 'law', stage: 'pro', group: 'International and comparative law', title: 'Comparative Law and Legal Systems of the World', blurb: 'Common law, civil law, religious and customary systems, side by side.' },

  // ── Medicine ───────────────────────────────────────────────────────────────
  { id: 'med-prek2', subject: 'medicine', stage: 'prek2', title: 'My Body and Staying Healthy', blurb: 'Body parts, germs, sleep, food, feelings, helpers and staying safe.' },
  { id: 'med-g35', subject: 'medicine', stage: 'g35', title: 'How the Body Works', blurb: 'The organ systems, germs and vaccines, nutrition, growing up and first aid.' },
  { id: 'med-g68', subject: 'medicine', stage: 'g68', title: 'Health Science', blurb: 'Cells to organ systems, infection and immunity, how drugs work and how to judge a health claim.' },
  { id: 'med-ethics-young', subject: 'medicine', stage: 'g68', title: 'Care, Honesty and Choices (PreK to Grade 8)', blurb: 'The ethics of caring: kindness, consent, honesty, fairness and who decides about your body.' },
  { id: 'med-g912', subject: 'medicine', stage: 'g912', title: 'Introduction to Medicine and Biomedical Science', blurb: 'Anatomy and physiology, how diseases arise, diagnostics, evidence and the road to a health career.' },
  { id: 'med-ethics-hs', subject: 'medicine', stage: 'g912', title: 'Bioethics', blurb: 'Consent, justice, famous cases, research ethics and the big questions in medicine.' },
  { id: 'med-premed-chem', subject: 'medicine', stage: 'college', title: 'Chemistry for Medicine', blurb: 'General and organic chemistry as a doctor needs it.' },
  { id: 'med-premed-biochem', subject: 'medicine', stage: 'college', title: 'Biochemistry for Medicine', blurb: 'Proteins, enzymes, metabolism and molecular biology as the base of medicine.' },
  { id: 'med-premed-behavioral', subject: 'medicine', stage: 'college', title: 'Behavior, Mind and Society', blurb: 'Psychology and sociology for medicine: how people think, act and fall ill.' },
  { id: 'med-history', subject: 'medicine', stage: 'college', title: 'History of Medicine', blurb: 'From ancient healing to genomics: the people, ideas and failures that made modern medicine.' },
  { id: 'med-skills', subject: 'medicine', stage: 'pro', group: 'Medical school: foundations', title: 'Clinical Reasoning and Physical Diagnosis', blurb: 'The history, the exam and the logic of diagnosis.' },
  { id: 'med-anatomy', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Human Anatomy', blurb: 'Gross anatomy by region, with clinical correlation.' },
  { id: 'med-physiology', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Human Physiology', blurb: 'How every organ system works, and how it fails.' },
  { id: 'med-biochem-genetics', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Biochemistry and Medical Genetics', blurb: 'Metabolism, molecular biology, inheritance and genetic disease.' },
  { id: 'med-histo-embryo', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Histology and Embryology', blurb: 'Tissues under the microscope and how the body develops.' },
  { id: 'med-neuro', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Clinical Neuroscience', blurb: 'Neuroanatomy and the logic of localising a lesion.' },
  { id: 'med-micro', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Medical Microbiology', blurb: 'Bacteria, viruses, fungi and parasites that cause disease.' },
  { id: 'med-immuno', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Immunology', blurb: 'Innate and adaptive immunity, hypersensitivity, autoimmunity and transplantation.' },
  { id: 'med-path', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Pathology', blurb: 'Cell injury, inflammation, neoplasia and the pathology of each system.' },
  { id: 'med-pharm-principles', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Pharmacology: Principles', blurb: 'Pharmacokinetics, pharmacodynamics, drug metabolism and adverse effects.' },
  { id: 'med-pharm-systems', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Pharmacology: Drugs by System', blurb: 'The major drug classes, mechanisms, toxicities and interactions.' },
  { id: 'med-epi-biostats', subject: 'medicine', stage: 'pro', group: 'Medical school: basic sciences', title: 'Epidemiology and Biostatistics', blurb: 'Study design, bias, tests, risk and reading the evidence.' },
  { id: 'med-clin-im', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Internal Medicine', blurb: 'Adult medicine across the organ systems.' },
  { id: 'med-clin-surgery', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Surgery', blurb: 'Surgical thinking, the acute abdomen, trauma and perioperative care.' },
  { id: 'med-clin-peds', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Pediatrics', blurb: 'Growth, development, newborn care and childhood illness.' },
  { id: 'med-clin-obgyn', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Obstetrics and Gynecology', blurb: 'Pregnancy, birth and women’s health.' },
  { id: 'med-clin-psych', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Psychiatry', blurb: 'Mood, psychosis, anxiety, substance use and treatment.' },
  { id: 'med-clin-em', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Emergency and Critical Care', blurb: 'Resuscitation, shock, toxicology and the first hour.' },
  { id: 'med-clin-fm', subject: 'medicine', stage: 'pro', group: 'Medical school: clinical years', title: 'Family and Preventive Medicine', blurb: 'Primary care, screening, prevention and chronic disease over a lifetime.' },
  { id: 'med-ethics-prof', subject: 'medicine', stage: 'pro', group: 'Ethics, law and philosophy of medicine', title: 'Medical Ethics, Law and the Philosophy of Medicine', blurb: 'Autonomy, capacity, end of life, research ethics, justice and what health and disease are.' },
  { id: 'med-global-health', subject: 'medicine', stage: 'pro', group: 'Ethics, law and philosophy of medicine', title: 'Global Health and Health Systems', blurb: 'Burden of disease, health systems, access to medicines and pandemic preparedness.' },
];
