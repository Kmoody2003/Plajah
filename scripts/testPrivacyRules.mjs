// Attacker cases for private profiles, private videos, class enrollment, clubs, sanctuary and pairing codes, with
// the Rules REST `:test` API: read-only, deploys nothing. Retries 503s.
// `:test` checks single requests, so `list` cases here prove the rule's logic, NOT that a real query satisfies
// it. Query shapes need an emulator or staging.
//   node scripts/minifyRules.mjs firestore.rules <tmp>/rules.min && node scripts/testPrivacyRules.mjs <tmp>/rules.min
// Expired token: run `npx firebase-tools projects:list` once.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired: run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }

const DB = '/databases/(default)/documents';
const get = (path, data) => ({ function: 'get', args: [{ exactValue: `${DB}/${path}` }], result: { value: { data } } });
const after = (path, data) => ({ function: 'getAfter', args: [{ exactValue: `${DB}/${path}` }], result: { value: { data } } });
const yes = path => ({ function: 'exists', args: [{ exactValue: `${DB}/${path}` }], result: { value: true } });
const FALLBACK = [
  { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
  { function: 'get', args: [{ anyValue: {} }], result: { value: { data: {} } } },
  { function: 'getAfter', args: [{ anyValue: {} }], result: { value: { data: {} } } },
  { function: 'existsAfter', args: [{ anyValue: {} }], result: { value: false } },
];
const cases = [];
const t = (name, expect, uid, method, path, o = {}) => cases.push({ name, expect, uid, method, path: `${DB}/${path}${method === 'list' ? '/any' : ''}`, ...o }); // :test matches a list against a document path

// ── A: users ────────────────────────────────────────────────────────────────
const adult = { uid: 'amy', displayName: 'Amy', photoURL: '', listable: true };
const kid = { uid: 'child_abc_1', displayName: 'Kid', photoURL: '', isChild: true, accountType: 'CHILD' };
const kidPriv = { guardianUid: 'parent', birthYear: 2016, parentalControls: { kidsMode: true } };
const kidMocks = [get('users/child_abc_1/private/profile', kidPriv), get('users/child_abc_1', kid)];
t('signed out opens a public card', 'ALLOW', null, 'get', 'users/amy', { existing: adult });
t('signed out lists a listable account', 'ALLOW', null, 'list', 'users', { existing: adult });
t('nobody lists an unlisted child', 'DENY', 'out', 'list', 'users', { existing: kid });
t('nobody lists a doc with no listable flag', 'DENY', null, 'list', 'users', { existing: { uid: 'x', isChild: true } });
t('a stranger cannot read a private profile', 'DENY', 'out', 'get', 'users/amy/private/profile', { existing: { email: 'a@b.c' } });
t('signed out cannot read a private profile', 'DENY', null, 'get', 'users/amy/private/profile', { existing: { email: 'a@b.c' } });
t('the owner reads their private profile', 'ALLOW', 'amy', 'get', 'users/amy/private/profile', { existing: { email: 'a@b.c' } });
t('a guardian reads the child private profile', 'ALLOW', 'parent', 'get', 'users/child_abc_1/private/profile', { existing: kidPriv });
t('a co-guardian reads it', 'ALLOW', 'co', 'get', 'users/child_abc_1/private/profile', { existing: { ...kidPriv, coGuardianUids: ['co'] } });
t('the provisioning teacher reads it', 'ALLOW', 'teach', 'get', 'users/child_abc_1/private/profile', { existing: { provisionedByTeacherUid: 'teach' } });
t('another teacher cannot read it', 'DENY', 'teach2', 'get', 'users/child_abc_1/private/profile', { existing: { provisionedByTeacherUid: 'teach' } });
t('signup cannot put email on the public doc', 'DENY', 'amy', 'create', 'users/amy', { data: { ...adult, email: 'a@b.c' } });
t('signup works without email', 'ALLOW', 'amy', 'create', 'users/amy', { data: adult });
t('the owner cannot add birthYear to the public doc', 'DENY', 'amy', 'update', 'users/amy', { existing: adult, data: { ...adult, birthYear: 1990 } });
t('the owner cannot change a stale public email', 'DENY', 'amy', 'update', 'users/amy', { existing: { ...adult, email: 'o@b.c' }, data: { ...adult, email: 'n@b.c' } });
t('the owner may drop a stale public email', 'ALLOW', 'amy', 'update', 'users/amy', { existing: { ...adult, email: 'o@b.c' }, data: adult });
t('the owner edits their bio', 'ALLOW', 'amy', 'update', 'users/amy', { existing: adult, data: { ...adult, bio: 'hi' } });
t('a child cannot make themselves listable', 'DENY', 'child_abc_1', 'update', 'users/child_abc_1', { existing: kid, data: { ...kid, listable: true } });
t('a guardian cannot add parentalControls to the public doc', 'DENY', 'parent', 'update', 'users/child_abc_1', { existing: kid, data: { ...kid, parentalControls: {} }, extra: kidMocks });
t('a guardian edits the child card', 'ALLOW', 'parent', 'update', 'users/child_abc_1', { existing: kid, data: { ...kid, displayName: 'K' }, extra: kidMocks });
t('a stranger cannot edit the child card', 'DENY', 'out', 'update', 'users/child_abc_1', { existing: kid, data: { ...kid, displayName: 'K' }, extra: kidMocks });
t('a guardian changes controls', 'ALLOW', 'parent', 'update', 'users/child_abc_1/private/profile', { existing: kidPriv, data: { ...kidPriv, parentalControls: { kidsMode: false } }, extra: kidMocks });
t('a child cannot change their own controls', 'DENY', 'child_abc_1', 'update', 'users/child_abc_1/private/profile', { existing: kidPriv, data: { ...kidPriv, parentalControls: {} }, extra: kidMocks });
t('a child cannot drop their guardian', 'DENY', 'child_abc_1', 'update', 'users/child_abc_1/private/profile', { existing: kidPriv, data: { birthYear: 2016, parentalControls: { kidsMode: true } }, extra: kidMocks });
t('a child cannot change their birth year', 'DENY', 'child_abc_1', 'update', 'users/child_abc_1/private/profile', { existing: kidPriv, data: { ...kidPriv, birthYear: 1990 }, extra: kidMocks });
t('an adult cannot name a guardian on their own profile', 'DENY', 'amy', 'create', 'users/amy/private/profile', { data: { guardianUid: 'x' }, extra: [get('users/amy', adult)] });
t('an adult sets their own email', 'ALLOW', 'amy', 'create', 'users/amy/private/profile', { data: { email: 'a@b.c' }, extra: [get('users/amy', adult)] });
t('an attacker cannot become guardian of a real uid', 'DENY', 'out', 'create', 'users/amy/private/profile', { data: { guardianUid: 'out' }, extra: [after('users/amy', { isChild: true })] });
t('a guardian creates a child with its private half', 'ALLOW', 'parent', 'create', 'users/child_abc_2', { data: { ...kid, uid: 'child_abc_2' }, extra: [after('users/child_abc_2/private/profile', { guardianUid: 'parent' })] });
t('nobody mints a child guarded by someone else', 'DENY', 'out', 'create', 'users/child_abc_2', { data: { ...kid, uid: 'child_abc_2' }, extra: [after('users/child_abc_2/private/profile', { guardianUid: 'parent' })] });
t('a child gets a guardian private doc only in that batch', 'ALLOW', 'parent', 'create', 'users/child_abc_2/private/profile', { data: { guardianUid: 'parent' }, extra: [after('users/child_abc_2', { isChild: true })] });

for (const k of ['fcmTokens', 'fcmToken', 'masterEmail', 'aliases']) {
  t(`the owner cannot put ${k} on the public doc`, 'DENY', 'amy', 'update', 'users/amy', { existing: adult, data: { ...adult, [k]: k === 'fcmTokens' || k === 'aliases' ? ['x'] : 'x' } });
  t(`signup cannot put ${k} on the public doc`, 'DENY', 'amy', 'create', 'users/amy', { data: { ...adult, [k]: 'x' } });
  t(`the owner may drop a stale public ${k}`, 'ALLOW', 'amy', 'update', 'users/amy', { existing: { ...adult, [k]: 'x' }, data: adult });
}
t('the owner registers a device privately', 'ALLOW', 'amy', 'update', 'users/amy/private/profile', { existing: { email: 'a@b.c' }, data: { email: 'a@b.c', fcmTokens: ['t'] }, extra: [get('users/amy', adult)] });
t('a stranger cannot read device tokens', 'DENY', 'out', 'get', 'users/amy/private/profile', { existing: { fcmTokens: ['t'] } });
t('a stranger cannot add a device to someone', 'DENY', 'out', 'update', 'users/amy/private/profile', { existing: { fcmTokens: [] }, data: { fcmTokens: ['t'] }, extra: [get('users/amy', adult)] });

// ── B: videos ───────────────────────────────────────────────────────────────
const pub = { id: 'v', ownerId: 'amy', title: 'T', url: 'u', timestamp: 1, isPrivate: false };
const priv = { ...pub, isPrivate: true };
t('anyone opens a public video', 'ALLOW', null, 'get', 'videos/v', { existing: pub });
t('a video with no flag is still public', 'ALLOW', null, 'get', 'videos/v', { existing: { id: 'v', ownerId: 'amy' } });
t('a stranger cannot open a private video', 'DENY', 'out', 'get', 'videos/v', { existing: priv });
t('signed out cannot open a private video', 'DENY', null, 'get', 'videos/v', { existing: priv });
t('the owner opens their private video', 'ALLOW', 'amy', 'get', 'videos/v', { existing: priv });
t('a stranger cannot list a private video', 'DENY', 'out', 'list', 'videos', { existing: priv });
t('anyone lists a public video', 'ALLOW', null, 'list', 'videos', { existing: pub });
t('the owner lists their private video', 'ALLOW', 'amy', 'list', 'videos', { existing: priv });
t('a stranger cannot read comments on a private video', 'DENY', 'out', 'get', 'videos/v/comments/c', { existing: { userId: 'amy' }, extra: [get('videos/v', priv)] });
t('anyone reads comments on a public video', 'ALLOW', null, 'get', 'videos/v/comments/c', { existing: { userId: 'amy' }, extra: [get('videos/v', pub)] });

// ── C: classes ──────────────────────────────────────────────────────────────
const cls = { id: 'c1', ownerId: 'teach', ownerName: 'T', title: 'T', description: '', thumbnailUrl: '', syllabus: '', category: 'Music', createdAt: 1, price: 0, lessons: [], assignments: [], enrolledStudents: [], status: 'PUBLISHED' };
const joinOf = c => ({ existing: c, data: { ...c, enrolledStudents: ['out'] } });
t('nobody self-enrolls in a class with no enrollment flag', 'DENY', 'out', 'update', 'classrooms/c1', joinOf(cls));
t('nobody self-enrolls in a closed class', 'DENY', 'out', 'update', 'classrooms/c1', joinOf({ ...cls, enrollment: 'closed' }));
t('open courses are joined through the server, not by a client write', 'DENY', 'out', 'update', 'classrooms/c1', joinOf({ ...cls, enrollment: 'open' }));
t('nobody self-enrolls free in an open paid course', 'DENY', 'out', 'update', 'classrooms/c1', joinOf({ ...cls, enrollment: 'open', price: 9 }));
const pubCls = { ...cls }; delete pubCls.enrolledStudents;
const clsMock = [get('classrooms/c1', pubCls)];
const inClass = u => [...clsMock, yes(`classMembers/c1_${u}`)];
t('a class with no public roster still saves', 'ALLOW', 'teach', 'update', 'classrooms/c1', { existing: pubCls, data: { ...pubCls, title: 'U' } });
t('a teacher cannot edit the seat count', 'DENY', 'teach', 'update', 'classrooms/c1', { existing: pubCls, data: { ...pubCls, enrolledCount: 99 } });
t('a new class cannot carry a roster', 'DENY', 'teach', 'create', 'classrooms/c2', { data: { ...pubCls, enrolledStudents: ['x'] } });
t('a stranger cannot read a roster', 'DENY', 'out', 'get', 'classrooms/c1/private/roster', { existing: { enrolledStudents: ['kid'] }, extra: clsMock });
t('signed out cannot read a roster', 'DENY', null, 'get', 'classrooms/c1/private/roster', { existing: { enrolledStudents: ['kid'] }, extra: clsMock });
t('a student reads the roster', 'ALLOW', 'kid', 'get', 'classrooms/c1/private/roster', { existing: { enrolledStudents: ['kid'] }, extra: inClass('kid') });
t('the teacher reads the roster', 'ALLOW', 'teach', 'get', 'classrooms/c1/private/roster', { existing: { enrolledStudents: ['kid'] }, extra: clsMock });
t('a student cannot write the roster', 'DENY', 'kid', 'update', 'classrooms/c1/private/roster', { existing: { enrolledStudents: ['kid'] }, data: { enrolledStudents: ['kid', 'pal'] }, extra: inClass('kid') });
t('the teacher cannot write the roster directly', 'DENY', 'teach', 'update', 'classrooms/c1/private/roster', { existing: { enrolledStudents: [] }, data: { enrolledStudents: ['x'] }, extra: clsMock });
t('nobody mints their own class marker', 'DENY', 'out', 'create', 'classMembers/c1_out', { data: { classId: 'c1', uid: 'out' } });
t('a person lists their own class markers', 'ALLOW', 'kid', 'list', 'classMembers', { existing: { classId: 'c1', uid: 'kid' } });
t('nobody lists class markers of someone else', 'DENY', 'out', 'list', 'classMembers', { existing: { classId: 'c1', uid: 'kid' }, extra: clsMock });
t('a student opens coursework', 'ALLOW', 'kid', 'get', 'classrooms/c1/private/coursework', { existing: {}, extra: inClass('kid') });
t('nobody opens another teacher\'s class', 'DENY', 'out', 'update', 'classrooms/c1', { existing: cls, data: { ...cls, enrollment: 'open' } });
t('a teacher cannot add a student by a client write', 'DENY', 'teach', 'update', 'classrooms/c1', { existing: cls, data: { ...cls, enrolledStudents: ['kid'] } });
t('coursework stays closed to outsiders', 'DENY', 'out', 'get', 'classrooms/c1/private/coursework', { existing: {}, extra: [get('classrooms/c1', cls)] });

// ── D: clubs ────────────────────────────────────────────────────────────────
const openClub = { creatorId: 'cc', admins: ['cc'], isPrivate: false, joinProcess: 'AUTO' };
const hushClub = { creatorId: 'cc', admins: ['cc'], isPrivate: true, joinProcess: 'AUTO' };
const pubClub = [yes('clubs/open'), get('clubs/open', openClub)];
const privClub = [yes('clubs/hush'), get('clubs/hush', hushClub)];
const memberOf = [...privClub, yes('clubMemberIndex/hush_mem')];
for (const [col, label] of [['clubPosts', 'posts'], ['clubGallery', 'gallery'], ['clubChat', 'chat']]) {
  t(`an outsider cannot read private club ${label}`, 'DENY', 'out', 'get', `${col}/x`, { existing: { clubId: 'hush' }, extra: privClub });
  t(`an outsider cannot list private club ${label}`, 'DENY', 'out', 'list', col, { existing: { clubId: 'hush' }, extra: privClub });
  t(`a member reads private club ${label}`, 'ALLOW', 'mem', 'get', `${col}/x`, { existing: { clubId: 'hush' }, extra: memberOf });
  t(`anyone signed in reads public club ${label}`, 'ALLOW', 'out', 'get', `${col}/x`, { existing: { clubId: 'open' }, extra: pubClub });
}
t('signed out cannot read public club chat', 'DENY', null, 'get', 'clubChat/x', { existing: { clubId: 'open' }, extra: pubClub });
t('the creator reads their private club', 'ALLOW', 'cc', 'get', 'clubChat/x', { existing: { clubId: 'hush' }, extra: privClub });
t('an outsider cannot see a private roster', 'DENY', 'out', 'get', 'clubMemberships/m', { existing: { clubId: 'hush', userId: 'mem' }, extra: privClub });
t('a person sees their own membership', 'ALLOW', 'mem', 'get', 'clubMemberships/m', { existing: { clubId: 'hush', userId: 'mem' }, extra: privClub });
t('nobody joins a private club as ACTIVE', 'DENY', 'out', 'create', 'clubMemberships/n', { data: { clubId: 'hush', userId: 'out', role: 'MEMBER', status: 'ACTIVE' }, extra: privClub });
t('joining a private club as PENDING is fine', 'ALLOW', 'out', 'create', 'clubMemberships/n', { data: { clubId: 'hush', userId: 'out', role: 'MEMBER', status: 'PENDING' }, extra: privClub });
t('joining an open public club is ACTIVE', 'ALLOW', 'out', 'create', 'clubMemberships/n', { data: { clubId: 'open', userId: 'out', role: 'MEMBER', status: 'ACTIVE' }, extra: pubClub });
t('a pending member cannot approve themselves', 'DENY', 'out', 'update', 'clubMemberships/n', { existing: { clubId: 'hush', userId: 'out', status: 'PENDING' }, data: { clubId: 'hush', userId: 'out', status: 'ACTIVE' }, extra: privClub });
t('nobody writes their own marker for a private club', 'DENY', 'out', 'create', 'clubMemberIndex/hush_out', { data: { clubId: 'hush', userId: 'out', at: 1 }, extra: privClub });
t('a club admin writes a marker', 'ALLOW', 'cc', 'create', 'clubMemberIndex/hush_out', { data: { clubId: 'hush', userId: 'out', at: 1 }, extra: privClub });
t('a marker must match its id', 'DENY', 'cc', 'create', 'clubMemberIndex/hush_x', { data: { clubId: 'hush', userId: 'out', at: 1 }, extra: privClub });
t('a person writes their own marker for an open club', 'ALLOW', 'out', 'create', 'clubMemberIndex/open_out', { data: { clubId: 'open', userId: 'out', at: 1 }, extra: pubClub });

// ── D: sanctuary ────────────────────────────────────────────────────────────
const gated = { sanctuaryId: 'owner', creatorId: 'owner', accessType: 'TIER', contentUrl: 'secret' };
const free = { ...gated, accessType: 'FREE' };
const active = [yes('sanctuaryMemberships/owner_fan'), get('sanctuaryMemberships/owner_fan', { status: 'ACTIVE' })];
const lapsed = [yes('sanctuaryMemberships/owner_fan'), get('sanctuaryMemberships/owner_fan', { status: 'CANCELLED' })];
for (const col of ['sanctuaryContent', 'sanctuaryPosts', 'sanctuaryGallery']) {
  t(`an outsider cannot open gated ${col}`, 'DENY', 'out', 'get', `${col}/i`, { existing: gated });
  t(`an outsider cannot list gated ${col}`, 'DENY', 'out', 'list', col, { existing: gated });
  t(`a lapsed member cannot open gated ${col}`, 'DENY', 'fan', 'get', `${col}/i`, { existing: gated, extra: lapsed });
  t(`an active member opens gated ${col}`, 'ALLOW', 'fan', 'get', `${col}/i`, { existing: gated, extra: active });
  t(`a buyer opens the item they bought in ${col}`, 'ALLOW', 'fan', 'get', `${col}/i`, { existing: gated, extra: [yes('sanctuaryUnlocks/fan_i')] });
  t(`anyone signed in opens FREE ${col}`, 'ALLOW', 'out', 'get', `${col}/i`, { existing: free });
  t(`the owner opens their gated ${col}`, 'ALLOW', 'owner', 'get', `${col}/i`, { existing: gated });
}
t('an outsider cannot read member chat', 'DENY', 'out', 'get', 'sanctuaryChat/m', { existing: { sanctuaryId: 'owner' } });
t('a member reads member chat', 'ALLOW', 'fan', 'get', 'sanctuaryChat/m', { existing: { sanctuaryId: 'owner' }, extra: active });
t('an outsider cannot read a pledge', 'DENY', 'out', 'get', 'sanctuaryPledges/p', { existing: { sanctuaryId: 'owner', backerId: 'fan', amount: 5 } });
t('nobody lists pledges', 'DENY', 'out', 'list', 'sanctuaryPledges', { existing: { sanctuaryId: 'owner', backerId: 'fan', amount: 5 } });
t('a backer reads their pledge', 'ALLOW', 'fan', 'get', 'sanctuaryPledges/p', { existing: { sanctuaryId: 'owner', backerId: 'fan', amount: 5 } });
t('the creator reads pledges', 'ALLOW', 'owner', 'get', 'sanctuaryPledges/p', { existing: { sanctuaryId: 'owner', backerId: 'fan', amount: 5 } });
t('anyone reads the pledge total', 'ALLOW', null, 'get', 'sanctuaryPledgeTotals/owner', { existing: { raised: 5, backers: 1 } });
t('nobody writes the pledge total', 'DENY', 'owner', 'update', 'sanctuaryPledgeTotals/owner', { existing: { raised: 5 }, data: { raised: 500 } });
t('nobody grants themselves an unlock', 'DENY', 'fan', 'create', 'sanctuaryUnlocks/fan_i', { data: { uid: 'fan', itemId: 'i' } });
t('a client cannot mint a free membership at a random id', 'DENY', 'fan', 'create', 'sanctuaryMemberships/random', { data: { creatorId: 'owner', memberId: 'fan', status: 'ACTIVE', tierId: 't' }, extra: [yes('sanctuaryTiers/t'), get('sanctuaryTiers/t', { price: 0, creatorId: 'owner' })] });

// ── Org finance ─────────────────────────────────────────────────────────────
const orgP = { creatorId: 'own', admins: ['adm'], itAdminUids: ['it'], seniorPastorUids: ['sp'], pastorUids: ['pas'], financeUids: ['fin'], givingViewUids: ['gv'], accountingUids: ['acc'], accountingViewUids: ['av'], name: 'O' };
const orgM = [get('organizations/o1', orgP)];
const finDoc = { ein: '12-3', legalName: 'L', stripeAccountId: 'acct_real', financeSettings: { recurringBills: [] } };
for (const u of ['own', 'it', 'sp', 'fin', 'gv', 'acc', 'av']) t(`org finance readable by ${u}`, 'ALLOW', u, 'get', 'organizations/o1/private/finance', { existing: finDoc, extra: orgM });
for (const u of ['adm', 'pas', 'out']) t(`org finance not readable by ${u}`, 'DENY', u, 'get', 'organizations/o1/private/finance', { existing: finDoc, extra: orgM });
t('signed out cannot read org finance', 'DENY', null, 'get', 'organizations/o1/private/finance', { existing: finDoc, extra: orgM });
t('nobody lists org private docs', 'DENY', 'adm', 'list', 'organizations/o1/private', { existing: finDoc, extra: orgM });
t('finance saves settings', 'ALLOW', 'fin', 'update', 'organizations/o1/private/finance', { existing: finDoc, data: { ...finDoc, ein: '99' }, extra: orgM });
t('a view-only role cannot save settings', 'DENY', 'gv', 'update', 'organizations/o1/private/finance', { existing: finDoc, data: { ...finDoc, ein: '99' }, extra: orgM });
t('an org admin cannot save settings', 'DENY', 'adm', 'update', 'organizations/o1/private/finance', { existing: finDoc, data: { ...finDoc, ein: '99' }, extra: orgM });
t('even the owner cannot change the Stripe account', 'DENY', 'own', 'update', 'organizations/o1/private/finance', { existing: finDoc, data: { ...finDoc, stripeAccountId: 'acct_mine' }, extra: orgM });
t('finance cannot create the doc with a Stripe account', 'DENY', 'fin', 'create', 'organizations/o1/private/finance', { data: { stripeAccountId: 'acct_mine' }, extra: orgM });
t('finance creates the doc with settings', 'ALLOW', 'fin', 'create', 'organizations/o1/private/finance', { data: { ein: '1' }, extra: orgM });
t('nobody puts an EIN on the public org', 'DENY', 'own', 'update', 'organizations/o1', { existing: orgP, data: { ...orgP, ein: '1' } });
t('nobody flips canReceiveGiving', 'DENY', 'own', 'update', 'organizations/o1', { existing: orgP, data: { ...orgP, canReceiveGiving: true } });
t('nobody creates an org with a Stripe account', 'DENY', 'own', 'create', 'organizations/o2', { data: { creatorId: 'own', stripeAccountId: 'a' } });
t('finance flips the donor fee offer', 'ALLOW', 'fin', 'update', 'organizations/o1', { existing: orgP, data: { ...orgP, donorFeeCoverOff: true } });
t('an org admin cannot flip the donor fee offer', 'DENY', 'adm', 'update', 'organizations/o1', { existing: orgP, data: { ...orgP, donorFeeCoverOff: true } });
t('nobody reads the Stripe account index', 'DENY', 'own', 'get', 'stripeAccountOrgs/acct_real', { existing: { orgId: 'o1' } });

// ── Business pages ──────────────────────────────────────────────────────────
const bp = { ownerId: 'boss', businessName: 'B' };
const bpM = [get('businessPages/b1', bp)];
const seatsDoc = { staffUids: ['clerk'], staffSeats: { clerk: { role: 'STAFF' } } };
t('the owner reads seats', 'ALLOW', 'boss', 'get', 'businessPages/b1/private/staff', { existing: seatsDoc, extra: bpM });
t('a seated person reads seats', 'ALLOW', 'clerk', 'get', 'businessPages/b1/private/staff', { existing: seatsDoc, extra: bpM });
t('a stranger cannot read seats', 'DENY', 'out', 'get', 'businessPages/b1/private/staff', { existing: seatsDoc, extra: bpM });
t('signed out cannot read seats', 'DENY', null, 'get', 'businessPages/b1/private/staff', { existing: seatsDoc, extra: bpM });
t('nobody lists seats', 'DENY', 'clerk', 'list', 'businessPages/b1/private', { existing: seatsDoc, extra: bpM });
t('staff cannot read the page finance doc', 'DENY', 'clerk', 'get', 'businessPages/b1/private/finance', { existing: { stripeAccountId: 'a', staffUids: ['clerk'] }, extra: bpM });
t('the owner reads the page finance doc', 'ALLOW', 'boss', 'get', 'businessPages/b1/private/finance', { existing: { stripeAccountId: 'a' }, extra: bpM });
t('even the owner cannot write seats', 'DENY', 'boss', 'update', 'businessPages/b1/private/staff', { existing: seatsDoc, data: { staffUids: ['x'] }, extra: bpM });
t('the owner cannot set a Stripe account on the page', 'DENY', 'boss', 'update', 'businessPages/b1', { existing: bp, data: { ...bp, stripeAccountId: 'a' } });
t('a page cannot be created with a Stripe account', 'DENY', 'boss', 'create', 'businessPages/b2', { data: { ...bp, stripeAccountId: 'a' } });
t('the owner cannot seat themselves staff', 'DENY', 'boss', 'update', 'businessPages/b1', { existing: bp, data: { ...bp, staffUids: ['x'] } });
t('the owner edits the page', 'ALLOW', 'boss', 'update', 'businessPages/b1', { existing: bp, data: { ...bp, businessName: 'C' } });
t('a person reads their own page list', 'ALLOW', 'clerk', 'get', 'staffPageIndex/clerk', { existing: { pageIds: ['b1'] } });
t('nobody reads another person page list', 'DENY', 'out', 'get', 'staffPageIndex/clerk', { existing: { pageIds: ['b1'] } });
t('nobody writes their own page list', 'DENY', 'clerk', 'update', 'staffPageIndex/clerk', { existing: { pageIds: [] }, data: { pageIds: ['b1'] } });

// ── F ───────────────────────────────────────────────────────────────────────
const emp = { uid: 'emp_org1_abc', displayName: 'E', photoURL: '', isEmployee: true, managedByUid: 'boss' };
t('nobody squats a real uid as a managed employee', 'DENY', 'out', 'create', 'users/realuid123', { data: { ...emp, uid: 'realuid123', managedByUid: 'out' } });
t('a manager creates an employee at a generated id', 'ALLOW', 'boss', 'create', 'users/emp_org1_abc', { data: emp });
t('a manager creates a provisioned seat profile', 'ALLOW', 'boss', 'create', 'users/prov_org1_abc123', { data: { ...emp, uid: 'prov_org1_abc123' } });
t('a manager cannot make an employee a platform admin', 'DENY', 'boss', 'update', 'users/emp_org1_abc', { existing: emp, data: { ...emp, role: 'admin' } });
const wc = get('classrooms/c1', { ownerId: 'teach' });
const wcKid = yes('classMembers/c1_kid');
t('an outsider cannot read class weather', 'DENY', 'out', 'get', 'classWeather/c1_2026-11-01', { existing: { classId: 'c1' }, extra: [wc] });
t('a student reads class weather', 'ALLOW', 'kid', 'get', 'classWeather/c1_2026-11-01', { existing: { classId: 'c1' }, extra: [wc, wcKid] });
t('an outsider cannot vote class weather', 'DENY', 'out', 'create', 'classWeather/c1_2026-11-01', { data: { classId: 'c1', day: '2026-11-01', counts: {} }, extra: [wc] });
t('a student votes class weather', 'ALLOW', 'kid', 'create', 'classWeather/c1_2026-11-01', { data: { classId: 'c1', day: '2026-11-01', counts: {} }, extra: [wc, wcKid] });
t('a teacher cannot grade someone outside the class', 'DENY', 'teach', 'create', 'studentGrades/g', { data: { classroomId: 'c1', studentId: 'out' }, extra: [wc] });
t('a teacher grades their student', 'ALLOW', 'teach', 'create', 'studentGrades/g', { data: { classroomId: 'c1', studentId: 'kid' }, extra: [wc, wcKid] });
t('nobody lists open TV pairing codes', 'DENY', 'out', 'list', 'tv_pairings', { existing: { uid: 'tv', expiresAt: 9e15 } });
t('a controller lists what they claimed', 'ALLOW', 'me', 'list', 'tv_pairings', { existing: { uid: 'tv', claimedBy: 'me' } });
t('someone with the code opens it', 'ALLOW', 'me', 'get', 'tv_pairings/ABC123', { existing: { uid: 'tv' } });
t('a client cannot forge a purchase', 'DENY', 'out', 'create', 'purchases/p', { data: { userId: 'out', itemId: 'album' } });
t('a live_chat_ id does not open a private room', 'DENY', 'out', 'get', 'chat_rooms/live_chat_x/messages/m', { existing: {}, extra: [yes('chat_rooms/live_chat_x'), get('chat_rooms/live_chat_x', { type: 'PRIVATE', participants: ['a', 'b'] })] });
t('a public live room stays open', 'ALLOW', 'out', 'get', 'chat_rooms/live_chat_y/messages/m', { existing: {}, extra: [yes('chat_rooms/live_chat_y'), get('chat_rooms/live_chat_y', { type: 'PUBLIC_LIVE', participants: [] })] });

// ── run ─────────────────────────────────────────────────────────────────────
const src = fs.readFileSync(process.argv[2] || new URL('../firestore.rules', import.meta.url), 'utf8');
const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const request = { method: c.method, path: c.path, time: new Date().toISOString() };
      if (c.uid) request.auth = { uid: c.uid, token: { email: `${c.uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } } };
      if (c.data) request.resource = { data: c.data };
      const tc = { expectation: c.expect, request, functionMocks: [...(c.extra || []), ...FALLBACK] };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
let res, out;
for (let i = 0; i < 6; i++) {
  res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body) });
  out = await res.json().catch(() => ({}));
  if (res.status !== 503) break;
  await new Promise(r => setTimeout(r, 2000 * (i + 1)));
}
if (!res.ok) { console.error(res.status, JSON.stringify(out).slice(0, 2000)); process.exit(2); }
let bad = 0;
(out.testResults || []).forEach((r, i) => { if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].expect, '·', cases[i].name, '→', r.state, (r.debugMessages || []).join(' ').slice(0, 220)); } });
console.log(`${cases.length - bad}/${cases.length} passed`);
process.exitCode = bad ? 1 : 0;
