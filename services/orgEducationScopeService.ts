// services/orgEducationScopeService.ts
// Plajah Elevate — Organization Education Wing Scope & Resource Governance Service.
//
// Core Rule:
//   - When the Instructor / Teacher Studio is opened inside an Organization (e.g. a Church's
//     Christian Education department), it scales strictly to what that organization does and
//     the materials/topics provisioned for that organization — NOT the full Academia K-12 catalog.
//   - The Head of Christian Education (or Department Admin / Pastor / Org Owner) sets the scope
//     of content and tools available.
//   - By default, a Church / Faith organization is set to:
//       1. RELIGIOUS_AND_BIBLICAL (Scripture, Catechism, Discipleship, Youth/Adult Bible Study)
//       2. ORG_UPLOADED_RESOURCES (The organization's own uploaded documents, PDFs, & Tela units)
//   - If an organization's education wing scales up to offer Tutoring, Continuing Education,
//     Financial Stewardship / Life Skills, Sacred Music & Arts, or Literacy/ESL, the Head of
//     Christian Education can enable those tracks — and they remain governed under the organization.

import type { Organization, OrgMembership } from '../types';
import { COURSES, type Course } from './courseCatalog';
import { listIngestedUnits, type IngestedCurriculumUnit } from './curriculumIngestionService';
import { isViewerDepartmentLeader } from './orgCentralCalendarService';
import { elevateCan } from './elevateRoles';

export type OrgEducationScopeTrackId =
  | 'RELIGIOUS_AND_BIBLICAL'
  | 'ORG_UPLOADED_RESOURCES'
  | 'TUTORING_AND_ACADEMIC_SUPPORT'
  | 'CONTINUING_EDUCATION_AND_CERTIFICATES'
  | 'LIFE_SKILLS_AND_STEWARDSHIP'
  | 'SACRED_MUSIC_AND_ARTS'
  | 'LANGUAGE_AND_LITERACY';

export interface OrgEducationTrackDefinition {
  id: OrgEducationScopeTrackId;
  label: string;
  shortLabel: string;
  description: string;
  defaultEnabledForChurch: boolean;
  lockedCore?: boolean;
  badgeColor: string;
  sampleTopics: string[];
}

export const ORG_EDUCATION_TRACKS: OrgEducationTrackDefinition[] = [
  {
    id: 'RELIGIOUS_AND_BIBLICAL',
    label: 'Religious, Biblical & Discipleship Studies',
    shortLabel: 'Religious & Biblical',
    description:
      'Scripture syllabus, Sunday School, Catechism, New Believers, Youth & Adult Bible Study, and Theological Foundations.',
    defaultEnabledForChurch: true,
    badgeColor: '#E2C27E',
    sampleTopics: ['Gospels & Parables', 'Old & New Testament', 'Discipleship', 'Catechism & Doctrine'],
  },
  {
    id: 'ORG_UPLOADED_RESOURCES',
    label: 'Organization Uploaded Body of Resources & Tela Units',
    shortLabel: 'Org Uploaded Resources',
    description:
      'Your organization’s own uploaded study guides, pastor notes, PDFs, Word docs, worksheets, and extracted interactive Tela lessons.',
    defaultEnabledForChurch: true,
    lockedCore: true,
    badgeColor: '#10B981',
    sampleTopics: ['Department Uploads', 'Extracted Tela Lessons', 'Pastor & Instructor Handouts'],
  },
  {
    id: 'LIFE_SKILLS_AND_STEWARDSHIP',
    label: 'Biblical Stewardship, Marriage, Family & Life Skills',
    shortLabel: 'Stewardship & Life Skills',
    description:
      'Household budgeting, debt freedom, generous living, marriage & parenting workshops, and career readiness.',
    defaultEnabledForChurch: false,
    badgeColor: '#38BDF8',
    sampleTopics: ['Financial Stewardship', 'Family & Parenting', 'Leadership Ethics'],
  },
  {
    id: 'CONTINUING_EDUCATION_AND_CERTIFICATES',
    label: 'Continuing Education, Ministry Leadership & Certificates',
    shortLabel: 'Continuing Education',
    description:
      'Lay ministry certificates, deacon/elder training, teacher/instructor certification, and seminary-prep seminars.',
    defaultEnabledForChurch: false,
    badgeColor: '#A78BFA',
    sampleTopics: ['Ministry Leadership Certificate', 'Homiletics & Teaching', 'Chaplaincy & Care'],
  },
  {
    id: 'TUTORING_AND_ACADEMIC_SUPPORT',
    label: 'Community Tutoring & After-School Academic Support',
    shortLabel: 'Tutoring & Homework Help',
    description:
      'Scales up the organization’s education wing for church-run tutoring ministries (Reading, Math & Study Skills support).',
    defaultEnabledForChurch: false,
    badgeColor: '#F59E0B',
    sampleTopics: ['Reading & Comprehension Clinic', 'Math Homework Help', 'Test Prep & Study Skills'],
  },
  {
    id: 'SACRED_MUSIC_AND_ARTS',
    label: 'Sacred Music, Choir Theory & Liturgical Arts',
    shortLabel: 'Sacred Music & Arts',
    description:
      'Hymnology, gospel ear-training, sight-reading for choir members, and visual/media ministry training.',
    defaultEnabledForChurch: false,
    badgeColor: '#EC4899',
    sampleTopics: ['Hymnology & Gospel Roots', 'Choir Sight-Reading', 'Sanctuary Media Arts'],
  },
  {
    id: 'LANGUAGE_AND_LITERACY',
    label: 'Adult Literacy, ESL & Biblical Languages',
    shortLabel: 'Literacy, ESL & Languages',
    description:
      'Community ESL classes, adult reading clinics, and introductory Biblical Hebrew & Koine Greek.',
    defaultEnabledForChurch: false,
    badgeColor: '#14B8A6',
    sampleTopics: ['Community ESL', 'Adult Literacy', 'Biblical Greek & Hebrew'],
  },
];

export interface OrgEducationSubjectBand {
  id: string;
  label: string;
  trackId: OrgEducationScopeTrackId;
  color: string;
  standards: Array<{
    id: string;
    code: string;
    title: string;
    description: string;
    ageBand: string;
  }>;
}

export interface OrgEducationScopeConfig {
  orgId: string;
  enabledTracks: OrgEducationScopeTrackId[];
  allowExternalAcademiaCatalog: boolean;
  customFocusTopics: string[];
  updatedByName?: string;
  updatedAt: number;
}

export interface OrgUploadedEducationResource {
  id: string;
  orgId: string;
  title: string;
  departmentName: string;
  kind: 'TELA_UNIT' | 'DEPARTMENT_UPLOAD' | 'SYLLABUS_PACK';
  summary: string;
  uploadedByName: string;
  createdAt: number;
  telaDocId?: string;
  fileDataUrl?: string;
  questionCount?: number;
}

const SCOPE_STORAGE_PREFIX = 'plajah_org_edu_scope_v1_';
const DEPT_UPLOADS_PREFIX = 'plajah_vol_dept_uploads_v1_';

export function getDefaultOrgEducationScope(org: Organization): OrgEducationScopeConfig {
  const isChurchOrFaith = !org.orgType || org.orgType === 'CHURCH';
  return {
    orgId: org.id,
    enabledTracks: isChurchOrFaith
      ? ['RELIGIOUS_AND_BIBLICAL', 'ORG_UPLOADED_RESOURCES']
      : ['ORG_UPLOADED_RESOURCES', 'CONTINUING_EDUCATION_AND_CERTIFICATES'],
    allowExternalAcademiaCatalog: false,
    customFocusTopics: [],
    updatedAt: Date.now(),
  };
}

export function loadOrgEducationScope(org: Organization): OrgEducationScopeConfig {
  try {
    const raw = localStorage.getItem(`${SCOPE_STORAGE_PREFIX}${org.id}`);
    if (raw) {
      const parsed = JSON.parse(raw) as OrgEducationScopeConfig;
      if (parsed && Array.isArray(parsed.enabledTracks) && parsed.enabledTracks.length > 0) {
        if (!parsed.enabledTracks.includes('ORG_UPLOADED_RESOURCES')) {
          parsed.enabledTracks.push('ORG_UPLOADED_RESOURCES');
        }
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return getDefaultOrgEducationScope(org);
}

export function saveOrgEducationScope(config: OrgEducationScopeConfig): OrgEducationScopeConfig {
  const next: OrgEducationScopeConfig = {
    ...config,
    enabledTracks: Array.from(new Set([...config.enabledTracks, 'ORG_UPLOADED_RESOURCES'])),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(`${SCOPE_STORAGE_PREFIX}${config.orgId}`, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('plajah:orgEduScopeUpdated', { detail: { orgId: config.orgId } }));
  } catch {
    // ignore storage errors
  }
  return next;
}

/**
 * Checks whether the current viewer is authorized to configure the Organization's
 * Education Wing scope (Head of Christian Education, Department Admin, Pastor, Staff, or Owner).
 */
export function canViewerConfigureOrgEducationScope(
  membership: OrgMembership | null | undefined,
  org: Organization
): boolean {
  if (elevateCan(membership, org, 'MANAGE_CONTENT') || elevateCan(membership, org, 'MANAGE_PEOPLE')) {
    return true;
  }
  if (isViewerDepartmentLeader(membership, org)) {
    return true;
  }
  return false;
}

/**
 * Returns the Subject / Topic bands and learning standards scoped strictly to the
 * organization's enabled tracks.
 */
export function getOrgScopedSubjectBands(config: OrgEducationScopeConfig): OrgEducationSubjectBand[] {
  const bands: OrgEducationSubjectBand[] = [];

  if (config.enabledTracks.includes('RELIGIOUS_AND_BIBLICAL')) {
    bands.push(
      {
        id: 'BIBLICAL_STUDIES',
        label: 'Scripture & Biblical Studies',
        trackId: 'RELIGIOUS_AND_BIBLICAL',
        color: '#E2C27E',
        standards: [
          {
            id: 'ced.bib.1',
            code: 'BIB-101',
            title: 'Biblical Narrative & Covenant Context',
            description: 'Trace the historical, covenantal, and redemptive context of Old and New Testament passages.',
            ageBand: 'All Ages',
          },
          {
            id: 'ced.bib.2',
            code: 'BIB-102',
            title: 'Parables, Gospels & Life of Christ',
            description: 'Interpret the teachings, miracles, and parables of Jesus with personal & community application.',
            ageBand: 'Youth & Adults',
          },
          {
            id: 'ced.bib.3',
            code: 'BIB-103',
            title: 'Scripture Memory & Verse Meditation',
            description: 'Commit key Scripture passages to heart and explain their meaning in plain language.',
            ageBand: 'Children & Youth',
          },
        ],
      },
      {
        id: 'DISCIPLESHIP_AND_DOCTRINE',
        label: 'Discipleship, Catechism & Christian Living',
        trackId: 'RELIGIOUS_AND_BIBLICAL',
        color: '#A78BFA',
        standards: [
          {
            id: 'ced.disc.1',
            code: 'DISC-201',
            title: 'Foundations of Faith & Creeds',
            description: 'Articulate core articles of faith, baptismal vows, and church ordinances/sacraments.',
            ageBand: 'New Believers & Catechumenate',
          },
          {
            id: 'ced.disc.2',
            code: 'DISC-202',
            title: 'Prayer, Spiritual Practices & Service',
            description: 'Practice daily devotional reading, intercessory prayer, and compassionate service.',
            ageBand: 'All Ages',
          },
        ],
      }
    );
  }

  if (config.enabledTracks.includes('ORG_UPLOADED_RESOURCES')) {
    bands.push({
      id: 'ORG_CUSTOM_CORPUS',
      label: 'Org Uploaded Resources & Custom Units',
      trackId: 'ORG_UPLOADED_RESOURCES',
      color: '#10B981',
      standards: [
        {
          id: 'ced.org.1',
          code: 'ORG-RES-1',
          title: 'Organization Study Guide & Sermon Companion Mastery',
          description: 'Complete interactive Tela study guides and worksheets uploaded by your department instructors.',
          ageBand: 'Organization-Wide',
        },
        {
          id: 'ced.org.2',
          code: 'ORG-RES-2',
          title: 'Department Curriculum Unit Check for Understanding',
          description: 'Demonstrate comprehension on custom curriculum lessons extracted from department documents.',
          ageBand: 'Organization-Wide',
        },
      ],
    });
  }

  if (config.enabledTracks.includes('LIFE_SKILLS_AND_STEWARDSHIP')) {
    bands.push({
      id: 'STEWARDSHIP_AND_FAMILY',
      label: 'Stewardship, Family & Life Skills',
      trackId: 'LIFE_SKILLS_AND_STEWARDSHIP',
      color: '#38BDF8',
      standards: [
        {
          id: 'ced.stew.1',
          code: 'STEW-101',
          title: 'Household Budgeting, Generosity & Debt Freedom',
          description: 'Build a sustainable household budget rooted in wise stewardship and generosity.',
          ageBand: 'Young Adults & Adults',
        },
        {
          id: 'ced.stew.2',
          code: 'STEW-102',
          title: 'Healthy Communication & Family Leadership',
          description: 'Practice conflict resolution, encouragement, and intergenerational mentoring.',
          ageBand: 'Adults & Families',
        },
      ],
    });
  }

  if (config.enabledTracks.includes('CONTINUING_EDUCATION_AND_CERTIFICATES')) {
    bands.push({
      id: 'CONTINUING_ED_LEADERSHIP',
      label: 'Continuing Ed & Ministry Certificates',
      trackId: 'CONTINUING_EDUCATION_AND_CERTIFICATES',
      color: '#F472B6',
      standards: [
        {
          id: 'ced.cert.1',
          code: 'CERT-301',
          title: 'Small Group & Classroom Facilitation',
          description: 'Lead engaging, inclusive, and Biblically grounded classes and discussion groups.',
          ageBand: 'Instructors & Leaders',
        },
        {
          id: 'ced.cert.2',
          code: 'CERT-302',
          title: 'Congregational Care & Ethics',
          description: 'Apply pastoral care boundaries, confidentiality, and safeguarding protocols.',
          ageBand: 'Ministry Leaders',
        },
      ],
    });
  }

  if (config.enabledTracks.includes('TUTORING_AND_ACADEMIC_SUPPORT')) {
    bands.push({
      id: 'ORG_TUTORING_SUPPORT',
      label: 'Community Tutoring (Reading, Math & Study Skills)',
      trackId: 'TUTORING_AND_ACADEMIC_SUPPORT',
      color: '#F59E0B',
      standards: [
        {
          id: 'ced.tut.1',
          code: 'TUT-ELA',
          title: 'Reading Fluency, Vocabulary & Written Expression',
          description: 'Guided literacy and comprehension practice within the organization’s tutoring ministry.',
          ageBand: 'Youth & Students',
        },
        {
          id: 'ced.tut.2',
          code: 'TUT-MATH',
          title: 'Foundational Math Problem Solving & Homework Clinic',
          description: 'Step-by-step numeracy and problem-solving support for students in the tutoring program.',
          ageBand: 'Youth & Students',
        },
      ],
    });
  }

  if (config.enabledTracks.includes('SACRED_MUSIC_AND_ARTS')) {
    bands.push({
      id: 'SACRED_MUSIC_THEORY',
      label: 'Sacred Music, Choir & Liturgical Arts',
      trackId: 'SACRED_MUSIC_AND_ARTS',
      color: '#EC4899',
      standards: [
        {
          id: 'ced.mus.1',
          code: 'MUS-101',
          title: 'Hymnology, Gospel Heritage & Vocal Harmony',
          description: 'Understand the theology, meter, and four-part/gospel harmony of sacred repertoire.',
          ageBand: 'Choir & Worship Arts',
        },
      ],
    });
  }

  if (config.enabledTracks.includes('LANGUAGE_AND_LITERACY')) {
    bands.push({
      id: 'LITERACY_AND_LANGUAGES',
      label: 'Adult Literacy, ESL & Biblical Languages',
      trackId: 'LANGUAGE_AND_LITERACY',
      color: '#14B8A6',
      standards: [
        {
          id: 'ced.lang.1',
          code: 'LANG-101',
          title: 'Conversational ESL & Community Reading',
          description: 'Build practical English reading, speaking, and comprehension confidence.',
          ageBand: 'Adults & Community',
        },
        {
          id: 'ced.lang.2',
          code: 'LANG-201',
          title: 'Biblical Word Studies (Hebrew & Koine Greek Roots)',
          description: 'Explore key Hebrew and Greek terms using interlinear and lexicon tools.',
          ageBand: 'Adults & Continuing Ed',
        },
      ],
    });
  }

  return bands;
}

/**
 * Returns courses provisioned for the organization based on its active scope tracks
 * (rather than exposing the entire K-12 Academia catalog).
 */
export function getOrgScopedCourses(org: Organization, config?: OrgEducationScopeConfig): Array<{
  id: string;
  title: string;
  emoji: string;
  trackId: OrgEducationScopeTrackId;
  summary: string;
}> {
  const scope = config || loadOrgEducationScope(org);
  const out: Array<{
    id: string;
    title: string;
    emoji: string;
    trackId: OrgEducationScopeTrackId;
    summary: string;
  }> = [];

  if (scope.enabledTracks.includes('RELIGIOUS_AND_BIBLICAL')) {
    out.push(
      {
        id: 'org_crs_gospels',
        title: 'Walk Through the Gospels & Parables',
        emoji: '📖',
        trackId: 'RELIGIOUS_AND_BIBLICAL',
        summary: ' Life and teachings of Christ with weekly Verse readings and discussion prompts.',
      },
      {
        id: 'org_crs_foundations',
        title: 'Foundations of Christian Faith & Discipleship',
        emoji: '🕊️',
        trackId: 'RELIGIOUS_AND_BIBLICAL',
        summary: 'Core doctrine, prayer, spiritual gifts, and belonging in the local church body.',
      },
      {
        id: 'org_crs_ot_covenants',
        title: 'Old Testament Covenants, Psalms & Prophets',
        emoji: '📜',
        trackId: 'RELIGIOUS_AND_BIBLICAL',
        summary: 'From Genesis through the Prophets with historical maps and Messianic themes.',
      },
      {
        id: 'org_crs_youth_apologetics',
        title: 'Youth & Young Adult Faith in Action',
        emoji: '🔥',
        trackId: 'RELIGIOUS_AND_BIBLICAL',
        summary: 'Identity, ethics, and answering everyday questions through Scripture.',
      }
    );
  }

  // Always include any ingested interactive Tela units uploaded by this organization
  const ingested: IngestedCurriculumUnit[] = listIngestedUnits(org.id);
  for (const unit of ingested) {
    out.push({
      id: `org_unit_${unit.id}`,
      title: `${unit.title} (Uploaded Org Unit)`,
      emoji: '🗂️',
      trackId: 'ORG_UPLOADED_RESOURCES',
      summary: `${unit.questions.length} auto-graded questions · ${unit.syllabusWeeks.length} weeks · uploaded by ${unit.createdByName}`,
    });
  }

  if (scope.enabledTracks.includes('LIFE_SKILLS_AND_STEWARDSHIP')) {
    out.push(
      {
        id: 'org_crs_stewardship',
        title: 'Kingdom Financial Stewardship & Household Budgeting',
        emoji: '🌱',
        trackId: 'LIFE_SKILLS_AND_STEWARDSHIP',
        summary: 'Practical household budgeting, debt elimination, and generous living.',
      },
      {
        id: 'org_crs_marriage_family',
        title: 'Strong Families, Marriage & Parenting Workshop',
        emoji: '🏡',
        trackId: 'LIFE_SKILLS_AND_STEWARDSHIP',
        summary: 'Covenant relationships, communication, and raising children in faith.',
      }
    );
  }

  if (scope.enabledTracks.includes('CONTINUING_EDUCATION_AND_CERTIFICATES')) {
    out.push(
      {
        id: 'org_crs_lay_leader',
        title: 'Ministry Leadership & Instructor Certificate',
        emoji: '🎓',
        trackId: 'CONTINUING_EDUCATION_AND_CERTIFICATES',
        summary: 'Equipping church instructors, small-group leaders, and department coordinators.',
      },
      {
        id: 'org_crs_biblical_counseling',
        title: 'Congregational Care & Encouragement Ministry',
        emoji: '🤝',
        trackId: 'CONTINUING_EDUCATION_AND_CERTIFICATES',
        summary: 'Active listening, hospital/home visitation, and ethical care boundaries.',
      }
    );
  }

  if (scope.enabledTracks.includes('TUTORING_AND_ACADEMIC_SUPPORT')) {
    const academicCourses = COURSES.filter(
      (c: Course) => c.kind === 'curriculum' && ['literacy', 'math', 'humanities'].includes(c.subject)
    ).slice(0, 4);
    for (const c of academicCourses) {
      out.push({
        id: c.id,
        title: `${c.title} (Org Tutoring Track)`,
        emoji: c.emoji,
        trackId: 'TUTORING_AND_ACADEMIC_SUPPORT',
        summary: c.tagline,
      });
    }
  }

  if (scope.enabledTracks.includes('SACRED_MUSIC_AND_ARTS')) {
    out.push({
      id: 'org_crs_sacred_music',
      title: 'Hymnology, Choir Sight-Reading & Worship Arts',
      emoji: '🎵',
      trackId: 'SACRED_MUSIC_AND_ARTS',
      summary: 'Vocal parts, rhythm, and the history of hymns and gospel repertoire.',
    });
  }

  if (scope.enabledTracks.includes('LANGUAGE_AND_LITERACY')) {
    out.push(
      {
        id: 'org_crs_esl_literacy',
        title: 'Community Reading & Conversational ESL',
        emoji: '🗣️',
        trackId: 'LANGUAGE_AND_LITERACY',
        summary: 'Practical reading comprehension and conversational English practice.',
      },
      {
        id: 'org_crs_biblical_greek_hebrew',
        title: 'Intro to Biblical Hebrew & New Testament Greek',
        emoji: '🏛️',
        trackId: 'LANGUAGE_AND_LITERACY',
        summary: 'Alphabet, root words, and using Scripture lexicons for deeper study.',
      }
    );
  }

  return out;
}

/**
 * Aggregates the organization's own uploaded body of educational resources:
 * - Extracted interactive Tela curriculum units (`listIngestedUnits(org.id)`)
 * - Department file uploads from `VolunteerMemberManageHub` (`plajah_vol_dept_uploads_v1_${org.id}`)
 */
export function listOrgUploadedEducationResources(org: Organization): OrgUploadedEducationResource[] {
  const resources: OrgUploadedEducationResource[] = [];

  // 1. Ingested interactive Tela units
  const units = listIngestedUnits(org.id);
  for (const u of units) {
    resources.push({
      id: `ing_${u.id}`,
      orgId: org.id,
      title: u.title,
      departmentName: 'Christian Education',
      kind: 'TELA_UNIT',
      summary: `${u.questions.length} auto-graded questions · ${u.masterySkills.length} mastery skills · ${u.sourceLabel}`,
      uploadedByName: u.createdByName || 'Instructor',
      createdAt: u.createdAt,
      telaDocId: u.telaDocId,
      questionCount: u.questions.length,
    });
  }

  // 2. Department uploads stored under this organization
  try {
    const raw = localStorage.getItem(`${DEPT_UPLOADS_PREFIX}${org.id}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{
        id: string;
        departmentName: string;
        title: string;
        notes?: string;
        uploadedByName: string;
        createdAt: number;
        dataUrl?: string;
      }>;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          resources.push({
            id: `up_${item.id}`,
            orgId: org.id,
            title: item.title,
            departmentName: item.departmentName || 'Christian Education',
            kind: 'DEPARTMENT_UPLOAD',
            summary: item.notes || `Uploaded to ${item.departmentName}`,
            uploadedByName: item.uploadedByName || 'Member',
            createdAt: item.createdAt || Date.now(),
            fileDataUrl: item.dataUrl,
          });
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  return resources.sort((a, b) => b.createdAt - a.createdAt);
}
