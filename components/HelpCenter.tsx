import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HelpCircle, Book, Play, ChevronRight, Search,
  Music2, Video, Newspaper, BookOpen, Radio,
  Gamepad2, GraduationCap, Ticket, Camera,
  MessageSquare, Settings, Database, Megaphone,
  ArrowLeft, Info, Sparkles, ShieldCheck, Tv, Trash2,
  Film, Users, Globe, Award, ShoppingBag
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: any;
  description: string;
  features: {
    name: string;
    description: string;
    tutorial?: string;
  }[];
}

const helpSections: HelpSection[] = [
  {
    id: ‘discovery’,
    title: ‘Global Archive’,
    icon: Database,
    description: ‘The central hub for all platform content. Browse music, videos, movies, TV, books, games, and more — no account required.’,
    features: [
      {
        name: ‘Browsing Without an Account’,
        description: ‘You do not need to create an account to explore Plajah. On the landing page, click "Enter as Guest" to immediately access all public content across every section — music, videos, movies, TV, articles, games, and more. Sign in only when you want to upload, interact, or personalize your experience.’
      },
      {
        name: ‘Navigating Between Sections’,
        description: ‘Use the sidebar navigation to jump between Chora (music), Reello (videos), Taleo (movies & TV), Newsstand (articles), Radio, Games, Clubs, Sports, Classrooms, and more. Each section has its own genre filters and discovery layout. On mobile, tap the menu icon to open the navigation sidebar.’
      },
      {
        name: ‘Search’,
        description: ‘Click the search icon at the top of any page and type any artist name, album title, video title, or keyword. Results appear instantly across all content types. Use the filter chips (Music, Video, Article, Profile) below the search bar to narrow results to a specific content type.’
      },
      {
        name: ‘Genre Filtering’,
        description: ‘Each content section — Music, Video, Movies, TV — has horizontal genre chips at the top of the page. Click any genre (Hip-Hop, Rock, Drama, Comedy, Trailers, etc.) to filter the entire view instantly. Click "All" to reset the filter and show everything again.’
      },
      {
        name: ‘Discovering New Artists’,
        description: ‘The Global Archive surfaces content from all creators in chronological order, most recent first. Follow an artist from their profile page to see their new releases prioritized. The "New Arrivals" rows on each section page spotlight the freshest drops.’
      }
    ]
  },
  {
    id: ‘music’,
    title: ‘Music (Chora)’,
    icon: Music2,
    description: ‘Stream albums, singles, playlists, podcasts, and radio — the full Chora music ecosystem.’,
    features: [
      {
        name: ‘Playing Music’,
        description: ‘Click any album cover or track title to start playback instantly. The mini-player appears at the bottom of the screen with controls for play/pause, previous, next, volume, and shuffle. Press the spacebar anywhere on the platform as a quick play/pause shortcut. Tap the mini-player to expand it to full view.’
      },
      {
        name: ‘Artist Radio’,
        description: ‘On any artist\’s profile page, click the "Artist Radio" button to launch an algorithmically curated radio stream built from that artist\’s catalog and similar music. The station plays continuously and auto-selects tracks based on genre, mood, and listening patterns. No setup required — just click and let it run.’
      },
      {
        name: ‘Creating & Managing Playlists’,
        description: ‘While browsing music, open any track\’s action menu (the three dots) and select "Add to Playlist." Create a new playlist or add to an existing one. Access all your playlists from your profile under the Library tab. Playlists can be set to public so fans can follow them, or kept private.’
      },
      {
        name: ‘Radio Stations’,
        description: ‘Go to the Radio section from the main navigation. Browse curated stations by genre — each station plays a continuous mix of music from Plajah creators. Some stations include creator-recorded station IDs and custom ad spots. Click a station to start streaming; it continues playing as you navigate the site.’
      },
      {
        name: ‘Podcasts’,
        description: ‘Podcasts live inside the Music section under the Podcasts tab. Search a show name or browse by topic. Episodes play in the same mini-player as music. Creators can configure per-episode ad markers, sponsor read slots, and episode descriptions with chapter timestamps.’
      },
      {
        name: ‘Hide N Seek Discovery’,
        description: ‘Hide N Seek is a discovery game where creators hide tracks across the platform. Watch for the "?" icon on certain pages and content. Finding a hidden track plays it and may award you PlajahBucks as a reward. It\’s how creators reward their most engaged, curious fans.’
      }
    ]
  },
  {
    id: ‘video’,
    title: ‘Video (Reello)’,
    icon: Video,
    description: ‘Watch, upload, go live, and run your video channel. Reello is the full-featured video layer of Plajah.’,
    features: [
      {
        name: ‘Watching Videos’,
        description: ‘Click any video thumbnail to open the player. The player supports full-screen, volume control, and playback speed adjustment. Videos auto-advance to the next item in a playlist or feed. Double-click the video area to toggle full-screen instantly.’
      },
      {
        name: ‘Uploading a Video’,
        description: ‘Click the Upload button at the top right of the Reello page — it is always visible. If you are not signed in, clicking it will prompt you to sign in first. Once in, select your video file (MP4, MOV, etc.), add a title, description, thumbnail, and genre tags. Toggle Public or Private before saving.’
      },
      {
        name: ‘Going Live’,
        description: ‘Click the "Go Live" button at the top of the Reello page to start a live stream. You\’ll be prompted to connect a streaming source — RTMP, YouTube Live, Twitch, or a custom stream URL. Your live feed appears on your profile and in the platform\’s Live Hub for all viewers to discover.’
      },
      {
        name: ‘Video Playlists’,
        description: ‘In your Video Manager, click the Playlists tab to create and organize video collections. Add any video to a playlist from its action menu. Share the playlist link with fans — it auto-plays videos in order. Playlists can be public or private.’
      },
      {
        name: ‘Importing from YouTube’,
        description: ‘In Creator Studio under Video Manager, click "YouTube Import" and paste a YouTube video URL. The platform embeds the video natively in your Reello profile. YouTube-imported videos appear in your library, are playable on-platform, and can be added to your FAST channel.’
      },
      {
        name: ‘Stories (24-Hour Content)’,
        description: ‘Post a Story from your creator dashboard — a short video or image visible on your profile for 24 hours before it disappears. Stories appear in the horizontal Stories bar at the top of the main feed. Fans tap your story circle to watch it. Use stories for announcements, behind-the-scenes moments, and quick updates.’
      }
    ]
  },
  {
    id: ‘taleo’,
    title: ‘Movies & TV (Taleo)’,
    icon: Film,
    description: ‘Browse a curated library of movies, TV series, trailers, and classic public domain films.’,
    features: [
      {
        name: ‘Browsing Movies’,
        description: ‘Navigate to Taleo from the main sidebar. Movies are displayed in a cinematic poster grid. Use the genre chips (Action, Drama, Comedy, Horror, Sci-Fi, Documentary, etc.) to filter the view. Click any poster to open the full detail page with cast, synopsis, year, and the video player.’
      },
      {
        name: ‘Watching TV Series’,
        description: ‘TV shows are organized by season and episode. Open a show\’s detail page and select a season from the season dropdown. Episodes list with numbers, titles, and runtimes. Click an episode to play it. The player remembers your position so you can resume right where you stopped.’
      },
      {
        name: ‘Trailers Filter’,
        description: ‘Select "Trailers" from the genre chips in Movies or TV to filter the entire view to trailers only. Creators tag their trailers using the "trailer" content subtype — they automatically surface in this filtered view for quick browsing before committing to a full film.’
      },
      {
        name: ‘Public Domain Content’,
        description: ‘Taleo includes classic public domain films sourced from the Internet Archive. These films appear in the library automatically and can be added to any user\’s FAST channel for free. Look for the public domain badge on posters — these are always free to watch with no restrictions or paywalls.’
      },
      {
        name: ‘Creating a Movie or TV Series Project’,
        description: ‘In Creator Studio, go to Video Manager and click "Add to Project." Create a new Movie or TV Series project. For TV series, add episodes and assign them to seasons. Publish the project and it appears in Taleo with full metadata — cover art, cast, genre, synopsis, release year, and a proper episode browser.’
      }
    ]
  },
  {
    id: ‘creator’,
    title: ‘Creator Studio’,
    icon: Settings,
    description: ‘Your command center for uploading, organizing, and distributing all your creative work across every format.’,
    features: [
      {
        name: ‘Uploading Music & Albums’,
        description: ‘In Creator Studio, click "Deploy Art" or open Music Manager. Click "New Album" — upload your cover art, set the title, artist name, genre, and release year. Then upload individual tracks (MP3 or WAV). You can price the album, individual tracks, or make everything free. Hit Publish when your project is ready.’
      },
      {
        name: ‘Publishing Articles’,
        description: ‘Click "Write Article" in Creator Studio to open the block-based article editor. Add text blocks, headers, images, embedded audio clips, video embeds, and pull quotes. Articles publish to the Newsstand and appear on your profile. You can also lock articles for Sanctuary members only.’
      },
      {
        name: ‘Video Manager’,
        description: ‘Video Manager shows all your uploaded videos in one organized grid. From here you can edit video details, toggle videos into your FAST channel, migrate videos to Mux streaming for better performance, add videos to movie or TV series projects, manage playlists, or delete content.’
      },
      {
        name: ‘Privacy & Access Control’,
        description: ‘Every piece of content — music, video, article, book — has a privacy control. Set it to Public (visible to everyone), Private (only you), or Exclusive (Sanctuary members only). For paid content, set a price and visitors see a preview until they purchase. You can change these settings any time.’
      },
      {
        name: ‘Merch Store Setup’,
        description: ‘Open the Merchant section in Creator Studio and click "Add Product." Upload up to 4 product photos, set a title, price, and category (Apparel, Music, Accessories, Digital, Collectibles). Products appear immediately on your profile\’s Store tab. Plajah charges zero additional platform fees on sales.’
      },
      {
        name: ‘World Builder’,
        description: ‘Create a full interactive universe for your creative IP — fiction, brand, music project, or any concept. Add characters with bios and stats, write lore entries, build timelines, and connect all your content. The World Graph renders everything as an interactive 3D force graph fans can explore. Go to Creator Studio and click "Create World" to begin.’
      }
    ]
  },
  {
    id: ‘fast’,
    title: ‘FAST Channel’,
    icon: Tv,
    description: ‘Run your own 24/7 Free Ad-Supported Streaming TV channel. Automatic scheduling, bumpers, ads, and live interruptions — no technical setup needed.’,
    features: [
      {
        name: ‘Enabling Your FAST Channel’,
        description: ‘In Video Manager, find the FAST Channel toggle at the top of the page and switch it on. Once enabled, a "Watch Channel" button appears on your public profile so fans can tune in from anywhere without an account. The platform immediately begins looping your eligible content 24/7.’
      },
      {
        name: ‘Adding Videos to Your Channel’,
        description: ‘In Video Manager, each video card has an "Add to FAST Channel" button. Toggle it on for any video you want in the rotation. The platform automatically builds and loops a 24/7 schedule from your enabled videos. Add or remove videos at any time and the schedule updates instantly.’
      },
      {
        name: ‘Managing the Schedule’,
        description: ‘Click "Manage Channel" (visible when your FAST channel is on) to open the Channel Manager. In the Schedule tab, you can drag and drop content slots to reorder your lineup, add ad breaks between content blocks, and schedule live interruptions — slots where your FAST channel hands off to your live stream at a specified date and time.’
      },
      {
        name: ‘Channel Bumpers’,
        description: ‘In the Channel Manager\’s Bumpers tab, upload short video clips used as Intros, Outros, Station IDs, and Transitions. The platform automatically inserts these bumpers between content blocks according to your settings. Bumpers give your channel a polished, professional broadcast feel without any manual scheduling.’
      },
      {
        name: ‘Ad Settings & Commercial Breaks’,
        description: ‘In the Ads & Breaks tab, set your ad frequency — how often commercial breaks appear (every 5 to 60 minutes) — and ad duration per break (30 seconds to 3 minutes). You can also mark specific timestamps within individual videos as ad insertion points for mid-roll placements. If you set nothing, the platform configures this automatically.’
      },
      {
        name: ‘Dual Feed — FAST + Live Simultaneously’,
        description: ‘Your FAST channel and live stream can run at the same time. Viewers watching your channel see tab controls to switch between your FAST feed and your live stream. In Channel Manager, schedule a "live interruption" — at the set time your FAST channel automatically switches to your live stream, then returns to FAST after the configured maximum duration expires.’
      },
      {
        name: ‘Asset Sharing & Platform Library’,
        description: ‘In the Assets tab of Channel Manager, grant other creators access to your FAST channel content — per video or your entire library, free or for a monthly price. In the Library tab, add your videos to the platform-wide FAST content library so any creator can include them in their own channel schedule. Public domain films from Taleo can also be added to any FAST channel.’
      }
    ]
  },
  {
    id: ‘worlds’,
    title: ‘World Builder’,
    icon: Globe,
    description: ‘Build fully interactive universes for your creative IP — characters, lore, timelines, and 3D graph visualization.’,
    features: [
      {
        name: ‘Creating a World’,
        description: ‘In Creator Studio, click "Create World." Give your world a name and choose a type — Fiction, Non-Fiction, Music, Brand, or Custom. Set a custom color theme, background image, and font style. Your world gets its own dedicated page that fans can explore entirely separate from your main profile.’
      },
      {
        name: ‘Adding Characters’,
        description: ‘Inside your world, click "New Character." Fill in the character\’s name, biography, physical stats, personality traits, and assign a theme song. Characters can be linked to lore entries and timeline events. Fans can browse your full character roster and click through to each character\’s detail page.’
      },
      {
        name: ‘Writing Lore Entries’,
        description: ‘Lore entries are the foundational texts of your world — myths, histories, rules, faction descriptions, location guides. Each entry has a type tag (History, Myth, Faction, Location, etc.) and can link to characters, timeline events, and content you\’ve published. The system automatically detects conflicts between lore entries and flags them.’
      },
      {
        name: ‘Building Timelines’,
        description: ‘Create a timeline with custom time units — years, ages, eras, or anything you invent for your universe. Add events with names, descriptions, and year placements. Events can branch into alternate timelines. The timeline displays as a visual, scrollable track with events placed along it.’
      },
      {
        name: ‘World Graph Visualization’,
        description: ‘The World Graph tab renders all your world\’s entities — characters, lore entries, timeline events, and linked content — as a 3D interactive force graph. Nodes glow and gravitationally pull toward their connections. Click any node to navigate directly to that entity. It gives fans a stunning, explorable overview of how everything in your universe connects.’
      },
      {
        name: ‘Publishing & Sharing’,
        description: ‘Once your world is built, click "Publish" to make it publicly accessible. A link to your world appears on your profile under the Worlds tab. Fans can explore characters, read lore, scroll timelines, and navigate the full graph — all rendered in your world\’s custom visual theme and color palette.’
      }
    ]
  },
  {
    id: ‘profile’,
    title: ‘Profile & Social’,
    icon: Users,
    description: ‘Customize your presence, connect with fans and creators, and grow your community on Plajah.’,
    features: [
      {
        name: ‘Customizing Your Profile’,
        description: ‘Click your avatar in the top right and select "Edit Profile." Set your display name, bio, profile photo, cover art, and social links (X, Instagram, Bluesky, Threads, Mastodon, etc.). The Theme section lets you choose from built-in color themes or build a fully custom one with your own colors and background image.’
      },
      {
        name: ‘Profile Themes & Backgrounds’,
        description: ‘In your profile settings, open "Theme." Choose from Dark, Light, Pastel, Plajah, Big Screen, Phone, Ethereal, Nebula, and Citrus. You can set a custom background image or a looping video slideshow. Your theme applies to your public profile, making every artist\’s channel feel uniquely their own.’
      },
      {
        name: ‘Following & Mailing List’,
        description: ‘Click "Follow" on any artist\’s profile to add their content to your feed. Click "Subscribe" (where available) to join their mailing list for direct announcements. Creators can send broadcast messages to their entire mailing list from Creator Studio using the Postman tool.’
      },
      {
        name: ‘Clubs’,
        description: ‘Clubs are group spaces for fans with shared interests. Browse available clubs from the main navigation or create your own from Creator Studio. Each club has a discussion feed, media sharing, and membership controls. Clubs can be public or invite-only, and members can post, comment, and share content directly inside the club.’
      },
      {
        name: ‘Private Boards’,
        description: ‘Private Boards are personal, non-public spaces to save and organize content from across the platform — music, videos, articles, photos. Create boards with custom names and save content to them from any item\’s action menu. Only you can see your boards — great for curating reference collections and inspiration.’
      },
      {
        name: ‘Digital Avatar’,
        description: ‘Open the Avatar Studio from Creator Studio to build a digital avatar that represents you on the platform. Customize appearance, outfit, accessories, and animation style. Your avatar can appear on your profile, in the feed, and in future interactive experiences. Enable it in your profile settings once built.’
      }
    ]
  },
  {
    id: ‘sanctuary’,
    title: ‘Sanctuary’,
    icon: ShieldCheck,
    description: ‘Exclusive membership spaces where artists and their most dedicated fans connect deeply and share privately.’,
    features: [
      {
        name: ‘Joining a Sanctuary’,
        description: ‘Go to any artist\’s profile. If they have a Sanctuary enabled, you\’ll see a "Join Sanctuary" button near the top. Some Sanctuaries are free; others require a monthly subscription. Click Join, complete payment if prompted, and instantly gain access to all the exclusive content that creator has locked for members.’
      },
      {
        name: ‘What You Get as a Member’,
        description: ‘Sanctuary members access exclusive content the creator has marked "Members Only" — locked albums, private video streams, exclusive articles, and behind-the-scenes posts. Members also get access to the creator\’s private chat room for direct interaction and community with other top fans.’
      },
      {
        name: ‘Exclusive Content Locks’,
        description: ‘On any content page, look for the gold lock icon. This means the content is locked for Sanctuary members only. If you\’re not yet a member, clicking the lock icon takes you directly to the join flow for that artist\’s Sanctuary. After joining, all locked content unlocks immediately.’
      },
      {
        name: ‘Creating Your Own Sanctuary’,
        description: ‘In Creator Studio, find the Sanctuary section. Set your monthly price — or leave it free. Toggle "Sanctuary Active" to enable it on your profile. Once active, the Join button appears for all visitors. Now mark any content as exclusive using the lock toggle when uploading or editing content.’
      },
      {
        name: ‘Messaging Your Members’,
        description: ‘From Postman in Creator Studio, send a broadcast message to your entire mailing list or specifically to Sanctuary members. Use this for early-access announcements, exclusive download links, event invitations, and personal updates that reward your most loyal supporters.’
      }
    ]
  },
  {
    id: ‘store’,
    title: ‘Store & Monetization’,
    icon: ShoppingBag,
    description: ‘Sell merch, collect tips, run memberships, sell paid content, and build a sustainable creative income.’,
    features: [
      {
        name: ‘Merch Store’,
        description: ‘Open Creator Studio and go to the Merchant section. Click "Add Product" — upload up to 4 product photos, set a title, description, price, and category (Apparel, Music, Accessories, Digital, Collectibles). Products appear immediately on your profile\’s Store tab. Plajah charges zero additional platform fees on sales.’
      },
      {
        name: ‘Tips & Donation Goals’,
        description: ‘The Tip button appears on your public profile for all signed-in visitors. In your settings you can set a tip goal — e.g. "Help fund the next album — $500 goal" — and fans can contribute any amount. A visual progress bar on your profile shows how far along the goal is, creating urgency and community momentum.’
      },
      {
        name: ‘Pay-It-Forward’,
        description: ‘Pay-It-Forward is Plajah\’s charitable redistribution system. When you receive tips or payments, you can designate a percentage to automatically be passed forward to other creators or causes you choose. This appears as a badge on your profile and demonstrates community values to your fans.’
      },
      {
        name: ‘Paid Content’,
        description: ‘When uploading music, videos, or books, toggle the "Paid" option and set a price. Visitors who haven\’t purchased see a preview or paywall prompt. Once purchased, content unlocks permanently for that buyer and appears in their personal Library tab for unlimited future access.’
      },
      {
        name: ‘Artist Membership Tiers’,
        description: ‘Beyond the Sanctuary subscription, configure multi-tiered memberships with different benefits at each price point — different access levels, merch discounts, or bonus content. Set up tiers in Creator Studio. Each tier can unlock different categories of content, making your community scalable for different fan budgets.’
      }
    ]
  },
  {
    id: ‘games’,
    title: ‘Games, Sports & Classrooms’,
    icon: Gamepad2,
    description: ‘Play arcade games, follow sports teams, and take or build courses — all within Plajah.’,
    features: [
      {
        name: ‘Playing Arcade Games’,
        description: ‘Go to Games from the main navigation. Browse available games by category. Click any game to launch it directly in the browser — no downloads or installs required. Play counts are tracked and high scores are recorded on leaderboards. Some games are created and uploaded by platform creators themselves.’
      },
      {
        name: ‘Uploading a Game’,
        description: ‘In Creator Studio, open the Games section. Upload your web-based game as a ZIP file with an index.html entry point. Add a title, description, thumbnail, and category. Your game immediately becomes available to all platform users in the Arcade. HTML5, canvas, and WebGL games are all supported.’
      },
      {
        name: ‘Sports Center’,
        description: ‘The Sports Center features team pages, player rosters, league standings, and highlight video archives. Navigate to Sports from the main menu. Browse by sport or league. Team pages show roster details, stats, recent results, and embedded video highlights — all creator-maintained and updated.’
      },
      {
        name: ‘Enrolling in a Classroom’,
        description: ‘Go to Classrooms from the main navigation. Browse available courses and click Enroll on any course that interests you. Lessons can be video, audio, or text-based. Your progress is saved automatically. Find all your enrolled courses under the Classrooms tab in your profile.’
      },
      {
        name: ‘Creating a Course’,
        description: ‘In Creator Studio, click "New Classroom." Set a course title, description, and cover image. Add lessons as individual blocks — upload video lectures, audio content, or write text-based lessons. Configure assignments that students submit through the platform. Publish the course to make it available for enrollment.’
      },
      {
        name: ‘Live Classroom Sessions’,
        description: ‘As a classroom creator, schedule live sessions that appear in enrolled students\’ feeds and send notifications. During a live session, stream directly through Plajah\’s live system, present lesson materials, and interact with students in real time. Live sessions are recorded automatically and archived in the course after they end.’
      }
    ]
  },
  {
    id: ‘achievements’,
    title: ‘Achievements & Settings’,
    icon: Award,
    description: ‘Earn PlajahBucks, unlock achievements and badges, and configure your platform experience.’,
    features: [
      {
        name: ‘PlajahBucks & Points’,
        description: ‘PlajahBucks are the platform\’s activity points. Earn them by uploading original content, engaging with other creators, completing platform challenges, and finding hidden tracks via Hide N Seek. Check your points balance in your profile settings under the Achievements tab. Points unlock platform features and can be used for rewards.’
      },
      {
        name: ‘Unlocking Achievements’,
        description: ‘Achievements are milestones that unlock automatically as you use the platform — "First Upload," "100 Plays," "Joined a Sanctuary," and many more. When you unlock one, an animated celebration notification appears on screen. View all earned and locked achievements in your profile under the Achievements tab.’
      },
      {
        name: ‘Badges’,
        description: ‘Badges display publicly next to your name across the platform. The Pioneer Badge is awarded to early Plajah adopters. The Artist Badge is earned by uploading original content. Admins can also award Custom Badges for exceptional contributions. Collecting rare badges adds recognition and credibility to your profile.’
      },
      {
        name: ‘Theme Selector’,
        description: ‘Open Settings (gear icon) and select "Theme." Choose from: Dark, Light, Pastel, Plajah, Big Screen, Phone, Ethereal, Nebula, and Citrus. You can also build a fully custom theme by setting a primary color, background image, and glass effect level. Themes apply instantly and persist across sessions.’
      },
      {
        name: ‘Notification Center’,
        description: ‘Click the bell icon to open the Notification Center. You\’ll see activity on your content (new plays, followers, comments), Sanctuary member events, achievement unlocks, and platform announcements. Mark all as read or dismiss individual notifications. New notifications pulse the bell icon to alert you.’
      },
      {
        name: ‘Account & Privacy Settings’,
        description: ‘In Settings, configure your account details, email preferences, social link visibility, and content privacy defaults. To permanently delete your account and all associated data, scroll to the bottom of this Help page and click "Delete Account & Data." This action is irreversible and removes all uploaded content, profile data, and purchase history.’
      }
    ]
  }
];

interface HelpCenterProps {
  onBack: () => void;
  onDeleteAccount?: () => void;
}

const HelpCenter: React.FC<HelpCenterProps> = ({ onBack, onDeleteAccount }) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = helpSections.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 bg-theme relative text-white p-6 lg:p-12 overflow-y-auto custom-scrollbar pb-40">
      {/* Background FX */}
      <div className="absolute top-0 left-1/4 w-[50vw] h-[50vw] bg-small-orange/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen opacity-50" />
      <div className="absolute bottom-0 right-1/4 w-[40vw] h-[40vw] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen opacity-50" />

      <header className="mb-16 relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-3 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full transition-all hover:-translate-x-1">
            <ArrowLeft size={20} />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[#ff8c00] bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">Support Portal</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div className="max-w-3xl">
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Help & Tutorials</h1>
            <p className="text-white/60 font-bold text-lg max-w-2xl leading-relaxed">Everything you need to know about navigating and mastering the platform. Learn how to discover, create, and connect.</p>
          </div>
          <div className="relative w-full lg:w-[400px]">
            <div className="absolute inset-0 bg-gradient-to-r from-[#ff8c00]/20 to-transparent blur-xl opacity-50" />
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40" size={20} />
            <input 
              type="text"
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full relative bg-black/40 backdrop-blur-xl border border-white/20 rounded-full py-5 pl-14 pr-6 text-sm font-black uppercase tracking-widest text-white outline-none focus:ring-2 ring-[#ff8c00] focus:border-transparent transition-all shadow-2xl"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          {filteredSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left p-6 lg:p-8 rounded-[2rem] border transition-all duration-500 flex items-center justify-between group shadow-xl hover:-translate-y-1 ${
                activeSection === section.id 
                  ? 'bg-gradient-to-br from-white to-gray-200 text-black border-white shadow-[0_20px_40px_rgba(255,255,255,0.1)]' 
                  : 'bg-black/40 backdrop-blur-xl border-white/5 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${activeSection === section.id ? 'bg-black/5' : 'bg-[#ff8c00]/10 group-hover:bg-[#ff8c00]/20'}`}>
                  <section.icon size={28} className={activeSection === section.id ? 'text-black' : 'text-[#ff8c00]'} />
                </div>
                <div>
                  <h3 className={`font-black uppercase tracking-widest text-sm mb-1 ${activeSection === section.id ? 'text-black' : 'text-white'}`}>{section.title}</h3>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-60 ${activeSection === section.id ? 'text-black' : 'text-white/60'}`}>
                    {section.features.length} Modules
                  </p>
                </div>
              </div>
              <ChevronRight size={20} className={`transition-transform duration-500 ${activeSection === section.id ? 'text-black translate-x-1' : 'text-white/20 group-hover:text-white group-hover:translate-x-1'}`} />
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {activeSection ? (
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-black/60 shadow-2xl backdrop-blur-2xl border border-white/10 rounded-[3rem] p-8 lg:p-12 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#ff8c00]/20 to-transparent blur-3xl rounded-full pointer-events-none" />
                
                {helpSections.find(s => s.id === activeSection) && (
                  <>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6 mb-12 relative z-10">
                      <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-[#ff8c00] to-[#ff4500] flex items-center justify-center text-white shadow-[0_10px_30px_rgba(255,140,0,0.4)]">
                        {React.createElement(helpSections.find(s => s.id === activeSection)!.icon, { size: 36, strokeWidth: 2.5 })}
                      </div>
                      <div>
                        <h2 className="text-4xl font-display font-black uppercase tracking-tightest mb-2">
                          {helpSections.find(s => s.id === activeSection)!.title}
                        </h2>
                        <p className="text-white/60 font-bold text-sm max-w-lg leading-relaxed">
                          {helpSections.find(s => s.id === activeSection)!.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                      {helpSections.find(s => s.id === activeSection)!.features.map((feature, idx) => (
                        <div key={idx} className="p-8 bg-black/40 backdrop-blur-md rounded-[2.5rem] border border-white/5 group hover:bg-white/[0.02] hover:border-[#ff8c00]/30 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-500 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-[200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4 relative z-10">
                            <h4 className="text-xl font-display font-black uppercase tracking-widest text-[#ff8c00] group-hover:text-[#ffb732] transition-colors flex items-center gap-4">
                              <span className="w-8 h-8 rounded-full bg-[#ff8c00]/10 flex items-center justify-center text-xs">{idx + 1}</span>
                              {feature.name}
                            </h4>
                            <div className="shrink-0 px-4 py-2 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-white/40 border border-white/5 group-hover:border-white/20 transition-all">Quick Guide</div>
                          </div>
                          <p className="text-white/60 text-sm font-bold leading-relaxed mb-8 relative z-10 lg:pl-12 max-w-3xl">{feature.description}</p>
                          <div className="lg:pl-12 relative z-10">
                             <button className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white text-[10px] font-black uppercase tracking-[0.2em] text-white hover:text-black transition-all">
                               <Play size={14} fill="currentColor" /> Play Mini Video
                             </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-[3rem] border-dashed">
                <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mb-8 relative">
                  <div className="absolute inset-0 bg-[#ff8c00]/20 rounded-full animate-ping opacity-20" />
                  <HelpCircle size={64} className="text-white/20" />
                </div>
                <h3 className="text-3xl font-display font-black uppercase tracking-widest mb-4">Select a Topic</h3>
                <p className="text-white/40 font-bold max-w-sm leading-relaxed">Choose a category from the left to explore detailed features, visual aids, and interactive tutorials.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Tips Footer */}
      <section className="mt-20">
        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-white/20 mb-8">Pro Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Info className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Press <span className="text-white">Spacebar</span> anywhere on the platform to instantly play or pause your current track without touching the player.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Book className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">No account needed — click "Enter as Guest" to browse all music, videos, and movies without signing in.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Tv className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Enable your FAST Channel in Video Manager to give fans a 24/7 channel of your content — automatic schedule, ads, and bumpers included.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <ShieldCheck className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Join an artist's Sanctuary to unlock exclusive tracks, private video streams, and direct chat access with the creator.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Sparkles className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Build a World in Creator Studio to give your fans a 3D interactive universe to explore — characters, lore, timelines, and a force graph.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Award className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Look for the "?" icon while browsing — it marks a hidden track in the Hide N Seek discovery game. Find it to earn PlajahBucks.</p>
          </div>
        </div>
      </section>

      {/* Account & Data section */}
      <section className="mt-12 pt-10 border-t border-white/[0.06]">
        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-white/20 mb-6">Account & Data</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => onDeleteAccount ? onDeleteAccount() : window.open('/delete-account', '_blank')}
            className="flex items-center gap-4 p-5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/15 hover:border-red-500/30 rounded-2xl transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-red-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-red-300 group-hover:text-red-200 transition-colors">Delete Account &amp; Data</div>
              <div className="text-[11px] text-white/40 mt-0.5">Permanently remove your account and all associated data</div>
            </div>
            <ChevronRight size={16} className="text-white/20 group-hover:text-red-400 ml-auto transition-colors" />
          </button>
          <a
            href="mailto:support@plajah.com"
            className="flex items-center gap-4 p-5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/15 rounded-2xl transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <MessageSquare size={18} className="text-white/50" />
            </div>
            <div>
              <div className="font-bold text-sm text-white/70 group-hover:text-white transition-colors">Contact Support</div>
              <div className="text-[11px] text-white/40 mt-0.5">support@plajah.com</div>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
};

export default HelpCenter;
