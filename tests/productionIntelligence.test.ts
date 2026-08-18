import test from 'node:test';
import assert from 'node:assert/strict';
import type { Production, ProductionMember } from '../services/filmProductionService';
import { buildAuthorizedProductionCorpus, type ProductionCorpusData } from '../services/productionIntelligenceService';

const production: Production = {
  id: 'prod-1', ownerUid: 'owner', title: 'Night Shift', memberUids: ['owner', 'crew'],
  authority: { crew: { roleKey: 'CREW', position: '2nd AC', department: 'CAMERA', permissions: [], assignedBy: 'owner', assignedAt: 1 } },
  totalDays: 3, createdAt: 1, updatedAt: 1,
};

const members: ProductionMember[] = [{
  id: 'crew', uid: 'crew', name: 'Casey', role: '2nd AC', dept: 'CAMERA', status: 'ACTIVE',
  email: 'casey@example.com', phone: '555-0100', dietaryNotes: 'Private medical note', createdAt: 1,
}];

function context(askingUid: string, permissions: ProductionCorpusData['permissions']): ProductionCorpusData {
  return {
    production, askingUid, permissions, members,
    scriptDraft: { id: 'draft-1', elements: [{ type: 'ACTION', text: 'Camera rolls.' }] },
    scenes: [{ id: 'scene-1', sceneNum: '1' }], callSheets: [{ id: 'cs-1', shootDay: 1 }],
    tasks: [{ id: 'task-1', title: 'Charge batteries' }], breakdownElements: [{ id: 'bd-1', name: 'Evidence box' }],
    schedulePlans: [{ id: 'schedule-1', status: 'APPROVED' }], scheduleConstraints: [], recipientDeliveries: [{ id: 'delivery-1', status: 'CONFIRMED' }], callSheetTemplates: [],
    budgetLines: [{ id: 'budget-1', actual: 1200 }], locations: [{ id: 'loc-1', name: 'Warehouse' }],
    festivals: [], dprs: [{ id: 'dpr-1', notes: 'Overtime' }], craftMenu: [], craftOrders: [],
    workflowEvents: [{ id: 'evt-1', type: 'SCRIPT_GREENLIT' }],
    jobPostings: [{ id: 'job-1', title: 'Gaffer' }], applications: [{ id: 'app-1', applicantEmail: 'private@example.com' }],
  };
}

test('crew corpus omits budget, reports, hiring, and sensitive contact fields', () => {
  const built = buildAuthorizedProductionCorpus(context('crew', []));
  const parsed = JSON.parse(built.text);
  assert.deepEqual(parsed.budgetLines, []);
  assert.deepEqual(parsed.dailyProductionReports, []);
  assert.deepEqual(parsed.hiring.applications, []);
  assert.equal(parsed.crewAndCast[0].email, undefined);
  assert.equal(parsed.crewAndCast[0].phone, undefined);
  assert.equal(built.redactions.length, 4);
});

test('authorized producer corpus includes operationally permitted records', () => {
  const built = buildAuthorizedProductionCorpus(context('crew', [
    'MANAGE_BUDGET', 'MANAGE_REPORTS', 'MANAGE_HIRING', 'VIEW_SENSITIVE_CONTACTS',
  ]));
  const parsed = JSON.parse(built.text);
  assert.equal(parsed.budgetLines.length, 1);
  assert.equal(parsed.dailyProductionReports.length, 1);
  assert.equal(parsed.hiring.applications.length, 1);
  assert.equal(parsed.crewAndCast[0].email, 'casey@example.com');
  assert.deepEqual(built.redactions, []);
});

test('owner receives the complete production corpus', () => {
  const built = buildAuthorizedProductionCorpus(context('owner', []));
  const parsed = JSON.parse(built.text);
  assert.equal(parsed.authority.role, 'OWNER');
  assert.equal(parsed.budgetLines.length, 1);
  assert.equal(parsed.dailyProductionReports.length, 1);
  assert.equal(parsed.hiring.openings.length, 1);
  assert.equal(parsed.crewAndCast[0].dietaryNotes, 'Private medical note');
});
