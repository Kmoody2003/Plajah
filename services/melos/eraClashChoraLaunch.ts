// Open a showcase project (today: the Era Clash score cues) in Chora Studio from anywhere in the app.
// Chora Studio (BeatsRoom) builds a fresh copy from the read-only template, so nothing here carries the
// document itself: the id travels in the OPEN_MELOS_BEATS event and, in case Chora mounts later than the
// event (lazy load, view switch), in sessionStorage.

export const TEMPLATE_PROJECT_PENDING_KEY = 'melos_template_project_pending';

export function launchTemplateProjectInChora(projectId: string): void {
  try { sessionStorage.setItem(TEMPLATE_PROJECT_PENDING_KEY, projectId); } catch { /* storage blocked: the event still carries it */ }
  window.dispatchEvent(new CustomEvent('OPEN_MELOS_BEATS', { detail: { templateProjectId: projectId } }));
}
