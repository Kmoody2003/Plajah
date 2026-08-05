import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Compass, X, Sparkles, ChevronRight, Info, Lightbulb } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmartGuideProps {
  view: string;
  enabled: boolean;
  onToggle: () => void;
  isFirstTime: boolean;
  onDismissFirst: () => void;
}

export interface Tip {
  icon: string;
  label: string;
  desc: string;
}

interface PageEntry {
  title: string;
  intro: string;
  tips: Tip[];
}

// ─── Phase 1: Attribute map ───────────────────────────────────────────────────
// Keys match exact `title`, `aria-label`, or `data-guide` attribute strings
// found in the actual codebase (App.tsx, PlayerView.tsx, ClipLauncher.tsx, etc.)

const ATTR_TIPS: Record<string, Tip> = {
  // Nano Controller
  "Nano Controller": { icon: "🎛️", label: "Nano Controller", desc: "Your always-on mini music player docked in the sidebar. It stays here no matter which page you visit. Click the layers icon (↰ top-left of the card) to flip it over and access the seek bar, skip buttons, and theme switcher." },
  "Flip to back":    { icon: "🔄", label: "Flip the Nano Controller", desc: "Flip this card to the back side. There you'll find the full seek bar so you can scrub through the song, skip forward or back, and pick a theme. Flip it back at any time with the ↩ button." },
  "Flip back":       { icon: "↩️", label: "Return to Front", desc: "Flip the nano player back to the front face — the one showing cover art and current track info." },
  "Full Player":     { icon: "🎵", label: "Open Full Player", desc: "Expand to the full music player. You'll get the complete track list, synced lyrics, the FX Stage GPU visualizer, and spatial audio controls all in one view." },
  "Mini Player":     { icon: "📌", label: "Mini Player", desc: "Shrink the player into a floating mini-bar at the bottom of the screen so you can keep browsing freely. Click the bar to restore the full player at any time." },
  "Compact":         { icon: "🔻", label: "Compact Mode", desc: "Collapses the nano controller to a tiny icon with a progress ring. Almost zero space used. Click 'Expand' to bring it back." },
  "Expand":          { icon: "⬆️", label: "Expand Player", desc: "Restore the nano controller to its full size from compact mode." },
  "Restore player":  { icon: "▶️", label: "Restore Player", desc: "Click here to bring the nano player back from its minimized state." },

  // Audio & spatial
  "Spatial Audio":       { icon: "🎧", label: "Spatial / 3D Audio", desc: "Enables HRTF binaural processing — the music moves around your head in 3D space. Works best with headphones. Choose 3D for a slow orbit, or 3D+ for music-reactive positioning." },
  "Frequency Visualizer":{ icon: "📊", label: "Frequency Visualizer", desc: "Shows a live waveform that bounces to the audio frequencies in real-time. Toggle it on or off." },
  "3D Depth":            { icon: "🌐", label: "3D Depth Camera", desc: "Adds a live parallax depth effect to album artwork — the cover looks like it's floating in 3D as you move your cursor." },

  // Nano back-face theme switcher
  "Dark":   { icon: "🌙", label: "Dark Theme", desc: "Switch the whole platform to a clean dark mode — minimal and easy on the eyes." },
  "Light":  { icon: "☀️", label: "Light Theme", desc: "Switch to a bright light theme — great for daytime use." },
  "Plajah": { icon: "✨", label: "Plajah Theme", desc: "The signature Plajah look — deep purple-to-orange gradient with glass panels." },
  "Nebula": { icon: "🌌", label: "Nebula Theme", desc: "A deep indigo cosmic theme, inspired by galaxies and deep space." },

  // Nano quick-nav (back face)
  "Home":       { icon: "🏠", label: "Home / Global Archive", desc: "Go to the Global Archive — every public album, video, and book on Plajah." },
  "My Profile": { icon: "👤", label: "Your Profile", desc: "View your public artist profile — the page other people see when they visit your account." },
  "Search":     { icon: "🔍", label: "Find People & Content", desc: "Search for artists, fans, albums, videos, articles, and games across the whole platform at once." },

  // Sidebar bottom bar
  "Sign out":       { icon: "🚪", label: "Sign Out", desc: "Sign out of your current account. Everything you've uploaded stays safe in the cloud." },
  "My Projects":    { icon: "📁", label: "Your Projects", desc: "A quick-access drawer showing all your in-progress albums, uploads, and content drafts. Never lose your work." },
  "Settings":       { icon: "⚙️", label: "Creator Dashboard", desc: "Opens your personal dashboard — manage your profile, see stream analytics, configure uploads, and tune your account." },
  "Switch accounts":{ icon: "👤", label: "Account Switcher", desc: "Click your avatar to switch between up to 4 linked accounts. Or use the keyboard shortcut Insert + 1–4 to hot-switch instantly without opening this menu." },

  "Smart Guide on — click to turn off":            { icon: "🧭", label: "Smart Guide Is On", desc: "The Smart Guide is active. Whenever your mouse is idle for 2 seconds, a tip card appears explaining the feature your cursor is near. Click to turn it off." },
  "Smart Guide off — click to enable feature hints":{ icon: "🧭", label: "Turn On Smart Guide", desc: "Smart Guide is currently off. Click this compass icon to turn it on and get live contextual hints as you explore the platform." },

  "Collapse Sidebar": { icon: "◀️", label: "Collapse the Sidebar", desc: "Shrink the left panel to icon-only mode. Every section is still clickable — just more compact. Click the Plajah logo again to fully expand." },
  "Expand Sidebar":   { icon: "▶️", label: "Expand the Sidebar", desc: "Restore the full sidebar with section labels, the nano controller, and your profile card." },

  // Profile card
  "Profile Card": { icon: "🪪", label: "Your Profile Card", desc: "This shows your active account. Click your avatar to switch accounts or sign out. The 'Creator Tools' button below it opens your workspace for uploading and managing content." },

  // Player view actions
  "The Breakdown — analyze key, tempo, chords & sheet music": { icon: "🎼", label: "Track Breakdown", desc: "AI-powered track analysis — tap this on any song to instantly see its musical key, tempo (BPM), chord progressions, and auto-generated sheet music." },
  "Plajah Pixels — send this song into the visualizer":       { icon: "✨", label: "Plajah Pixels Visualizer", desc: "Launch the GPU-powered FX Stage for this song. Real-time reactive visuals — you can customize them with shaders, 3D scenes, clip layers, and audio-driver mappings." },
  "Add this song to a playlist":  { icon: "➕", label: "Add to Playlist", desc: "Save this track to one of your playlists, or create a new one on the spot." },
  "Back to album art":             { icon: "🖼️", label: "Back to Album Art", desc: "Return to the main album art view from the current expanded panel." },
  "Back to stage":                 { icon: "🎬", label: "Back to Stage", desc: "Return from fullscreen mode back to the FX Stage / visualizer layout." },
  "Full Stage":                    { icon: "🖥️", label: "Full Stage Mode", desc: "Expand the visualizer to completely fill the screen — no UI chrome, just visuals and music." },
  "Shift lyrics earlier":          { icon: "⏮️", label: "Shift Lyrics Timing", desc: "Move the synced lyrics display slightly earlier if they're appearing behind the audio." },
  "Shift lyrics later":            { icon: "⏭️", label: "Shift Lyrics Timing", desc: "Move the synced lyrics display slightly later if they're appearing ahead of the audio." },
  "Reset offset":                  { icon: "↺", label: "Reset Lyrics Timing", desc: "Reset the lyrics sync offset back to zero — the default timing from the track metadata." },
  "Dolby Atmos passthrough active on this device": { icon: "🔊", label: "Dolby Atmos Active", desc: "This track is Dolby Atmos mastered and your device supports it — you're hearing true spatial audio direct from the source codec, no processing needed." },
  "This device supports Dolby Atmos passthrough":  { icon: "🔊", label: "Dolby Capable Device", desc: "Your browser and hardware can handle Dolby Atmos passthrough. When you play an Atmos-tagged track, the badge will turn blue and active." },

  // Spatial mode buttons (PlayerView fullscreen bar)
  "Spatial audio off":                              { icon: "🔈", label: "Spatial Audio Off", desc: "Currently standard stereo. Click '3D' for an orbiting audio mode, or '3D+' for music-reactive HRTF positioning where bass, beats and treble all move the sound." },
  "Orbit — slow 3D circle (HRTF)":                 { icon: "🌀", label: "3D Orbit Mode", desc: "The audio slowly circles around your head using HRTF binaural processing. Best experienced with headphones on." },
  "Reactive — bass, beat & treble drive 3D position":{ icon: "🎵", label: "3D+ Reactive Mode", desc: "The music controls where the sound comes from — bass pulls it close, treble spins it, and beats push it forward. Extremely immersive with headphones." },

  // Plajah Pixels / FX Stage
  "Exit Plajah Pixels":          { icon: "✖️", label: "Exit Plajah Pixels", desc: "Close the FX Stage and return to the standard music player view." },
  "Toggle tracklist":            { icon: "📋", label: "Show / Hide Tracklist", desc: "Toggle the track list panel inside Plajah Pixels so you can pick a different song without leaving the visualizer." },
  "Fullscreen":                  { icon: "⛶", label: "Fullscreen Visualizer", desc: "Expand Plajah Pixels to fill your entire display — pure visuals with no UI. Press Escape to exit." },
  "Dismiss UI (full-screen visual)": { icon: "👁️", label: "Hide UI", desc: "Hide all panels and controls for a clean full-screen visual experience. Move your mouse to bring them back." },
  "Program Output — open visualizer on a second display": { icon: "🖥️", label: "Second Screen Output", desc: "Open the visualizer output on a second monitor or display. The editor stays on your main screen." },
  "Send panel edits to the Preview or the live Program":  { icon: "📡", label: "Preview vs Program", desc: "Switch between sending your edits to the Preview (safe staging) or directly to the live Program output." },
  "Custom GLSL shader (Shadertoy-style)":             { icon: "🌈", label: "GLSL Shader Panel", desc: "Write or paste a Shadertoy-style GLSL shader. It runs on the GPU and reacts to audio data — bass, treble, BPM — in real-time at 60fps." },
  "3D visualizers (water, reflections, orbiting camera)":{ icon: "🌊", label: "3D Scene Panel", desc: "Add 3D effects — water ripples, mirror reflections, and a camera that orbits to the beat. All GPU-accelerated." },
  "Overlay layers (Lottie / HTML)":                   { icon: "🎭", label: "Overlay Layers", desc: "Stack animated Lottie files or custom HTML/CSS on top of your visuals — use them for animated text, logos, or reactive UI elements." },
  "Toggle Configuration Panel":                       { icon: "🔧", label: "Settings / Config Panel", desc: "Open the main Plajah Pixels settings — toggle GPU composite canvas, recorder mode, depth camera, lighting engine, and more." },
  "Scene Automation: cycle OFF → NEXT → RANDOM":      { icon: "🔁", label: "Scene Automation", desc: "Automate scene changes to the music. 'Next' cycles through scenes in order each bar, 'Random' picks them unpredictably. The beat drives it." },
  "Power off Clip Launcher — returns to fly-drawer mode": { icon: "⚡", label: "Power Off Clip Launcher", desc: "Turns the Clip Launcher off and returns to the compact fly-drawer view. The current scene stays frozen until you turn it back on." },
  "Add a new layer above the stack":                  { icon: "➕", label: "Add Layer", desc: "Insert a new visual layer at the top of the layer stack. Layers are rendered in order — higher layers appear in front." },
  "Global Blend Overlay — toggles blend compositing across all layers and columns": { icon: "🎨", label: "Global Blend Overlay", desc: "Turn on blending compositing across every layer and column simultaneously. Creates painterly, overlapping visuals instead of hard-cut swaps." },
  "Row automation: cycle OFF → NEXT → RANDOM":        { icon: "🔀", label: "Row Automation", desc: "Automatically fire clips in this row in sync with the music. 'Next' steps left to right through scene columns, 'Random' picks one each cycle." },
  "Interval in seconds":                              { icon: "⏱️", label: "Row Automation Interval", desc: "How many seconds between automatic clip fires in this row. Lower = faster switching." },
  "Scene interval in seconds":                        { icon: "⏱️", label: "Scene Change Interval", desc: "How many seconds between automatic scene changes. Only active when Scene Automation is set to Next or Random." },
  "Bars between scene changes":                       { icon: "🎵", label: "Bars Per Scene", desc: "Set how many musical bars play before the scene changes. Works in beat-sync mode — changes happen right on the bar line." },
  "Clear all clips in this row":                      { icon: "🗑️", label: "Clear Row", desc: "Remove every clip from this Clip Launcher row and reset it to empty." },
  "Remove layer":                                     { icon: "✂️", label: "Remove Layer", desc: "Delete this visual layer entirely from the stack. This cannot be undone." },
  "Bypass layer":                                     { icon: "⏭️", label: "Bypass Layer", desc: "Temporarily disable this layer without deleting it. Toggle off to re-enable." },
  "Sync interval to Studio Scene Automation":         { icon: "🔗", label: "Sync to Scene Automation", desc: "Lock this row's interval to match the main Scene Automation timing — so everything changes together on the same beat." },
  "Add a driver → target mapping":                    { icon: "🎛️", label: "Add Audio-to-Visual Mapping", desc: "Create a connection between a music element (beat, intensity, BPM, treble) and a visual parameter. The audio literally drives what the visuals do." },
  "Remove mapping":                                   { icon: "✂️", label: "Remove Mapping", desc: "Delete this audio-to-visual connection. The visual target will stop reacting to that music element." },
  "Auto-pilot show":                                  { icon: "🤖", label: "Auto-Pilot Show", desc: "Let Plajah Pixels run automatically — it will cycle through scenes, layers, and effects in sync with the music without any manual input." },
  "Add marker at playhead":                           { icon: "📍", label: "Add Timeline Marker", desc: "Drop a marker at the current playback position in the timeline. Useful for cue points and scene change notes." },
  "Previous track":                                   { icon: "⏮️", label: "Previous Track", desc: "Go back to the previous track in the album or queue." },
  "Next track":                                       { icon: "⏭️", label: "Next Track", desc: "Skip to the next track in the album or queue." },
  "Hide":                                             { icon: "✖️", label: "Hide Panel", desc: "Close this panel. You can reopen it from the toolbar at the top of Plajah Pixels." },
};

// ─── Phase 2: Button text map ─────────────────────────────────────────────────
// Matches the visible text label of nav buttons, tab buttons, and action buttons.
// Keys are lowercase trimmed text content.

const TEXT_TIPS: Record<string, Tip> = {
  // Sidebar nav
  "my profile":         { icon: "👤", label: "Your Profile Page", desc: "This takes you to your public artist page — what other people see when they visit your account. You can edit it from Creator Dashboard." },
  "global archive":     { icon: "🌍", label: "Global Archive", desc: "Browse every public album, video, book, and game published on Plajah. A good place to discover new music and creators." },
  "chora":              { icon: "🎵", label: "Chora — Music", desc: "The main music section. Browse albums, discover artists, and start playing with a single click. Your nano controller in the sidebar stays synced." },
  "plajah social":      { icon: "👥", label: "Social Feed", desc: "Your timeline — posts, music drops, debates, and updates from people you follow. You can also post here yourself." },
  "worlds":             { icon: "🌐", label: "Worlds", desc: "Creative universes — link your music, characters, videos, and stories into one connected IP. Think of it as the official home for your artistic universe." },
  "reello":             { icon: "📹", label: "Reello — Videos", desc: "Short-form and music video section. Browse music videos, vlogs, and creative shorts from creators on the platform." },
  "taleo":              { icon: "🎬", label: "Taleo — Movies & TV", desc: "Full-length movies, TV episodes, and documentaries from independent creators. Stream directly in your browser." },
  "plajah sports":      { icon: "⚽", label: "Plajah Sports", desc: "Sports scores, news, fan content, and community around your favorite teams and leagues." },
  "health & fitness":   { icon: "💪", label: "Health & Fitness", desc: "Workout videos, health content, and fitness communities from creators on the platform." },
  "the newstand":       { icon: "📰", label: "The Newstand", desc: "Long-form articles, newsletters, and editorial content from writers and creators on Plajah." },
  "lorea":              { icon: "📚", label: "Lorea — Books", desc: "The digital library. Read books, comics, and graphic novels directly in your browser with the built-in reader." },
  "plajah labs":        { icon: "🔬", label: "Plajah Labs", desc: "Science, engineering, and academia hub — research tools, STEM classrooms, and peer discussion for curious minds." },
  "radio":              { icon: "📻", label: "Radio", desc: "Live artist radio stations and curated broadcasts. Music that plays continuously like a real radio station." },
  "live hub":           { icon: "🔴", label: "Live Hub", desc: "See everything happening live on the platform right now. Browse streams or go live yourself to your audience." },
  "clubs":              { icon: "🏛️", label: "Clubs", desc: "Community groups around shared interests — genres, artists, sports, topics. Join public clubs instantly." },
  "chat":               { icon: "💬", label: "Chats", desc: "Private and group messaging. Send text, voice notes, and drop music tracks directly into conversations." },
  "discussion":         { icon: "🗣️", label: "Discussion Boards", desc: "Open forum boards for community conversation. Post questions, opinions, and debates on any topic." },
  "the postman":        { icon: "📬", label: "The Postman", desc: "Formal AI-assisted dispatch and messaging system for studio, business, and creator communications." },
  "find people":        { icon: "🔍", label: "Find People", desc: "Search for artists, fans, and profiles on Plajah. Follow people to see their content in your feed." },
  "help center":        { icon: "❓", label: "Help Center", desc: "Guides, FAQs, and tutorials for every part of Plajah. Search by topic or browse by section." },
  "sanctuary":          { icon: "🛡️", label: "Sanctuary", desc: "Support your favorite creators through exclusive memberships, private content, and direct fan support." },
  "plajah store":       { icon: "🛍️", label: "Plajah Store", desc: "Shop merch, collectibles, and digital goods from artists across the platform." },
  "charity":            { icon: "❤️", label: "Charity", desc: "Support non-profits and explore fundraising campaigns from creators and organizations." },
  "classrooms":         { icon: "🏫", label: "Classrooms", desc: "Learn new skills from experts in interactive, live-hosted classroom sessions." },
  "creator tools":      { icon: "⚡", label: "Creator Tools", desc: "Your full workspace — upload tracks, edit albums, build worlds, manage your store, and access every creator feature in one place." },
  "creator hub":        { icon: "⚡", label: "Creator Hub", desc: "Your full workspace — upload tracks, edit albums, build worlds, manage your store, and access every creator feature in one place." },
  "plajah business":    { icon: "💼", label: "Plajah Business", desc: "Business dashboard for managing brand pages, partnerships, and commercial content on the platform." },
  "fabula":             { icon: "🎭", label: "Fabula", desc: "Story-driven video content — scripted series, narrative films, and creator-produced episodic content." },
  "tv studio":          { icon: "📺", label: "TV Studio", desc: "Produce and broadcast your own live TV-style shows directly from the platform." },
  "live events":        { icon: "🎟️", label: "Live Events", desc: "Pay-per-view events, ticket sales, and exclusive live broadcasts from artists and event organizers." },
  "photos":             { icon: "📸", label: "Global Photos", desc: "Photo galleries, art portfolios, event albums, and spatial media from creators across the platform." },
  "pay it forward":     { icon: "🤝", label: "Pay It Forward", desc: "A community giving system — contribute to others and pass positive energy forward through the platform." },
  "apps":               { icon: "📱", label: "Apps", desc: "Install and run community-built web applications and tools directly inside the platform." },
  "games":              { icon: "🎮", label: "Games", desc: "Play interactive web games directly in your browser — no downloads needed." },
  "partner sites":      { icon: "🌐", label: "Partner Sites", desc: "Access partner web apps and external platforms that are integrated with Plajah." },
  "promote":            { icon: "📣", label: "Promote Content", desc: "Create and manage ad campaigns to promote your music, videos, or profile to targeted audiences on the platform." },
  "artist manager":     { icon: "🎙️", label: "Artist Manager", desc: "Manage multiple artists under your label or management company from a single dashboard." },
  "creator tool bag":   { icon: "🧰", label: "Creator Tool Bag", desc: "Your full suite of creation tools — upload, edit, publish, and monetize all your content from one place." },

  // Player view tabs
  "art":       { icon: "🖼️", label: "Album Art View", desc: "Display the full album artwork. Click the cover to view it at full size or enter the FX Stage for reactive visuals." },
  "slideshow": { icon: "🎞️", label: "Slideshow Mode", desc: "Cycles through the album's artwork images automatically. Great for watching while the music plays." },
  "fx stage":  { icon: "✨", label: "FX Stage", desc: "Enter Plajah Pixels — a real-time GPU visualizer that reacts to the music. Customize it with shaders, 3D scenes, and clip layers." },
  "flow":      { icon: "〰️", label: "Flow Visualizer", desc: "A fluid waveform visualizer that flows and ripples to the music. One of two built-in styles for the fullscreen bar." },
  "paint":     { icon: "🎨", label: "Paint Pool Visualizer", desc: "An ink-pool style visualizer where color splashes and bleeds to the music. Select this in the fullscreen view." },
  "breakdown": { icon: "🎼", label: "Track Breakdown", desc: "AI-powered analysis — tap for the song's key, BPM, chord progression, and auto-generated sheet music." },
  "pp":        { icon: "✨", label: "Plajah Pixels", desc: "Launch the full GPU visualizer for this track — reactive shaders, 3D scenes, and clip layers all driven by the music." },
  "add":       { icon: "➕", label: "Add to Playlist", desc: "Save this track to one of your playlists. You can also create a new playlist right here." },
  "exit":      { icon: "✖️", label: "Exit", desc: "Close this view and return to where you were." },
  "2d":        { icon: "🔈", label: "Standard Stereo", desc: "Normal stereo playback — no spatial processing. Best if you're using speakers." },
  "3d":        { icon: "🌀", label: "3D Orbit Audio", desc: "Binaural HRTF mode — the audio slowly orbits around your head. Works best with headphones." },
  "3d+":       { icon: "🎵", label: "3D+ Reactive Audio", desc: "Music-reactive 3D audio — bass, beats, and treble all move the sound in different directions around you. Best with headphones." },
  "dolby":     { icon: "🔊", label: "Dolby", desc: "Indicates Dolby audio technology support. Active (blue) when an Atmos-tagged track is playing and your device supports it." },
  "atmos":     { icon: "🔊", label: "Dolby Atmos", desc: "Dolby Atmos passthrough is active on this track. You're hearing the spatial audio exactly as the artist mastered it." },

  // Clip Launcher generators/tabs
  "generators": { icon: "⚙️", label: "Generators", desc: "Built-in visual generator programs — real-time GPU effects that run as base layers in Plajah Pixels. No file needed." },
  "milkdrop":   { icon: "🌊", label: "MilkDrop Presets", desc: "Classic Winamp MilkDrop visualizer presets — hundreds of pre-built audio-reactive visuals from the community." },
  "shaders":    { icon: "🌈", label: "GLSL Shaders", desc: "Custom OpenGL shader programs. Load a Shadertoy-compatible GLSL file or write your own to create unique GPU visuals." },
  "media":      { icon: "🖼️", label: "Media Sources", desc: "Load images or videos as visual layers. They'll be composited into your Plajah Pixels scene." },

  // Common actions
  "more":        { icon: "⋯", label: "Show More", desc: "Expand to see more options or navigation items that are hidden to save space." },
  "view profile":{ icon: "👤", label: "View Profile", desc: "Visit this artist's or user's full public profile page." },
  "share":       { icon: "🔗", label: "Share", desc: "Share this content on social media, copy a link, or send it to someone via Plajah chat." },
  "follow":      { icon: "➕", label: "Follow", desc: "Follow this creator to see their new posts, music, and updates in your social feed." },
  "join":        { icon: "🏛️", label: "Join Club", desc: "Become a member of this club and start seeing their posts and events in your feed." },
  "subscribe":   { icon: "⭐", label: "Subscribe", desc: "Subscribe to this creator to get notifications whenever they release new content." },
  "edit":        { icon: "✏️", label: "Edit", desc: "Open the editor for this item so you can change its name, artwork, tracks, or settings." },
  "delete":      { icon: "🗑️", label: "Delete", desc: "Permanently remove this item. This action usually cannot be undone — double-check before confirming." },
  "save":        { icon: "💾", label: "Save", desc: "Save your current changes." },
  "upload":      { icon: "⬆️", label: "Upload", desc: "Upload a file from your device — audio, image, or video depending on the context." },
  "go live":     { icon: "🔴", label: "Go Live", desc: "Start a live broadcast to your audience right now. Choose audio, video, or screen share." },
  "live chat":   { icon: "💬", label: "Live Chat", desc: "Real-time chat panel for the current live stream. Interact with the creator and other viewers." },
};

// ─── Phase 3: Screen zone detection ──────────────────────────────────────────
// Fallback when no attribute or text match is found. Uses cursor position to
// identify which part of the UI the mouse is likely over.

function getZoneTip(x: number, y: number, view: string): Tip {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  // Left sidebar zone (approximately 320px wide when expanded)
  const inSidebar = x < 340;

  if (inSidebar) {
    // Top of sidebar — logo + search
    if (y < 130) {
      return { icon: "🏠", label: "Plajah Logo & Collapse Toggle", desc: "Click the Plajah logo in the top-left to collapse the sidebar into icon-only mode. Click it again to expand. All navigation still works in collapsed mode." };
    }
    // Search bar area
    if (y < 210) {
      return { icon: "🔍", label: "Universal Search", desc: "Search everything on Plajah from one place — music, artists, videos, articles, books, and people. Results update as you type." };
    }
    // Nav items area (middle of sidebar)
    if (y < vpH - 380) {
      return { icon: "🗺️", label: "Navigation Sections", desc: "These are your section buttons. Click any one to navigate to that part of Plajah. The glowing orange button shows where you currently are." };
    }
    // Bottom controls (notifications, settings, etc.)
    if (y < vpH - 280) {
      return { icon: "🔔", label: "Sidebar Controls", desc: "From left to right: Notification bell, Sign out, Smart Guide toggle (compass), Creator Settings, and Projects tray. These are always visible regardless of which page you're on." };
    }
    // Nano player zone
    if (y < vpH - 140) {
      return { icon: "🎛️", label: "Nano Controller", desc: "Your always-on mini music player. Flip it with the icon in the top-left corner to access the seek bar, skip controls, and theme switcher. It stays here on every page." };
    }
    // Profile card zone
    return { icon: "🪪", label: "Your Account Card", desc: "This shows your active account. Click your avatar to switch between linked accounts. The Creator Tools button opens your content workspace." };
  }

  // Main content area — view-specific zone tips
  const mainX = x - 340; // x position within main content
  const relY = y / vpH;  // relative y position

  // Top of main content = page header / filters
  if (y < 100) {
    return { icon: "📍", label: "Page Header", desc: "This area shows where you are and may have page-level filters, search, or actions specific to the current section." };
  }

  // View-specific zones
  switch (view) {
    case "MUSIC":
    case "DASHBOARD":
      if (relY < 0.3) return { icon: "⭐", label: "Featured Content", desc: "Curated and trending albums featured by the Plajah team. Click any card to start playing immediately." };
      if (relY < 0.65) return { icon: "🎵", label: "Album Grid", desc: "Every card here is an album. Click one to open it and start playing. The nano controller in the sidebar will update automatically." };
      return { icon: "🔽", label: "Load More", desc: "Scroll down or click 'Load more' to see additional albums and content." };

    case "PLAYER":
      if (x > vpW - 260) return { icon: "🗂️", label: "Right Panel", desc: "This side panel switches between the track list, lyrics, media, comments, and album info. Use the icons on the far right to switch views." };
      if (relY < 0.4) return { icon: "🖼️", label: "Album Art Area", desc: "The current album's artwork. Click 'FX Stage' below it to enter the real-time GPU visualizer, or 'Slideshow' to cycle through artwork images." };
      if (relY < 0.75) return { icon: "🎵", label: "Track List", desc: "All the tracks in this album. Click any track to jump to it. The currently playing track is highlighted in orange." };
      return { icon: "🎮", label: "Playback Controls", desc: "Play, pause, skip, and volume controls. Also has the repeat mode toggle and progress bar for seeking." };

    case "FEED":
      if (relY < 0.2) return { icon: "✍️", label: "Compose Area", desc: "Write a post to share with your followers — add text, photos, or a music track. Others can react, comment, and share what you post." };
      return { icon: "📰", label: "Social Feed", desc: "Posts from creators and fans you follow. React with emoji, comment, or share any post. Music drops can be played inline." };

    case "LIVE_HUB":
      if (relY < 0.3) return { icon: "🔴", label: "Live Now", desc: "These streams are broadcasting right now. The viewer count shows current audience size. Click any card to watch." };
      return { icon: "📅", label: "Scheduled Streams", desc: "Upcoming live events from creators you follow. Set a reminder so you don't miss them." };

    case "CREATOR":
    case "PLAJAH_STUDIO":
      if (relY < 0.25) return { icon: "📊", label: "Overview / Stats", desc: "Your content at a glance — total streams, recent uploads, earnings summary, and audience growth." };
      if (x - 340 < 260) return { icon: "📁", label: "Content Library", desc: "All your albums, tracks, and uploads. Click any item to open its editor and make changes." };
      return { icon: "⚙️", label: "Settings Panel", desc: "Configure your selected content item — metadata, visibility, pricing, and advanced options." };

    case "CHAT":
      if (mainX < 260) return { icon: "💬", label: "Conversation List", desc: "All your chats in one scrollable list. Click any to open the thread. Unread messages show a badge." };
      return { icon: "📨", label: "Message Thread", desc: "The active conversation. Type in the box at the bottom to send a message. You can also drop music tracks and voice notes." };

    case "CLUBS":
      if (relY < 0.3) return { icon: "🏛️", label: "Club Header", desc: "The club's cover art, name, and member count. The Join button is here if you're not a member yet." };
      return { icon: "📢", label: "Club Feed", desc: "Posts, announcements, and media from club members and admins. Only members can post." };

    case "BOOKS":
      if (relY < 0.35) return { icon: "📚", label: "Book Browser", desc: "Browse the Lorea library. Click any book cover to open the built-in reader. The reader supports dark mode, font sizing, and bookmarks." };
      return { icon: "📖", label: "Reading Area", desc: "Use arrow keys or the on-screen buttons to turn pages. The settings icon inside the reader changes font size and theme." };

    default:
      if (relY < 0.25) return { icon: "🔍", label: "Section Filters", desc: "Filters and sort options for the current section. Use them to narrow down what's shown." };
      if (relY > 0.8) return { icon: "⬇️", label: "Load More / Footer", desc: "Scroll down for more content, or use the footer links to access platform settings and legal pages." };
      return { icon: "👆", label: "Main Content Area", desc: "This is the main view for the current section. Click any card, button, or item to interact with it." };
  }
}

// ─── Tip resolution (three phases) ───────────────────────────────────────────

function resolveTip(x: number, y: number, view: string, fallbackTips: Tip[], tipIndexRef: React.MutableRefObject<number>): Tip {
  const el = document.elementFromPoint(x, y);

  // Phase 1 — walk DOM for explicit attribute annotations
  if (el) {
    let cur: Element | null = el;
    for (let depth = 0; depth < 10 && cur; depth++) {
      const key =
        cur.getAttribute("data-guide") ||
        cur.getAttribute("title") ||
        cur.getAttribute("aria-label") || "";
      if (key && ATTR_TIPS[key]) return ATTR_TIPS[key];
      cur = cur.parentElement;
    }

    // Phase 2 — read visible text of the nearest interactive element
    cur = el;
    for (let depth = 0; depth < 8 && cur; depth++) {
      const tag = cur.tagName?.toLowerCase();
      if (tag === "button" || tag === "a" || tag === "li") {
        // Collect immediate text nodes only (not deeply nested) to avoid
        // matching full paragraphs
        let text = "";
        for (const node of Array.from(cur.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
          // Also grab text from direct child spans/elements (icon buttons have text in a span)
          else if ((node as Element).tagName && !["SVG","svg"].includes((node as Element).tagName)) {
            text += (node as Element).textContent ?? "";
          }
        }
        const clean = text.trim().toLowerCase().replace(/\s+/g, " ");
        if (clean.length > 0 && clean.length < 50) {
          if (TEXT_TIPS[clean]) return TEXT_TIPS[clean];
          // Partial match — scan all text tip keys
          for (const [k, tip] of Object.entries(TEXT_TIPS)) {
            if (clean === k || (k.length > 3 && clean.includes(k)) || (clean.length > 3 && k.includes(clean))) {
              return tip;
            }
          }
        }
      }
      cur = cur.parentElement;
    }
  }

  // Phase 3 — screen zone detection
  return getZoneTip(x, y, view);
}

// ─── Page entry registry ──────────────────────────────────────────────────────
// Used for the first-time overlay and as the fallback tip pool.

const PAGE_FEATURES: Record<string, PageEntry> = {
  DASHBOARD: {
    title: "Global Archive",
    intro: "This is Plajah's central discovery hub — every public album, video, book, and game on the platform lives here. Use the sidebar search to find anything instantly.",
    tips: [
      { icon: "🎵", label: "Click Any Card to Play", desc: "Click an album card and it starts playing immediately. The nano controller in the sidebar updates automatically." },
      { icon: "🔍", label: "Search Everything", desc: "The sidebar search finds music, people, videos, and articles across the whole platform at once." },
      { icon: "📂", label: "Filter by Category", desc: "Use the category tabs to narrow what's shown — Music, Video, Books, Games, and more." },
      { icon: "🌍", label: "Public Content", desc: "Everything here is publicly published. Your private drafts live in Creator Tools." },
    ],
  },
  MUSIC: {
    title: "Chora — Music",
    intro: "Stream and discover music. Click any album to play it. The nano controller in the sidebar lets you control playback from any page on the platform.",
    tips: [
      { icon: "🎵", label: "Click to Play", desc: "Tap any album card to start playing. The nano player in the sidebar shows what's currently on." },
      { icon: "🎛️", label: "Nano Controller", desc: "The mini player in the sidebar stays with you everywhere. Flip it (layers icon, top-left) to see the seek bar and skip controls." },
      { icon: "✨", label: "Plajah Pixels", desc: "Click 'PP' on any track row to launch the real-time GPU visualizer for that song." },
      { icon: "🎼", label: "The Breakdown", desc: "Click 'Breakdown' on any track for AI analysis — key, BPM, chords, and sheet music." },
    ],
  },
  PLAYER: {
    title: "Music Player",
    intro: "The full player experience — album art, track list, lyrics, the FX Stage GPU visualizer, and spatial audio. Use the icons on the far right to switch what's in the side panel.",
    tips: [
      { icon: "✨", label: "FX Stage", desc: "Click 'FX Stage' below the album art to enter Plajah Pixels — real-time GPU visuals that react to the music." },
      { icon: "🎧", label: "Spatial Audio", desc: "The '3D' and '3D+' buttons in the fullscreen bar enable binaural spatial audio. Best with headphones." },
      { icon: "🎼", label: "Track Breakdown", desc: "Each track row has a 'Breakdown' button — tap it for AI key, tempo, chords, and sheet music." },
      { icon: "📋", label: "Track List", desc: "Click any track in the right panel to jump to it instantly." },
      { icon: "🎨", label: "Slideshow Mode", desc: "Below the album art, tap 'Slideshow' to cycle through the album's artwork images while the music plays." },
    ],
  },
  FEED: {
    title: "Plajah Social",
    intro: "Your timeline — posts, music drops, reactions, and updates from creators and fans you follow. Post your own content using the compose box.",
    tips: [
      { icon: "✍️", label: "Compose a Post", desc: "The compose box at the top lets you share text, photos, tracks, or links with your followers." },
      { icon: "👁️", label: "Following vs All", desc: "Switch between 'Following' (people you follow) and 'All' (everything public on the platform)." },
      { icon: "🎵", label: "Inline Music Drops", desc: "When a creator drops a track in the feed, you can play it right there without leaving the timeline." },
      { icon: "❤️", label: "Emoji Reactions", desc: "React to any post with an emoji — not just a like, you can respond with any feeling." },
    ],
  },
  CREATOR: {
    title: "Creator Dashboard",
    intro: "Your personal control panel — upload music, manage albums, view analytics, and configure how your content appears to the world.",
    tips: [
      { icon: "⬆️", label: "Upload Music", desc: "Click 'New Album' to start. Drag in your audio files and the platform handles encoding and storage." },
      { icon: "📊", label: "Analytics", desc: "See who's listening, where they're from, and how your streams are growing over time." },
      { icon: "🔒", label: "Visibility Settings", desc: "Each album can be Public, Private, or Exclusive — control exactly who can access your music." },
      { icon: "💰", label: "Monetization", desc: "Set pay-what-you-want pricing, link Stripe, and track your earnings all from the Creator Dashboard." },
    ],
  },
  PLAJAH_STUDIO: {
    title: "Creator Tool Bag",
    intro: "Your full creation workspace — upload tracks, edit albums, build worlds, manage your store, and access every creator tool in one place.",
    tips: [
      { icon: "⬆️", label: "Upload Tracks", desc: "Drop audio files anywhere in the uploader — MP3, WAV, FLAC all work." },
      { icon: "🌍", label: "World Builder", desc: "Link your music to a creative universe — connect characters, lore, and alternate content." },
      { icon: "🎙️", label: "Go Live", desc: "Start a live broadcast from Creator Tools and connect with your fans in real-time." },
      { icon: "📦", label: "Merch & Store", desc: "List physical or digital products tied to your music releases." },
    ],
  },
  LIVE_HUB: {
    title: "Live Hub",
    intro: "Browse active streams from creators you follow, or go live yourself to your audience in real-time.",
    tips: [
      { icon: "🔴", label: "Live Now", desc: "Cards with a red dot are actively broadcasting. Click any to watch." },
      { icon: "🎙️", label: "Go Live", desc: "Start your own broadcast with audio, video, or screen share." },
      { icon: "👥", label: "Viewer Counts", desc: "The number on each live card shows how many people are watching right now." },
      { icon: "💬", label: "Live Chat", desc: "Every stream has a real-time chat panel. Interact with the creator and other viewers." },
    ],
  },
  CHAT: {
    title: "Chats",
    intro: "Private and group messaging. Send text, voice notes, and music tracks. Your conversations are end-to-end synced across all your devices.",
    tips: [
      { icon: "💬", label: "Start a Chat", desc: "Click 'New Chat' to start a DM with any user, or create a group conversation." },
      { icon: "🎵", label: "Drop Music", desc: "In any thread, share a track — the other person can play it inline." },
      { icon: "🎙️", label: "Voice Notes", desc: "Hold the mic button to record a voice message instead of typing." },
    ],
  },
  CLUBS: {
    title: "Clubs",
    intro: "Community groups around shared interests — genres, artists, sports, topics. Join any public club and participate in their feed.",
    tips: [
      { icon: "🏛️", label: "Join a Club", desc: "Click 'Join' on any club card to become a member and see their posts in your feed." },
      { icon: "📢", label: "Club Feed", desc: "Posts, announcements, and media from members and admins. Only members can post." },
      { icon: "➕", label: "Create a Club", desc: "Start your own club around any topic — set a name, image, and membership rules." },
    ],
  },
  _DEFAULT: {
    title: "Plajah",
    intro: "You're on Plajah — an all-in-one platform for music, video, books, live streams, and creative community. The sidebar on the left is your main navigation.",
    tips: [
      { icon: "🧭", label: "Smart Guide Active", desc: "Hover over any button or section and stay still for 2 seconds — a tip card appears explaining what it does." },
      { icon: "🎛️", label: "Nano Controller", desc: "The mini player at the bottom of the sidebar stays with you everywhere. Flip it to see full playback controls." },
      { icon: "⚙️", label: "Creator Dashboard", desc: "The Settings gear icon opens your personal dashboard — uploads, analytics, and account settings." },
      { icon: "👤", label: "Account Switcher", desc: "Click your avatar at the bottom-left to switch between up to 4 linked accounts." },
    ],
  },
};

function getPageEntry(view: string): PageEntry {
  return PAGE_FEATURES[view] ?? PAGE_FEATURES["_DEFAULT"];
}

// ─── Corner decoration ────────────────────────────────────────────────────────
function CornerArrows() {
  const c = "#FF8C00";
  return (
    <>
      {([
        { style: { top: 20, left: 20 } as React.CSSProperties, r: 0 },
        { style: { top: 20, right: 20 } as React.CSSProperties, r: 90 },
        { style: { bottom: 20, right: 20 } as React.CSSProperties, r: 180 },
        { style: { bottom: 20, left: 20 } as React.CSSProperties, r: 270 },
      ]).map((corner, i) => (
        <div key={i} className="absolute pointer-events-none" style={{ ...corner.style, transform: `rotate(${corner.r}deg)`, opacity: 0.45 }}>
          <svg width={56} height={56} viewBox="0 0 56 56" fill="none">
            <path d="M5 5 L5 28 M5 5 L28 5" stroke={c} strokeWidth="3" strokeLinecap="round" />
            <path d="M5 5 L18 18" stroke={c} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" />
            <path d="M18 18 L13 18 M18 18 L18 13" stroke={c} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" />
          </svg>
        </div>
      ))}
    </>
  );
}

// ─── Guide overlay (first-time or on-demand) ──────────────────────────────────
function GuideOverlay({ entry, onClose, onDismissFirst, isFirstTime }: {
  entry: PageEntry; onClose: () => void; onDismissFirst: () => void; isFirstTime: boolean;
}) {
  return (
    <motion.div
      key="guide-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4 py-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ backdropFilter: "blur(10px)", background: "rgba(0,0,0,0.68)" }}
      onClick={onClose}
    >
      <CornerArrows />
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg my-auto rounded-[2rem] border border-white/10 p-6 sm:p-8 flex flex-col gap-5 max-h-[calc(100dvh-3rem)] overflow-y-auto custom-scrollbar"
        style={{ background: "rgba(8,6,14,0.88)", backdropFilter: "blur(40px)", boxShadow: "0 32px 80px rgba(0,0,0,0.75)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button onClick={onClose} className="absolute right-5 top-5 w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white transition-colors">
          <X size={14} />
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.3)" }}>
            <Compass size={22} color="#FF8C00" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">Smart Guide</p>
            <h2 className="text-lg font-black uppercase tracking-widest text-white leading-tight">{entry.title}</h2>
          </div>
        </div>
        <p className="text-sm font-bold leading-relaxed text-white/60">{entry.intro}</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {entry.tips.map((tip, i) => (
            <motion.div
              key={tip.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.05, duration: 0.3 }}
              className="flex items-start gap-3 rounded-2xl border border-white/[0.08] p-3.5"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <span className="text-base leading-none mt-0.5 shrink-0">{tip.icon}</span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white">{tip.label}</p>
                <p className="text-[11px] font-bold text-white/50 mt-0.5 leading-snug">{tip.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,140,0,0.08)", border: "1px solid rgba(255,140,0,0.2)" }}>
          <Info size={11} color="#FF8C00" className="mt-0.5 shrink-0" />
          <p className="text-[10px] font-bold text-white/50 leading-snug">
            <span className="text-[#FF8C00] font-black">Tip: </span>
            Hover over any button, icon, or panel and stay still for 2 seconds — a hint card appears explaining exactly what it does.
          </p>
        </div>
        <div className="flex gap-3">
          {isFirstTime && (
            <button
              onClick={() => { onDismissFirst(); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-black"
              style={{ background: "#FF8C00" }}
            >
              <Sparkles size={13} /> Got it — explore
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-colors"
          >
            Close <ChevronRight size={13} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Idle tooltip ─────────────────────────────────────────────────────────────
const TIP_W = 276;

function IdleTooltip({ tip, pageName, pos, onDismiss }: {
  tip: Tip; pageName: string; pos: { x: number; y: number }; onDismiss: () => void;
}) {
  const vpW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = pos.x + 18;
  let top  = pos.y + 18;
  if (left + TIP_W > vpW - 12) left = pos.x - TIP_W - 18;
  if (top + 130 > vpH - 12)  top  = pos.y - 130 - 18;
  left = Math.max(12, left);
  top  = Math.max(12, top);

  return (
    <motion.div
      key={`tip-${tip.label}`}
      initial={{ opacity: 0, scale: 0.9, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        position: "fixed", left, top, width: TIP_W, zIndex: 9998, pointerEvents: "auto",
        background: "rgba(6,5,10,0.86)", backdropFilter: "blur(28px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.1rem", padding: "12px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="absolute right-2.5 top-2.5 w-5 h-5 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
      >
        <X size={10} />
      </button>
      <div className="flex items-center gap-2 mb-1.5 pr-6">
        <span className="text-sm leading-none">{tip.icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/90 leading-tight">{tip.label}</span>
      </div>
      <p className="text-[11px] font-bold text-white/55 leading-snug">{tip.desc}</p>
      <div className="flex items-center gap-1.5 mt-2">
        <Lightbulb size={9} color="#FF8C00" />
        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/20">{pageName}</span>
      </div>
    </motion.div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SmartGuide({ view, enabled, onToggle, isFirstTime, onDismissFirst }: SmartGuideProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [activeTip, setActiveTip] = useState<Tip | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const tipIndexRef = useRef(0);
  const entry = getPageEntry(view);

  useEffect(() => {
    if (isFirstTime) setShowOverlay(true);
  }, [isFirstTime]);

  useEffect(() => {
    dismissedRef.current = false;
    tipIndexRef.current = 0;
    setActiveTip(null);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, [view]);

  useEffect(() => {
    if (!enabled) {
      setActiveTip(null);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    }
  }, [enabled]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!enabled) return;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    setMousePos({ x: e.clientX, y: e.clientY });

    if (activeTip) {
      setActiveTip(null);
      dismissedRef.current = false;
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (dismissedRef.current || showOverlay) return;
      const tip = resolveTip(lastPosRef.current.x, lastPosRef.current.y, view, entry.tips, tipIndexRef);
      tipIndexRef.current += 1;
      setActiveTip(tip);
    }, 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeTip, showOverlay, view, entry.tips]);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [handleMouseMove]);

  return (
    <AnimatePresence>
      {showOverlay && (
        <GuideOverlay
          key="overlay"
          entry={entry}
          onClose={() => setShowOverlay(false)}
          onDismissFirst={onDismissFirst}
          isFirstTime={isFirstTime}
        />
      )}
      {enabled && activeTip && !showOverlay && (
        <IdleTooltip
          key={`tooltip-${activeTip.label}`}
          tip={activeTip}
          pageName={entry.title}
          pos={mousePos}
          onDismiss={() => { setActiveTip(null); dismissedRef.current = true; }}
        />
      )}
    </AnimatePresence>
  );
}
