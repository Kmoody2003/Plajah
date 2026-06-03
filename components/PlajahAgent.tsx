/**
 * PlajahAgent — "Muse"
 *
 * A private agentic AI assistant embedded in the platform.  Every user gets
 * their own isolated conversation history (stored at users/{uid}/muse_sessions).
 * No other user can read or influence their sessions.
 *
 * Capabilities:
 *  • Describe a module experience → Muse generates the config and previews it
 *  • Describe an album gallery aesthetic → Muse builds the gallery config
 *  • Upload PDFs / images / text → Muse reads and incorporates them
 *  • Web grounding (Plajah+ / Pro) → Muse can search the live web
 *  • Content curation → Muse recommends artists, tracks, and modules based on
 *    the user's listening history and interests
 */

import React, {
  useState, useEffect, useRef, useCallback, useId,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, X, Send, Plus, Paperclip, Globe, Lock,
  ChevronDown, ChevronRight, RefreshCw, Layers, Music2,
  Film, GraduationCap, Search, Image as ImageIcon, FileText,
  Zap, Star, Check, AlertTriangle, Trash2, MessageSquare,
  Settings, ChevronLeft, ExternalLink,
} from 'lucide-react';
import {
  AGENT_TIERS, AgentTier, AgentMessage, AgentSession, AgentBuildOutput,
  AgentUsage, sendAgentMessage, createSession, listSessions,
  listenToMessages, getAgentUsage,
} from '../services/agentService';
import { auth } from '../services/backendService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The user's current Plajah tier — passed from App state */
  tier?: AgentTier;
  /** Current context: what page/album the user is on */
  context?: { currentView?: string; currentAlbumId?: string; userInterests?: string[] };
  /** Navigate when a build is applied */
  onApplyBuild?: (build: AgentBuildOutput) => void;
}

// ── Tier badge ─────────────────────────────────────────────────────────────────
const TierBadge: React.FC<{ tier: AgentTier }> = ({ tier }) => {
  const cfg = AGENT_TIERS[tier];
  return (
    <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
      style={{ background: cfg.color + '22', border: `1px solid ${cfg.color}55`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
};

// ── Tool call indicator ────────────────────────────────────────────────────────
const ToolCallBadge: React.FC<{ name: string; label: string; status: 'running' | 'done' | 'error' }> = ({ name, label, status }) => {
  const icons: Record<string, React.ReactNode> = {
    search_web: <Globe size={10} />,
    search_platform: <Music2 size={10} />,
    generate_module: <Layers size={10} />,
    generate_gallery: <ImageIcon size={10} />,
    curate_content: <Sparkles size={10} />,
    read_document: <FileText size={10} />,
    find_images: <Search size={10} />,
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
      status === 'running' ? 'bg-purple-900/40 border-purple-500/30 text-purple-300 animate-pulse' :
      status === 'done'    ? 'bg-green-900/30 border-green-500/20 text-green-400' :
                             'bg-red-900/30 border-red-500/20 text-red-400'
    }`}>
      <span className="shrink-0">{icons[name] ?? <Zap size={10} />}</span>
      {label}
      {status === 'running' && <div className="w-2 h-2 border border-purple-400/40 border-t-purple-300 rounded-full animate-spin" />}
      {status === 'done'    && <Check size={9} />}
    </div>
  );
};

// ── Build output card ──────────────────────────────────────────────────────────
const BuildCard: React.FC<{ build: AgentBuildOutput; onApply?: () => void }> = ({ build, onApply }) => {
  const [expanded, setExpanded] = useState(false);
  const typeIcon = build.type === 'MODULE' ? <Layers size={14} /> :
                   build.type === 'GALLERY' ? <ImageIcon size={14} /> :
                   build.type === 'PLAYLIST' ? <Music2 size={14} /> : <Sparkles size={14} />;
  const typeLabel = { MODULE: 'Module', GALLERY: 'Gallery View', PLAYLIST: 'Playlist', CURATION: 'Curation' }[build.type];
  const gradient = build.previewGradient || 'from-purple-900/80 to-indigo-900/60';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`mt-3 rounded-[1.25rem] overflow-hidden border border-white/10 bg-gradient-to-br ${gradient}`}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-purple-300">{typeIcon}</span>
          <span className="text-[8px] font-black uppercase tracking-widest text-purple-300/70">{typeLabel} Generated</span>
          {build.previewEmoji && <span className="ml-auto text-xl">{build.previewEmoji}</span>}
        </div>
        <h4 className="text-sm font-black text-white leading-tight">{build.title}</h4>
        <p className="text-[10px] text-white/50 mt-0.5 line-clamp-2">{build.description}</p>
      </div>

      <div className="border-t border-white/10 flex">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
        >
          {expanded ? 'Hide Config' : 'View Config'} <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {onApply && (
          <button
            onClick={onApply}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600/50 hover:bg-purple-500/60 border-l border-white/10 text-[8px] font-black uppercase tracking-widest text-purple-200 transition-all"
          >
            <Zap size={10} /> Apply
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <pre className="text-[9px] text-white/50 p-4 overflow-x-auto custom-scrollbar border-t border-white/10 max-h-40">
              {JSON.stringify(build.config, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Message bubble ─────────────────────────────────────────────────────────────
const MessageBubble: React.FC<{ msg: AgentMessage; onApplyBuild?: (b: AgentBuildOutput) => void }> = ({ msg, onApplyBuild }) => {
  const isUser = msg.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-lg mt-0.5">
          <Sparkles size={12} className="text-white" />
        </div>
      )}

      <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        {/* Attachment names */}
        {msg.attachmentNames && msg.attachmentNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.attachmentNames.map(n => (
              <span key={n} className="flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded-full text-[8px] text-white/50">
                <Paperclip size={8} />{n}
              </span>
            ))}
          </div>
        )}

        {/* Tool call badges */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} name={tc.name} label={tc.label} status={tc.status} />
            ))}
          </div>
        )}

        {/* Content bubble */}
        {msg.content && (
          <div className={`rounded-[1.1rem] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-purple-600/80 text-white rounded-tr-sm'
              : msg.error
                ? 'bg-red-900/30 border border-red-500/20 text-red-200 rounded-tl-sm'
                : 'bg-white/[0.07] border border-white/[0.09] text-white/90 rounded-tl-sm'
          }`}>
            {msg.content}
          </div>
        )}

        {/* Build output */}
        {msg.buildOutput && (
          <div className="w-full">
            <BuildCard build={msg.buildOutput} onApply={onApplyBuild ? () => onApplyBuild(msg.buildOutput!) : undefined} />
          </div>
        )}

        <span className="text-[7px] text-white/20 px-1">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
};

// ── Thinking indicator ─────────────────────────────────────────────────────────
const ThinkingBubble: React.FC<{ toolLabel?: string }> = ({ toolLabel }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
    <div className="shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-lg">
      <Sparkles size={12} className="text-white animate-pulse" />
    </div>
    <div className="bg-white/[0.07] border border-white/[0.09] rounded-[1.1rem] rounded-tl-sm px-4 py-3">
      {toolLabel ? (
        <div className="flex items-center gap-2 text-[9px] text-purple-300/80 font-black uppercase tracking-widest">
          <div className="w-3 h-3 border border-purple-400/40 border-t-purple-300 rounded-full animate-spin" />
          {toolLabel}
        </div>
      ) : (
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-400/70"
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, delay: i * 0.18, repeat: Infinity }} />
          ))}
        </div>
      )}
    </div>
  </motion.div>
);

// ── Limit bar ──────────────────────────────────────────────────────────────────
const UsageBar: React.FC<{ used: number; limit: number; label: string; color?: string }> = ({ used, limit: lim, label, color = '#8b5cf6' }) => {
  if (lim === -1) return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] text-white/30 font-black uppercase tracking-widest w-20">{label}</span>
      <span className="text-[8px] text-green-400/70 font-black">∞ Unlimited</span>
    </div>
  );
  const pct = Math.min((used / lim) * 100, 100);
  const isAlmost = pct >= 80;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] text-white/30 font-black uppercase tracking-widest w-20">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: isAlmost ? '#ef4444' : color }} />
      </div>
      <span className={`text-[8px] font-black tabular-nums ${isAlmost ? 'text-red-400' : 'text-white/30'}`}>{used}/{lim}</span>
    </div>
  );
};

// ── Capability pills shown to user ─────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Layers,    label: 'Build a Module',       prompt: 'Build me a module experience about ' },
  { icon: ImageIcon, label: 'Design Gallery View',   prompt: 'Create an album gallery view with ' },
  { icon: Music2,    label: 'Curate a Playlist',     prompt: 'Curate a playlist for me based on ' },
  { icon: Globe,     label: 'Research & Discover',   prompt: 'Research and find content about ' },
  { icon: Sparkles,  label: 'Surprise Me',           prompt: 'Create something unique and surprising based on my listening history' },
];

// ── Main component ─────────────────────────────────────────────────────────────
const PlajahAgent: React.FC<Props> = ({
  isOpen, onClose, tier = 'FREE', context, onApplyBuild,
}) => {
  const uid = auth.currentUser?.uid;
  const tierCfg = AGENT_TIERS[tier];

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [usage, setUsage] = useState<AgentUsage>({ dailyMessages: 0, dailySearches: 0, monthlyModules: 0, monthlyGalleries: 0, monthlyVoiceChars: 0, monthlyImages: 0, monthlyTranscriptionMinutes: 0, resetDate: '' });
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | undefined>();
  const [attachments, setAttachments] = useState<Array<{ name: string; dataUrl: string; type: string }>>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(tier !== 'FREE' && tier !== 'CREATOR');
  const [limitBanner, setLimitBanner] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load / create session on open
  useEffect(() => {
    if (!isOpen || !uid) return;
    listSessions(uid).then(list => {
      setSessions(list);
      if (list.length > 0 && !sessionId) {
        setSessionId(list[0].id);
      } else if (list.length === 0) {
        createSession(uid).then(id => { setSessionId(id); setSessions([{ id, title: 'New Conversation', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0, lastSnippet: '' }]); });
      }
    });
    if (uid) getAgentUsage(uid).then(setUsage);
  }, [isOpen, uid]);

  // Subscribe to messages for current session
  useEffect(() => {
    if (!uid || !sessionId) return;
    const unsub = listenToMessages(uid, sessionId, msgs => {
      setMessages(msgs);
    });
    return unsub;
  }, [uid, sessionId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const canSend = !!input.trim() && !isThinking && (tierCfg.dailyMessages === -1 || usage.dailyMessages < tierCfg.dailyMessages);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxUploads = tierCfg.uploadsPerSession;
    if (maxUploads === 0) { setLimitBanner('Upgrade to Creator or above to attach files.'); return; }
    const slots = maxUploads - attachments.length;
    files.slice(0, slots).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setAttachments(prev => [...prev, { name: file.name, dataUrl: ev.target?.result as string, type: file.type }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSend = useCallback(async () => {
    if (!canSend || !uid || !sessionId) return;
    const text = input.trim();
    setInput('');
    setIsThinking(true);
    setThinkingLabel(undefined);
    setLimitBanner(null);

    // Optimistic usage increment
    setUsage(u => ({ ...u, dailyMessages: u.dailyMessages + 1 }));

    const result = await sendAgentMessage({
      uid, sessionId, message: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      tier,
      context: {
        ...context,
        // tell the agent whether web search is enabled for this turn
        userInterests: context?.userInterests,
      },
    });

    setAttachments([]);
    setIsThinking(false);

    if (result.limitReached) {
      setLimitBanner(result.error || 'Limit reached.');
    }
    if (result.usage) setUsage(result.usage);
  }, [canSend, uid, sessionId, input, attachments, tier, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const startNewSession = async () => {
    if (!uid) return;
    const id = await createSession(uid);
    const newSession = { id, title: 'New Conversation', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0, lastSnippet: '' };
    setSessions(prev => [newSession, ...prev]);
    setSessionId(id);
    setShowSessions(false);
    setMessages([]);
  };

  const handleCapabilityClick = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const limitReached = tierCfg.dailyMessages !== -1 && usage.dailyMessages >= tierCfg.dailyMessages;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed bottom-0 right-0 z-[300] flex flex-col"
          style={{
            width: 'min(420px, 100vw)',
            height: 'min(680px, 100dvh)',
            borderRadius: '1.5rem 1.5rem 0 0',
          }}
        >
          {/* Glass panel */}
          <div className="flex flex-col h-full rounded-t-[1.5rem] overflow-hidden"
            style={{ background: 'rgba(8,4,20,0.88)', backdropFilter: 'blur(32px)', border: '1px solid rgba(139,92,246,0.2)', borderBottom: 'none' }}>

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
              {/* Session list toggle */}
              <button onClick={() => setShowSessions(s => !s)} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <MessageSquare size={14} className="text-white/50" />
              </button>

              {/* Identity */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-lg shrink-0">
                  <Sparkles size={13} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">Muse</span>
                    <TierBadge tier={tier} />
                    <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-green-400/70">
                      <Lock size={7} />Private
                    </span>
                  </div>
                  <p className="text-[8px] text-white/30 truncate">Your personal creative agent</p>
                </div>
              </div>

              {/* Usage button */}
              <button onClick={() => setShowUsage(s => !s)} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all" title="Usage">
                <Zap size={12} className="text-white/40" />
              </button>

              {/* Web search toggle (Plajah+ and above) */}
              {(tier === 'PLAJAH_PLUS' || tier === 'STUDIO_PRO' || tier === 'AUTHOR_PRO') && (
                <button
                  onClick={() => setWebSearchEnabled(e => !e)}
                  title="Web search grounding"
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest border transition-all ${webSearchEnabled ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/30'}`}
                >
                  <Globe size={9} />Web
                </button>
              )}

              <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <X size={14} className="text-white/50" />
              </button>
            </div>

            {/* ── Usage panel ── */}
            <AnimatePresence>
              {showUsage && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  className="overflow-hidden border-b border-white/5 shrink-0">
                  <div className="p-4 space-y-2">
                    <UsageBar used={usage.dailyMessages} limit={tierCfg.dailyMessages} label="Messages" />
                    <UsageBar used={usage.dailySearches} limit={tierCfg.webSearchesPerDay} label="Web Search" color="#3b82f6" />
                    <UsageBar used={usage.monthlyModules} limit={tierCfg.moduleBuildsPerMonth} label="Modules" color="#10b981" />
                    <UsageBar used={usage.monthlyGalleries} limit={tierCfg.galleryBuildsPerMonth} label="Galleries" color="#f59e0b" />
                    {(tier === 'FREE' || tier === 'STARTER') && (
                      <p className="text-[8px] text-purple-400/60 pt-1">
                        Upgrade to <span className="font-black text-purple-300">Creator Pro</span> for 100 msg/day, unlimited builds, and 20 web searches.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Session list drawer ── */}
            <AnimatePresence>
              {showSessions && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="absolute top-[52px] left-0 right-0 z-20 bg-[#0c0818]/95 backdrop-blur-xl border border-white/10 rounded-b-2xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar">
                  <div className="p-3 flex items-center justify-between border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Conversations</span>
                    <button onClick={startNewSession} className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 border border-purple-500/30 rounded-full text-[8px] font-black text-purple-300">
                      <Plus size={9} /> New
                    </button>
                  </div>
                  {sessions.map(s => (
                    <button key={s.id} onClick={() => { setSessionId(s.id); setShowSessions(false); }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${s.id === sessionId ? 'bg-purple-900/20' : ''}`}>
                      <MessageSquare size={12} className="text-white/30 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-white/70 truncate">{s.title}</p>
                        <p className="text-[8px] text-white/25 truncate">{s.lastSnippet || 'No messages yet'}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Message list ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-4 min-h-0">

              {/* Empty state / capabilities */}
              {messages.length === 0 && !isThinking && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 pt-4">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center mx-auto mb-3 shadow-2xl">
                      <Sparkles size={22} className="text-white" />
                    </div>
                    <h3 className="text-base font-black text-white">Hi, I'm Muse</h3>
                    <p className="text-xs text-white/40 mt-1 max-w-[260px] mx-auto leading-relaxed">
                      Your private creative agent. I can build module experiences, design gallery views, curate content, and research the web — all just for you.
                    </p>
                  </div>

                  {/* Privacy notice */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-900/20 border border-green-500/20 rounded-xl">
                    <Lock size={11} className="text-green-400 shrink-0" />
                    <p className="text-[9px] text-green-300/70 leading-snug">Your conversations are private. Only you can see this history — never visible to other users or used to train models.</p>
                  </div>

                  {/* Capability prompts */}
                  <div className="space-y-2">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/30 pl-1">Try asking me to…</p>
                    {CAPABILITIES.map(cap => {
                      const Icon = cap.icon;
                      return (
                        <button key={cap.label} onClick={() => handleCapabilityClick(cap.prompt)}
                          className="w-full flex items-center gap-3 p-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-2xl text-left transition-all">
                          <div className="w-7 h-7 rounded-xl bg-purple-900/50 flex items-center justify-center shrink-0">
                            <Icon size={13} className="text-purple-300" />
                          </div>
                          <span className="text-xs font-bold text-white/70">{cap.label}</span>
                          <ChevronRight size={12} className="text-white/20 ml-auto shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Messages */}
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onApplyBuild={onApplyBuild} />
              ))}

              {/* Thinking */}
              {isThinking && <ThinkingBubble toolLabel={thinkingLabel} />}

              {/* Limit banner */}
              {limitBanner && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 p-3 bg-amber-900/30 border border-amber-500/30 rounded-xl">
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-200/80 leading-snug">{limitBanner}</p>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* ── Attachment preview ── */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  className="overflow-hidden shrink-0">
                  <div className="flex gap-2 px-4 py-2 border-t border-white/5 overflow-x-auto no-scrollbar">
                    {attachments.map((a, i) => (
                      <div key={i} className="shrink-0 flex items-center gap-1.5 pl-2 pr-1 py-1 bg-white/10 border border-white/15 rounded-full">
                        {a.type.startsWith('image') ? <ImageIcon size={9} className="text-white/50" /> : <FileText size={9} className="text-white/50" />}
                        <span className="text-[8px] text-white/60 font-bold max-w-[80px] truncate">{a.name}</span>
                        <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                          className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                          <X size={7} className="text-white/50" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Daily limit reached ── */}
            {limitReached && (
              <div className="shrink-0 px-4 py-3 border-t border-white/5 flex items-center gap-2 bg-amber-950/30">
                <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                <p className="text-[9px] text-amber-200/70 flex-1">Daily message limit reached for {tierCfg.label} plan.</p>
                <button className="px-3 py-1 bg-purple-600/40 border border-purple-500/40 rounded-full text-[8px] font-black text-purple-300">Upgrade</button>
              </div>
            )}

            {/* ── Input area ── */}
            {!limitReached && (
              <div className="shrink-0 border-t border-white/5 p-3">
                <div className="flex gap-2 items-end">
                  {/* Attach button */}
                  <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.md,.docx" onChange={handleFileAdd} className="hidden" />
                  <button
                    onClick={() => {
                      if (tierCfg.uploadsPerSession === 0) { setLimitBanner('Upgrade to Creator or above to attach files.'); return; }
                      fileInputRef.current?.click();
                    }}
                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all shrink-0"
                    title="Attach file"
                  >
                    <Paperclip size={14} className="text-white/40" />
                  </button>

                  {/* Text input */}
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      placeholder="Describe what you want to create…"
                      className="w-full resize-none bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-purple-500/50 transition-colors"
                      style={{ maxHeight: 120, minHeight: 40 }}
                      onInput={e => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = 'auto';
                        t.style.height = t.scrollHeight + 'px';
                      }}
                    />
                  </div>

                  {/* Send button */}
                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-600/20"
                  >
                    <Send size={14} className="text-white" />
                  </button>
                </div>

                {/* Footer info */}
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[7px] text-white/20">
                    {tierCfg.dailyMessages === -1 ? 'Unlimited' : `${Math.max(0, tierCfg.dailyMessages - usage.dailyMessages)} messages left today`}
                  </span>
                  {webSearchEnabled && (
                    <span className="flex items-center gap-1 text-[7px] text-blue-400/50">
                      <Globe size={7} />
                      Web grounding on · {Math.max(0, tierCfg.webSearchesPerDay - usage.dailySearches)} searches left
                    </span>
                  )}
                  <span className="text-[7px] text-white/15">↵ send · ⇧↵ newline</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Floating trigger button ────────────────────────────────────────────────────
export const MuseButton: React.FC<{ onClick: () => void; isOpen: boolean; hasUnread?: boolean }> = ({ onClick, isOpen, hasUnread }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.08 }}
    whileTap={{ scale: 0.94 }}
    className="fixed bottom-24 right-4 z-[250] w-12 h-12 rounded-[1rem] flex items-center justify-center shadow-2xl shadow-purple-600/30 transition-all"
    style={{
      background: isOpen ? 'rgba(139,92,246,0.9)' : 'rgba(8,4,20,0.9)',
      border: isOpen ? '1px solid rgba(167,139,250,0.6)' : '1px solid rgba(139,92,246,0.4)',
      backdropFilter: 'blur(16px)',
    }}
    title="Open Muse — your private creative agent"
  >
    {isOpen ? <X size={18} className="text-white" /> : <Sparkles size={18} className="text-purple-300" />}
    {hasUnread && !isOpen && (
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-small-orange border-2 border-[#08041a]" />
    )}
  </motion.button>
);

export default PlajahAgent;
