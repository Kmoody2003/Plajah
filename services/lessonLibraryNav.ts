// Opens the Lesson Library over whatever the viewer is on (components/library/LessonLibraryOverlay, mounted
// once in App). It is the one library for every education workflow — an org's Christian Ed or training,
// a school, an Academia teacher on their own — so Content HQ, Tela and every "Add a lesson" button use it.

export interface LessonLibraryRequest {
  /** Open on this org's library. Left out: the viewer's first teaching org, else their own lessons. */
  orgId?: string;
  orgName?: string;
  /** Open on the viewer's own lessons (a teacher with no org, or their personal shelf). */
  mine?: boolean;
  /** The class the lessons are for (Christian Ed course / program id), so scheduling starts there. */
  programId?: string;
  weekId?: string;
  /** Open the "Assign to class" sheet for these lessons (Content HQ's Assign to class). */
  assignUnitIds?: string[];
}

export const OPEN_LESSON_LIBRARY = 'plajah:openLessonLibrary';

export function openLessonLibrary(req: LessonLibraryRequest = {}): void {
  window.dispatchEvent(new CustomEvent(OPEN_LESSON_LIBRARY, { detail: req }));
}
