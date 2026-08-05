import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Film, Copy, Check, ChevronDown, Loader2,
  Tag, FileText, Share2, RefreshCw, Globe,
} from 'lucide-react';
import { fetchUserAlbums, updateAlbum, auth } from '../services/backendService';
import { callGemini } from '../services/geminiService';
import type { Album } from '../types';

// ── Tool config ────────────────────────────────────────────────────────────────

type AITool = 'METADATA' | 'PRESS_KIT' | 'SOCIAL' | 'COMPARABLES';

const TOOLS: { id: AITool; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { id: 'METADATA',    label: 'Smart Metadata',   desc: 'Auto-generate tags, keywords, and genre classifications',                          icon: <Tag size={16} />,      color: '#22c55e'  },
  { id: 'PRESS_KIT',   label: 'Press Kit Copy',   desc: 'Logline, synopsis, director\'s statement, and audience targeting copy',            icon: <FileText size={16} />, color: '#818cf8'  },
  { id: 'SOCIAL',      label: 'Social Posts',     desc: 'Ready-to-post captions for Mastodon, Bluesky, and Instagram with hashtags',        icon: <Share2 size={16} />,   color: '#f472b6'  },
  { id: 'COMPARABLES', label: 'Comp Titles',      desc: 'AI-suggested comparable titles for pitch decks and marketing positioning',          icon: <Globe size={16} />,    color: '#f59e0b'  },
];

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildMetadataPrompt(album: Album): string {
  return `You are a film metadata specialist. Generate SEO-optimized metadata for this independent film:

Title: ${album.title}
Director: ${album.artist}
Genre: ${album.genre || 'Not specified'}
Synopsis: ${album.description || 'Not provided'}
Year: ${album.movieMetadata?.releaseYear || 'Unknown'}
Tagline: ${album.movieMetadata?.tagline || 'None'}

Return a JSON object with:
- "tags": array of 10-15 specific, searchable keywords (no generic words)
- "genres": array of 3-5 genre tags (primary and crossover genres)
- "moods": array of 5 mood/tone descriptors (e.g. "atmospheric", "tense")
- "themes": array of 5 thematic keywords
- "audience": target audience description in 20 words

Respond ONLY with valid JSON, no markdown.`;
}

function buildPressKitPrompt(album: Album): string {
  return `You are a film publicist writing for festival submissions and press packages.

Film: "${album.title}"
Director: ${album.artist}
Genre: ${album.genre}
Synopsis: ${album.description || 'An independent film.'}
Tagline: ${album.movieMetadata?.tagline || ''}
Year: ${album.movieMetadata?.releaseYear || new Date().getFullYear()}

Write:
1. LOGLINE (one sentence, max 25 words, present tense, inciting incident + protagonist + stakes)
2. SHORT SYNOPSIS (75 words — festival-ready, punchy, no spoilers)
3. FULL SYNOPSIS (200 words — for press screener packages)
4. DIRECTOR'S STATEMENT (100 words — personal voice, why this film, what audiences should feel)
5. AUDIENCE TARGETING (50 words — who will love this film, comp audience demographics)

Format each section with its heading in ALL CAPS followed by a line break.`;
}

function buildSocialPrompt(album: Album): string {
  return `You are a social media strategist for independent film.

Film: "${album.title}" by ${album.artist}
Genre: ${album.genre}
Tagline: ${album.movieMetadata?.tagline || album.description?.slice(0, 80) || ''}

Write 3 social media posts:

POST 1 - MASTODON/BLUESKY (280 chars max, conversational, no caps-lock shouting, 3-5 hashtags)
POST 2 - INSTAGRAM CAPTION (150 words, storytelling tone, strong hook first line, 10 hashtags at end)
POST 3 - ANNOUNCEMENT TWEET (240 chars, punchy, emoji where natural, link placeholder [LINK])

Format each with its platform name in caps as a heading.`;
}

function buildComparablesPrompt(album: Album): string {
  return `You are a film distribution consultant. Suggest comparable titles for this independent film for use in pitch decks and marketing positioning.

Film: "${album.title}"
Genre: ${album.genre}
Synopsis: ${album.description || 'An independent film.'}
Year: ${album.movieMetadata?.releaseYear || new Date().getFullYear()}

Provide:
1. THREE COMP TITLES with year, distributor, and a one-sentence explanation of why it's a comp
2. POSITIONING STATEMENT: One sentence positioning this film in the market ("For fans of X meets Y")
3. FESTIVAL STRATEGY: 3 specific film festivals that would be ideal first-run targets, with brief reasoning

Format clearly with headings.`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmAIAssistant() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [activeTool, setActiveTool] = useState<AITool>('METADATA');
  const [output, setOutput]         = useState<string>('');
  const [parsedMeta, setParsedMeta] = useState<Record<string, any> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [applied, setApplied]       = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const films = a.filter(x => x.type === 'VIDEO');
      setAlbums(films);
      if (films.length > 0) setSelectedId(films[0].id);
      setLoading(false);
    });
  }, []);

  const album = albums.find(a => a.id === selectedId);

  const handleGenerate = async () => {
    if (!album || generating) return;
    setGenerating(true);
    setOutput('');
    setParsedMeta(null);
    setApplied(false);

    let prompt = '';
    switch (activeTool) {
      case 'METADATA':    prompt = buildMetadataPrompt(album);    break;
      case 'PRESS_KIT':   prompt = buildPressKitPrompt(album);    break;
      case 'SOCIAL':      prompt = buildSocialPrompt(album);      break;
      case 'COMPARABLES': prompt = buildComparablesPrompt(album); break;
    }

    const result = await callGemini(prompt);
    if (result) {
      setOutput(result);
      if (activeTool === 'METADATA') {
        try {
          const cleaned = result.replace(/```json|```/g, '').trim();
          setParsedMeta(JSON.parse(cleaned));
        } catch { /* non-JSON response */ }
      }
    } else {
      setOutput('AI generation unavailable. Please ensure GEMINI_API_KEY is configured.');
    }
    setGenerating(false);
  };

  const handleApplyMetadata = async () => {
    if (!album || !parsedMeta || applied) return;
    const tags: string[] = [
      ...(parsedMeta.tags ?? []),
      ...(parsedMeta.genres ?? []),
      ...(parsedMeta.moods ?? []),
      ...(parsedMeta.themes ?? []),
    ];
    await updateAlbum(album.id, { tags: [...new Set(tags)] });
    setApplied(true);
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tool = TOOLS.find(t => t.id === activeTool)!;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">AI Film<br />Assistant</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Gemini-powered metadata · press kit · social posts · comp titles</p>
      </div>

      {/* Film selector */}
      {albums.length > 0 && (
        <div className="relative w-full max-w-sm">
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setOutput(''); setParsedMeta(null); }}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      )}

      {/* Tool selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => { setActiveTool(t.id); setOutput(''); setParsedMeta(null); }}
            className="flex flex-col gap-3 p-4 rounded-2xl border transition-all text-left"
            style={{
              background:  activeTool === t.id ? `${t.color}10` : 'rgba(255,255,255,0.02)',
              borderColor: activeTool === t.id ? `${t.color}35` : 'rgba(255,255,255,0.07)',
            }}>
            <span style={{ color: activeTool === t.id ? t.color : 'rgba(255,255,255,0.2)' }}>{t.icon}</span>
            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${activeTool === t.id ? 'text-white' : 'text-white/35'}`}>{t.label}</p>
              <p className="text-[8px] text-white/20 mt-0.5 leading-relaxed">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Generate button */}
      {album && (
        <div className="flex items-center gap-4">
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ background: tool.color, color: '#000' }}>
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
              : <><Sparkles size={14} /> Generate {tool.label}</>}
          </button>
          <p className="text-[9px] text-white/25">For: <span className="text-white/50 font-black">{album.title}</span></p>
        </div>
      )}

      {/* Output */}
      <AnimatePresence>
        {output && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">{tool.label} — Result</p>
              <div className="flex gap-2">
                <button onClick={copyOutput}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                  {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={handleGenerate} disabled={generating}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                  <RefreshCw size={10} /> Regenerate
                </button>
              </div>
            </div>

            {/* Metadata parsed display */}
            {activeTool === 'METADATA' && parsedMeta ? (
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 space-y-5">
                {[
                  { key: 'tags',    label: 'SEO Tags',    color: '#22c55e' },
                  { key: 'genres',  label: 'Genres',      color: '#818cf8' },
                  { key: 'moods',   label: 'Moods',       color: '#f472b6' },
                  { key: 'themes',  label: 'Themes',      color: '#f59e0b' },
                ].map(section => (
                  <div key={section.key}>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: section.color }}>{section.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(parsedMeta[section.key] ?? []).map((tag: string) => (
                        <span key={tag} className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"
                          style={{ background: `${section.color}12`, color: section.color, border: `1px solid ${section.color}25` }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {parsedMeta.audience && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 mb-1.5">Target Audience</p>
                    <p className="text-[10px] text-white/50">{parsedMeta.audience}</p>
                  </div>
                )}
                <button onClick={handleApplyMetadata} disabled={applied}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] disabled:opacity-40"
                  style={{ background: applied ? '#22c55e' : 'rgba(34,197,94,0.12)', color: applied ? '#000' : '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                  {applied ? <><Check size={11} /> Tags Applied!</> : <><Sparkles size={11} /> Apply Tags to Film</>}
                </button>
              </div>
            ) : (
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7">
                <pre className="whitespace-pre-wrap text-[11px] text-white/60 leading-relaxed font-sans">{output}</pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {albums.length === 0 && !loading && (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <Film size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No films found</p>
          <p className="text-[9px] text-white/12">Upload a film in Film Studio first</p>
        </div>
      )}
    </motion.div>
  );
}
