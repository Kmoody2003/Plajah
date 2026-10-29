// Lab stand-in for services/organizationService: one org this account administers.
export async function fetchUserOrganizations() {
  return [{ id: 'org_lab', name: 'Grace Chapel', creatorId: 'someone', admins: ['lab-user'] }];
}
