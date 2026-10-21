// services/chmsKinshipAndStatements.ts
// Smart Church Kinship CRM (Head of Household, Spousal Status, Dependent Children,
// and Extended Family with Per-Member Privacy Opt-Out) + 4-Scope Finance Tax Statement Engine.

import type {
  ChmsHousehold,
  ChmsPerson,
  ChmsExtendedKinshipEdge,
  ChmsExtendedKinshipRole,
  ChmsTaxStatementScope,
} from '../types';
import {
  indexPeople,
  inRange,
  live,
  round2,
  sum,
  type DateRange,
  type LedgerRow,
  type StatementData,
} from './chmsFinanceReports';

export interface HouseholdNuclearStructure {
  householdId: string;
  householdName: string;
  head?: ChmsPerson;
  spouse?: ChmsPerson;
  children: ChmsPerson[];
  others: ChmsPerson[];
  allMembers: ChmsPerson[];
  filingSalutation: string;
}

export interface VisibleExtendedKinshipEdge extends ChmsExtendedKinshipEdge {
  isVisibleToLeadership: boolean;
  redactionReason?: 'MEMBER_OPTED_OUT' | 'RELATIVE_OPTED_OUT';
}

export interface HouseholdKinshipSummary {
  nuclear: HouseholdNuclearStructure;
  visibleExtendedEdges: VisibleExtendedKinshipEdge[];
  redactedExtendedCount: number;
  memberPrivacyAllowExtended: boolean;
}

export interface ScopedStatementData extends StatementData {
  scope: ChmsTaxStatementScope;
  householdRoleSummary: string;
  memberSubtotals: Array<{
    personId: string;
    name: string;
    role: 'HEAD' | 'SPOUSE' | 'CHILD' | 'OTHER';
    subtotal: number;
    giftCount: number;
  }>;
}

const KINSHIP_PRIVACY_STORAGE_KEY = 'plajah_chms_extended_kinship_privacy_v1';

export function getLocalExtendedKinshipOptIn(personId = 'self'): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(KINSHIP_PRIVACY_STORAGE_KEY) || '{}');
    if (typeof raw[personId] === 'boolean') return raw[personId];
    return true; // Default opted in unless member chooses to hide extended relationships
  } catch {
    return true;
  }
}

export function setLocalExtendedKinshipOptIn(personId: string, allow: boolean): void {
  try {
    const raw = JSON.parse(localStorage.getItem(KINSHIP_PRIVACY_STORAGE_KEY) || '{}');
    raw[personId] = allow;
    localStorage.setItem(KINSHIP_PRIVACY_STORAGE_KEY, JSON.stringify(raw));
    window.dispatchEvent(
      new CustomEvent('plajah:kinship-privacy-changed', { detail: { personId, allow } })
    );
  } catch {
    // ignore storage errors
  }
}

export function resolveHouseholdNuclearRoles(
  household: ChmsHousehold,
  people: ChmsPerson[]
): HouseholdNuclearStructure {
  const members = people.filter(p => p.householdId === household.id && !p.archived);
  const head =
    members.find(m => m.id === household.headPersonId) ||
    members.find(m => m.householdRole === 'HEAD') ||
    members[0];
  const spouse =
    members.find(m => m.id === household.spousePersonId && m.id !== head?.id) ||
    members.find(m => m.householdRole === 'SPOUSE' && m.id !== head?.id);
  const children = members.filter(
    m => m.id !== head?.id && m.id !== spouse?.id && m.householdRole === 'CHILD'
  );
  const others = members.filter(
    m =>
      m.id !== head?.id &&
      m.id !== spouse?.id &&
      m.householdRole !== 'CHILD'
  );

  const headName = head ? `${head.preferredName || head.firstName} ${head.lastName}`.trim() : '';
  const spouseName = spouse
    ? `${spouse.preferredName || spouse.firstName} ${spouse.lastName}`.trim()
    : '';

  let filingSalutation = household.name;
  if (head && spouse) {
    filingSalutation =
      head.lastName === spouse.lastName
        ? `${head.preferredName || head.firstName} & ${spouse.preferredName || spouse.firstName} ${head.lastName}`
        : `${headName} & ${spouseName}`;
  } else if (headName) {
    filingSalutation = headName;
  }

  return {
    householdId: household.id,
    householdName: household.name,
    head,
    spouse,
    children,
    others,
    allMembers: members,
    filingSalutation,
  };
}

/**
 * Resolves extended family relationships (Brothers, Sisters, Aunts, Uncles, Grandparents)
 * while strictly enforcing per-member privacy opt-out (`allowExtendedRelationships !== false`).
 * If a family member chooses NOT to allow extended relationships to be known, those edges
 * are redacted from leadership views.
 */
export function resolveExtendedKinshipForLeadership(
  person: ChmsPerson,
  allPeopleById: Map<string, ChmsPerson>
): { visible: VisibleExtendedKinshipEdge[]; redactedCount: number } {
  const edges = person.extendedRelationships || [];
  const selfAllows =
    person.allowExtendedRelationships !== undefined
      ? person.allowExtendedRelationships
      : getLocalExtendedKinshipOptIn(person.id);

  if (!selfAllows) {
    return {
      visible: [],
      redactedCount: edges.length,
    };
  }

  const visible: VisibleExtendedKinshipEdge[] = [];
  let redactedCount = 0;

  for (const edge of edges) {
    const target = allPeopleById.get(edge.targetPersonId);
    const targetAllows =
      target?.allowExtendedRelationships !== undefined
        ? target.allowExtendedRelationships
        : getLocalExtendedKinshipOptIn(edge.targetPersonId);

    if (!targetAllows) {
      redactedCount++;
      continue;
    }

    visible.push({
      ...edge,
      isVisibleToLeadership: true,
    });
  }

  return { visible, redactedCount };
}

/**
 * Generates IRS 501(c)(3) contribution statements across 4 selectable scopes:
 * - JOINT_HOUSEHOLD: 1 combined statement per household (Head + Spouse + Children) with itemized member sub-ledgers
 * - HEAD_AND_SPOUSE: Joint statement for Head + Spouse; separate individual statements for Children/Others
 * - INDIVIDUAL: Every individual giver receives their own separate tax statement
 * - FAMILY_PACKET: Combined Household Cover Statement + Individual Member Statements bundled together
 */
export function buildScopedTaxStatements(
  rows: LedgerRow[],
  people: ChmsPerson[],
  households: ChmsHousehold[],
  range: DateRange,
  scope: ChmsTaxStatementScope
): ScopedStatementData[] {
  const idx = indexPeople(people, households);
  const deductibleRows = live(rows).filter(
    r => r.deductible && inRange(r.date, range) && r.personId && !r.anonymous
  );

  const makeSingleStatement = (
    key: string,
    displayName: string,
    groupRows: LedgerRow[],
    members: ChmsPerson[],
    householdId: string | undefined,
    roleSummary: string
  ): ScopedStatementData => {
    const first = groupRows[0];
    const p = idx.byId.get(first.personId!);
    const hh = householdId ? idx.households.get(householdId) : undefined;
    const head = hh?.headPersonId ? idx.byId.get(hh.headPersonId) : undefined;
    const addrSrc = [
      hh?.address,
      head?.address,
      p?.address,
      ...members.map(m => m.address),
    ].find(a => a && a.line1);

    const byFund: Record<string, number> = {};
    groupRows.forEach(r => {
      byFund[r.fundName] = round2((byFund[r.fundName] || 0) + r.amount);
    });

    // Compute per-member breakdown within the statement
    const memberMap = new Map<
      string,
      { personId: string; name: string; role: 'HEAD' | 'SPOUSE' | 'CHILD' | 'OTHER'; subtotal: number; giftCount: number }
    >();
    for (const r of groupRows) {
      if (!r.personId) continue;
      const mp = idx.byId.get(r.personId);
      const role = (mp?.householdRole || 'OTHER') as 'HEAD' | 'SPOUSE' | 'CHILD' | 'OTHER';
      const cur = memberMap.get(r.personId) || {
        personId: r.personId,
        name: idx.nameOf(r.personId, r.giverName),
        role,
        subtotal: 0,
        giftCount: 0,
      };
      cur.subtotal = round2(cur.subtotal + r.amount);
      cur.giftCount += 1;
      memberMap.set(r.personId, cur);
    }

    return {
      key,
      name: displayName,
      address: addrSrc || undefined,
      personIds: members.length ? members.map(m => m.id) : [first.personId!],
      householdId,
      email: head?.email || p?.email || members.find(m => m.email)?.email,
      linkedUids: [
        ...new Set(members.map(m => m.linkedUid).filter(Boolean) as string[]),
      ],
      lines: groupRows
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(r => ({
          date: r.date,
          fund: r.fundName,
          amount: r.amount,
          method: r.method,
          memo:
            members.length > 1
              ? `${idx.nameOf(r.personId, r.giverName)} (${
                  idx.byId.get(r.personId!)?.householdRole || 'Member'
                })${r.memo ? ' · ' + r.memo : ''}`
              : r.memo,
          tribute: r.tributeNote,
          inKind: r.method === 'INKIND',
        })),
      total: sum(groupRows),
      byFund,
      range,
      scope,
      householdRoleSummary: roleSummary,
      memberSubtotals: Array.from(memberMap.values()),
    };
  };

  if (scope === 'INDIVIDUAL') {
    const byPerson = new Map<string, LedgerRow[]>();
    for (const r of deductibleRows) {
      const k = r.personId!;
      (byPerson.get(k) || byPerson.set(k, []).get(k)!).push(r);
    }
    const out: ScopedStatementData[] = [];
    for (const [pid, rs] of byPerson) {
      const p = idx.byId.get(pid);
      const role = p?.householdRole || 'INDIVIDUAL';
      out.push(
        makeSingleStatement(
          `p:${pid}`,
          idx.nameOf(pid, rs[0]?.giverName),
          rs,
          p ? [p] : [],
          p?.householdId,
          `Individual Tax Receipt (${role})`
        )
      );
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (scope === 'HEAD_AND_SPOUSE') {
    const groups = new Map<string, LedgerRow[]>();
    for (const r of deductibleRows) {
      const p = idx.byId.get(r.personId!);
      const hid = r.householdId || p?.householdId;
      const isHeadOrSpouse = p?.householdRole === 'HEAD' || p?.householdRole === 'SPOUSE';
      const k = hid && isHeadOrSpouse ? `hs:${hid}` : `p:${r.personId}`;
      (groups.get(k) || groups.set(k, []).get(k)!).push(r);
    }
    const out: ScopedStatementData[] = [];
    for (const [k, rs] of groups) {
      if (k.startsWith('hs:')) {
        const hid = k.slice(3);
        const hh = idx.households.get(hid);
        const nuclear = hh
          ? resolveHouseholdNuclearRoles(hh, people)
          : null;
        const coupleMembers = [nuclear?.head, nuclear?.spouse].filter(Boolean) as ChmsPerson[];
        out.push(
          makeSingleStatement(
            k,
            nuclear?.filingSalutation || hh?.name || 'Joint Head & Spouse',
            rs,
            coupleMembers,
            hid,
            'Joint Spousal Tax Statement (Head of Household + Spouse)'
          )
        );
      } else {
        const pid = k.slice(2);
        const p = idx.byId.get(pid);
        out.push(
          makeSingleStatement(
            k,
            idx.nameOf(pid, rs[0]?.giverName),
            rs,
            p ? [p] : [],
            p?.householdId,
            `Individual Dependent / Household Member Receipt (${p?.householdRole || 'MEMBER'})`
          )
        );
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // JOINT_HOUSEHOLD or FAMILY_PACKET
  const byHouseholdGroup = new Map<string, LedgerRow[]>();
  for (const r of deductibleRows) {
    const p = idx.byId.get(r.personId!);
    const hid = r.householdId || p?.householdId;
    const k = hid ? `h:${hid}` : `p:${r.personId}`;
    (byHouseholdGroup.get(k) || byHouseholdGroup.set(k, []).get(k)!).push(r);
  }

  const out: ScopedStatementData[] = [];
  for (const [k, rs] of byHouseholdGroup) {
    if (k.startsWith('h:')) {
      const hid = k.slice(2);
      const hh = idx.households.get(hid);
      const nuclear = hh ? resolveHouseholdNuclearRoles(hh, people) : null;
      const members = nuclear?.allMembers || people.filter(x => x.householdId === hid);
      const roleSummary = [
        nuclear?.head ? `Head: ${idx.nameOf(nuclear.head.id)}` : '',
        nuclear?.spouse ? `Spouse: ${idx.nameOf(nuclear.spouse.id)}` : '',
        nuclear?.children.length ? `Children (${nuclear.children.length})` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      out.push(
        makeSingleStatement(
          k,
          nuclear?.filingSalutation || hh?.name || 'Household Statement',
          rs,
          members,
          hid,
          roleSummary || 'Joint Family Household Statement'
        )
      );

      // If FAMILY_PACKET is selected, also append each individual contributor's sub-statement right after the household cover
      if (scope === 'FAMILY_PACKET' && members.length > 1) {
        for (const m of members) {
          const memberRows = rs.filter(r => r.personId === m.id);
          if (!memberRows.length) continue;
          out.push(
            makeSingleStatement(
              `pkt:${hid}:${m.id}`,
              `${idx.nameOf(m.id)} (Family Packet Individual Schedule)`,
              memberRows,
              [m],
              hid,
              `Family Packet Sub-Statement · Role: ${m.householdRole || 'MEMBER'}`
            )
          );
        }
      }
    } else {
      const pid = k.slice(2);
      const p = idx.byId.get(pid);
      out.push(
        makeSingleStatement(
          k,
          idx.nameOf(pid, rs[0]?.giverName),
          rs,
          p ? [p] : [],
          undefined,
          'Individual Statement'
        )
      );
    }
  }

  return out;
}

export const EXTENDED_KINSHIP_LABELS: Record<ChmsExtendedKinshipRole, string> = {
  BROTHER: 'Brother',
  SISTER: 'Sister',
  SIBLING: 'Sibling',
  AUNT: 'Aunt',
  UNCLE: 'Uncle',
  GRANDPARENT: 'Grandparent',
  GRANDCHILD: 'Grandchild',
  COUSIN: 'Cousin',
  NIECE_NEPHEW: 'Niece / Nephew',
  GODPARENT: 'Godparent / Sponsor',
  IN_LAW: 'Brother / Sister-in-Law',
};

/**
 * Rich demonstration household + extended kinship graph used in the Church Member Hub
 * and Finance / Leadership views so the Head of Household, Spousal Status, Dependent Children,
 * Extended Family (Brother/Sister/Aunt/Uncle), and Privacy Opt-Out are always interactive.
 */
export function getDemoHouseholdKinshipGraph(orgId: string) {
  return {
    householdId: `hh_sterling_${orgId}`,
    householdName: 'The Sterling Household',
    filingStatus: 'Joint Married Household · Head & Spouse + 2 Dependents',
    address: '742 Sanctuary Way, Suite 4B, Atlanta, GA 30308',
    nuclearMembers: [
      {
        id: 'p_marcus_sterling',
        name: 'Marcus Sterling',
        role: 'HEAD' as const,
        roleLabel: 'Head of Household',
        maritalStatus: 'Married (Anniversary: June 14, 2012)',
        departments: ['Deacon Board', 'Men’s Covenant Fellowship', 'Sanctuary Usher Corps'],
        ytdGiving: 8450,
        giftCount: 24,
      },
      {
        id: 'p_elena_sterling',
        name: 'Elena Sterling',
        role: 'SPOUSE' as const,
        roleLabel: 'Spouse (Joint Tax Filer)',
        maritalStatus: 'Married (Spouse of Head of Household)',
        departments: ['Cathedral Schola Choir', 'Women’s Liturgical Guild'],
        ytdGiving: 4200,
        giftCount: 16,
      },
      {
        id: 'p_micah_sterling',
        name: 'Micah Sterling (Age 15)',
        role: 'CHILD' as const,
        roleLabel: 'Dependent Child (Youth)',
        maritalStatus: 'Minor Dependent · Youth Check-In Badge #409',
        departments: ['Elevate Youth Chapel', 'Acolyte & Sound Guild'],
        ytdGiving: 185,
        giftCount: 7,
      },
      {
        id: 'p_noelle_sterling',
        name: 'Noelle Sterling (Age 9)',
        role: 'CHILD' as const,
        roleLabel: 'Dependent Child (Children’s Ministry)',
        maritalStatus: 'Minor Dependent · Kiosk Security Tag Required',
        departments: ['Kingdom Kids Catechism'],
        ytdGiving: 45,
        giftCount: 3,
      },
    ],
    extendedRelatives: [
      {
        id: 'ext_david_sterling',
        name: 'David Sterling',
        relationship: 'BROTHER' as ChmsExtendedKinshipRole,
        relationshipLabel: 'Brother of Marcus · Uncle to Micah & Noelle',
        householdName: 'David & Sarah Sterling Household',
        department: 'Media & Stage Production Team',
        relativeOptedIn: true,
      },
      {
        id: 'ext_claire_vance',
        name: 'Dr. Claire Sterling-Vance',
        relationship: 'SISTER' as ChmsExtendedKinshipRole,
        relationshipLabel: 'Sister of Marcus · Aunt to Micah & Noelle',
        householdName: 'Vance Household',
        department: 'Mercy & Parish Benevolence Clinic',
        relativeOptedIn: true,
      },
      {
        id: 'ext_uncle_samuel',
        name: 'Elder Samuel Okafor',
        relationship: 'UNCLE' as ChmsExtendedKinshipRole,
        relationshipLabel: 'Maternal Uncle of Elena · Great-Uncle to Children',
        householdName: 'Okafor Household',
        department: 'Parish Council of Elders',
        relativeOptedIn: true,
      },
      {
        id: 'ext_aunt_ruth',
        name: 'Ruth Sterling-hester',
        relationship: 'AUNT' as ChmsExtendedKinshipRole,
        relationshipLabel: 'Paternal Aunt · Emergency Family Pickup Authorized',
        householdName: 'Hester Household',
        department: 'Hospitality & Bereavement Ministry',
        relativeOptedIn: false, // Demonstrates a relative who opted out of extended kinship visibility
      },
    ],
  };
}
