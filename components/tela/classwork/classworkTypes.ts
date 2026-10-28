/** Where Tela Classwork files and sends what it builds. Set by whoever opened Tela (a class, the Education hub). */
export interface TelaClassworkContext {
  orgId: string;
  orgName: string;
  programId?: string;
  programName?: string;
  weekId?: string;
  domain?: 'CHRISTIAN_EDUCATION' | 'ACADEMIA' | 'ORG_TRAINING';
}

/** Tela's "Back to …" button: returns to the screen that opened Tela. */
export interface TelaReturnTarget {
  label: string;
  onReturn: () => void;
}
