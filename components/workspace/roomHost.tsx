// Where a full-screen room portals itself. On its own a room portals to <body> to sit above the
// app's chrome; inside the workspace shell, each tab provides its own pane so the room stays under
// the tab bar and hides with its tab.

import { createContext, useContext } from 'react';

export const RoomHostContext = createContext<HTMLElement | null>(null);
/** The element a room should portal into: the shell's tab pane, or <body>. */
export function useRoomHost(): HTMLElement { return useContext(RoomHostContext) ?? document.body; }
