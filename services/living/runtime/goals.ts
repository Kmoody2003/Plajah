import type { Goal } from '../contracts';
import { evalCond, type VarGetter } from './conditions';

/** Goals fire once each, the first time their condition holds. */
export class GoalTracker {
  private done = new Set<string>();
  constructor(private goals: Goal[] = []) {}
  /** Returns the goals that completed on this check (and remembers them). */
  check(get: VarGetter): Goal[] {
    const fired: Goal[] = [];
    for (const g of this.goals) if (!this.done.has(g.id) && evalCond(g.when, get)) { this.done.add(g.id); fired.push(g); }
    return fired;
  }
  isDone(id: string) { return this.done.has(id); }
  completed(): string[] { return [...this.done]; }
  reset() { this.done.clear(); }
}
