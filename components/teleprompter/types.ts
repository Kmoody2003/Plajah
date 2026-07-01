/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Script {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface CuePoint {
  id: string;
  label: string;
  lineIndex: number;
  characterOffset: number;
}

export type PrompterTheme = 'dark' | 'light' | 'amber' | 'cobalt';
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';
export type GuideType = 'arrow' | 'line' | 'highlight' | 'none';

export interface PrompterSettings {
  speed: number;            // 0 (paused) to 20 (fast)
  fontSize: number;         // 24px to 120px
  alignment: TextAlignment;
  isMirroredH: boolean;     // horizontal flip for glass mirrors
  isMirroredV: boolean;     // vertical flip
  marginWidth: number;      // side padding percentage (0% to 40%)
  theme: PrompterTheme;
  guideType: GuideType;
  guidePosition: number;    // percentage from top (e.g., 30% or 50%)
  lineHeight: number;       // line spacing multiplier (e.g. 1.2, 1.5, 2.0)
}

export interface PrompterState {
  scriptId: string;
  isPlaying: boolean;
  scrollPercent: number;    // 0 to 100
  lastUpdatedBy: 'operator' | 'prompter';
  timestamp: number;
}

export type SyncMessage =
  | { type: 'STATE_UPDATE'; state: PrompterState; settings: PrompterSettings; scriptContent: string; title: string }
  | { type: 'SCROLL_TO_PERCENT'; percent: number }
  | { type: 'CUE_JUMP'; label: string; lineIndex: number }
  | { type: 'PING'; sender: 'operator' | 'prompter' }
  | { type: 'PONG'; sender: 'operator' | 'prompter' };
