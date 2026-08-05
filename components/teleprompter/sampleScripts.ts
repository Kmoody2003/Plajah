/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Script } from './types';

export const SAMPLE_SCRIPTS: Script[] = [
  {
    id: 'sample-tutorial',
    title: 'Teleprompter Tutorial & Demo',
    content: `# [Welcome & Intro]
Welcome to the modern dual-screen browser teleprompter! This application runs entirely in your browser and supports real-time multi-display synchronization.

# [Multi-Display Setup]
To output to a second display, simply:
1. Open this app on your second screen.
2. Choose "Prompter Display" (or "Talent View") on that second monitor.
3. Choose "Operator Console" (or "Controller View") on your primary monitor.
4. They will automatically sync in real-time using a local BroadcastChannel!

# [Powerful Features]
This prompter has everything you need for professional speech-making or video production:
- Ultra-smooth, frame-rate independent auto-scrolling.
- Instant speed controls (1 to 20) with live WPM/duration estimators.
- Mirror mode (Horizontal flip) for reflection glass rigs.
- Visual reading guides (Arrows, Line indicators, or text Highlights).
- Keyboard shortcuts for hands-free control.

# [Creating Cue Points]
Any paragraph that starts with a "#" character or square brackets "[Label]" is parsed as a cue point!
You can click any cue in the sidebar to jump directly to that section. Try clicking "Multi-Display Setup" or "Keyboard Shortcuts" in the panel to see the text instantly snap into place!

# [Keyboard Shortcuts]
Need quick adjustments without a mouse?
- Press SPACEBAR to start or pause scrolling.
- Press UP and DOWN arrow keys to adjust scroll speed.
- Press LEFT and RIGHT arrow keys to skip backward/forward.
- Press ESCAPE to reset to the top.

# [Closing & Outro]
Thank you for using this applet. Create, save, and edit your own scripts using the Script Manager dashboard. Good luck with your recording!`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'sample-gettysburg',
    title: "Gettysburg Address - Abraham Lincoln",
    content: `# [Introduction]
Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.

# [The Civil War]
Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.

# [The Dedication]
But, in a larger sense, we can not dedicate -- we can not consecrate -- we can not hallow -- this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract.

# [The World's Memory]
The world will little note, nor long remember what we say here, but it can never forget what they did here.

# [The Unfinished Task]
It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us -- that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion -- that we here highly resolve that these dead shall not have died in vain -- that this nation, under God, shall have a new birth of freedom -- and that government of the people, by the people, for the people, shall not perish from the earth.`,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000
  }
];
