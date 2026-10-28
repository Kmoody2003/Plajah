// Which top-level Firestore collections live in the plajah-ops database instead of plajah-prod.
//
// Firebase caps one database's ruleset at 256,000 compiled bytes, and plajah-prod outgrew it, so the
// org back office (ChMS, accounting, billing, HQ, church, Elevate Live, CRM, laundry, org vaults)
// moved to its own database with its own rules (firestore.ops.rules). This list is the single source
// of truth: the client (services/firebase.ts → dbFor), the server's REST helpers (dbIdFor) and the
// mirror/migration scripts all read it. Adding a collection here means moving its rule block into
// firestore.ops.rules too.
//
// Dependency-free on purpose: imported by both the browser bundle and server.ts.

export const PROD_DATABASE_ID = 'plajah-prod';
export const OPS_DATABASE_ID = 'plajah-ops';

export const OPS_COLLECTIONS: ReadonlySet<string> = new Set([
  // Accounting
  'acctAccounts', 'acctAlerts', 'acctBankAccounts', 'acctBankTxns', 'acctBudgets', 'acctExpenses',
  'acctJournals', 'acctPeriods', 'acctProjects', 'acctVendors',
  // Billing / invoicing
  'billingCounters', 'billingCustomers', 'billingEstimates', 'billingInvoices', 'billingItems',
  'billingPaymentLinks', 'billingSettings', 'posReceipts',
  // Church management
  'chmsAttendance', 'chmsAudit', 'chmsBatches', 'chmsCareFlags', 'chmsClaims', 'chmsContributions',
  'chmsFinanceMeta', 'chmsHouseholds', 'chmsImports', 'chmsMessages', 'chmsNotes', 'chmsPayoutLines',
  'chmsPayouts', 'chmsPeople', 'chmsPledges', 'chmsShifts', 'chmsTasks',
  'churchEduAssignments', 'churchEduAnswerKeys', 'churchEduJoinRequests', 'churchEduSubmissions',
  'orgAnnouncements', 'announcementResponses', 'docTemplates', 'orgTemplatePolicies',
  'churchPrayers', 'churchPrograms', 'congregants', 'donations',
  // Content HQ + org assets
  'contentRepurposeJobs', 'hqActivity', 'hqAssetVersions', 'hqAuditLog', 'hqComments',
  'hqGuestDecisions', 'hqReviewRequests', 'hqShareLinks', 'orgAssets', 'orgOnboardingVault',
  'orgSecurityEvents',
  // CRM
  'crmActivities', 'crmContacts',
  // Elevate Live
  'elevateBriefings', 'elevateLiveConfigs', 'elevateLiveRuns',
  // Laundry
  'laundryAccounts', 'laundryCounters', 'laundryInvoiced', 'laundryInvoices', 'laundryReminders',
  'laundrySettings',
  // Live co-editing of creative projects (services/coedit): ops log, snapshots, shared history,
  // presence and drafts. Self-contained rules (membership lives on the project doc).
  'coedit',
]);

/** plajah-prod collections copied read-only into plajah-ops, because ops rules authorize against them
 *  and rules can't read across databases. Kept in sync by the server (services/opsMirror.ts). */
export const OPS_MIRRORED_COLLECTIONS = ['organizations', 'productions', 'businessPages', 'admins'] as const;

/** The database a document path lives in, from its first segment ('chmsPeople/abc' or 'chmsPeople'). */
export function dbIdFor(pathOrCollection: string): string {
  const first = pathOrCollection.replace(/^\/+/, '').split('/')[0];
  return OPS_COLLECTIONS.has(first) ? OPS_DATABASE_ID : PROD_DATABASE_ID;
}
