/**
 * Cross-curricular connections: the same idea showing up in different subjects, so learning is
 * holistic. Science explains music, chemistry colours art, engineering shapes architecture, geology
 * shapes history. Each connection links a lesson to another lesson (any course), to a Labs science
 * discipline, or to an interactive Labs simulator.
 *
 * Accuracy rules for every connection:
 *  - It must be a real, specific link between ideas that a standard reference would support, never a
 *    forced or merely thematic one. If there is no honest connection, write none.
 *  - `why` is ONE sentence stating what the two share, written so it reads correctly from either end
 *    ("Both depend on ..."), with no claim the linked lesson does not actually teach.
 *  - Both endpoints must exist (validated by tests).
 */
export type ConnectionKind = 'science-behind' | 'math-behind' | 'history-of' | 'art-of' | 'application' | 'same-idea';

export type ConnectionTarget =
  | { courseId: string; lessonId: string }   // another lesson
  | { labs: string }                          // a Labs discipline id, e.g. 'physics'
  | { sim: string };                          // a Labs simulator id (components/labs/Simulators SIMULATORS keys)

export interface Connection {
  from: { courseId: string; lessonId: string };
  to: ConnectionTarget;
  kind: ConnectionKind;
  why: string;
}
