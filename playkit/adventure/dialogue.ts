// playkit/adventure/dialogue.ts
//
// Dialogue as data, for any game with characters to talk to (the "dialogue-trigger" behaviour of the
// adventure template). A graph of nodes; each node is a line, optional choices, and an optional action.
// Conditions and actions are short strings the game interprets ("has:HOME", "give:OPEN"), so a creator
// can write a conversation in the Studio without code, and Aria can draft one from a story.

export interface DialogueChoice { label: string; goto?: string; if?: string; do?: string }
export interface DialogueNode {
  who?: string;
  text: string;
  /** Shown only when the game says this holds. */
  if?: string;
  /** Node to try when `if` fails. */
  else?: string;
  choices?: DialogueChoice[];
  goto?: string;
  /** Runs when the node is shown. */
  do?: string;
}
export type DialogueGraph = Record<string, DialogueNode>;

export interface DialogueContext {
  test(cond: string): boolean;
  act(action: string): void;
}

export class DialogueRunner {
  private nodeId: string | null = null;
  private guard = 0;
  constructor(private graph: DialogueGraph, private ctx: DialogueContext) {}

  get done() { return this.nodeId === null; }
  get id() { return this.nodeId; }

  /** The current node with its choices filtered by their conditions. */
  current(): (DialogueNode & { choices?: DialogueChoice[] }) | null {
    if (!this.nodeId) return null;
    const n = this.graph[this.nodeId];
    if (!n) return null;
    return { ...n, choices: n.choices?.filter((c) => !c.if || this.ctx.test(c.if)) };
  }

  start(id = 'start') { this.guard = 0; this.enter(id); return this.current(); }

  /** Advance a node without choices. */
  next() {
    const n = this.current();
    if (!n) return null;
    if (n.choices?.length) return n;
    this.enter(n.goto ?? null);
    return this.current();
  }

  choose(i: number) {
    const n = this.current();
    const c = n?.choices?.[i];
    if (!c) return n;
    if (c.do) this.ctx.act(c.do);
    this.enter(c.goto ?? null);
    return this.current();
  }

  private enter(id: string | null) {
    while (id && this.guard++ < 64) {
      const n = this.graph[id];
      if (!n) { id = null; break; }
      if (n.if && !this.ctx.test(n.if)) { id = n.else ?? null; continue; }
      this.nodeId = id;
      if (n.do) this.ctx.act(n.do);
      return;
    }
    this.nodeId = null;
  }
}
