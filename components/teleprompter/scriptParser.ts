/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CuePoint } from './types';

/**
 * Parses script text to extract headings or brackets as cue points.
 * Returns an array of CuePoint objects.
 */
export function parseCuePoints(content: string): CuePoint[] {
  const lines = content.split('\n');
  const cuePoints: CuePoint[] = [];
  let characterOffset = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Check if the line is a cue point marker
    // E.g., "# [Welcome]" or "# Welcome" or "[Welcome]" or "## Welcome"
    const hashMatch = trimmed.match(/^#+\s*\[?([^\]]+)\]?$/);
    const bracketMatch = trimmed.match(/^\[([^\]]+)\]$/);
    
    if (hashMatch) {
      cuePoints.push({
        id: `cue-${index}-${cuePoints.length}`,
        label: hashMatch[1].trim(),
        lineIndex: index,
        characterOffset: characterOffset
      });
    } else if (bracketMatch) {
      cuePoints.push({
        id: `cue-${index}-${cuePoints.length}`,
        label: bracketMatch[1].trim(),
        lineIndex: index,
        characterOffset: characterOffset
      });
    }
    
    // Track cumulative character offset (plus newline)
    characterOffset += line.length + 1;
  });

  return cuePoints;
}

/**
 * Estimates reading duration in seconds based on word count.
 * Average reading speed for presentations is about 130-150 words per minute.
 */
export function estimateDuration(text: string, wordsPerMinute: number = 140): number {
  const cleanText = text.replace(/[#\[\]]/g, '');
  const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount === 0) return 0;
  return (wordCount / wordsPerMinute) * 60;
}
