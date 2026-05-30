import React, { useState, useRef } from 'react';
import { Image, Video, Smile, Globe, X, Film, BookOpen, Layers, Plus } from 'lucide-react';
import { Album, IPWorld } from '../types';

export interface ComposerAttachment {
  type: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'GIF';
  url: string;
  title?: string;
  file?: File;
}

export interface AssetEmbed {
  type: 'ALBUM' | 'VIDEO' | 'WORLD' | 'CHARACTER' | 'ARTICLE' | 'PLAYLIST' | 'MODULE' | 'TRACK';
  id: string;
  title: string;
  imageUrl?: string;
  subtitle?: string;
}

export interface ComposerPostData {
  text: string;
  attachments: ComposerAttachment[];
  assetEmbed?: AssetEmbed;
  theme: 'STANDARD' | 'SCRAPBOOK' | 'PHOTO_ALBUM' | 'MUSIC_PLAYER' | 'NEWSPAPER' | 'ARCADE';
}

interface UniversalPostComposerProps {
  currentUser: import('firebase/auth').User | null;
  placeholder?: string;
  onPost: (data: ComposerPostData) => Promise<void>;
  onMakeStory?: (mediaUrl: string, mediaType: 'PHOTO' | 'VIDEO') => void;
  onMakeShort?: (videoUrl: string, title: string) => void;
  onSendToRello?: (videoUrl: string, title: string) => void;
  userAlbums?: Album[];
  userWorlds?: IPWorld[];
  compact?: boolean;
  avatarUrl?: string;
}

const THEMES: { id: ComposerPostData['theme']; label: string }[] = [
  { id: 'STANDARD', label: 'Standard' },
  { id: 'SCRAPBOOK', label: 'Scrapbook' },
  { id: 'PHOTO_ALBUM', label: 'Photo' },
  { id: 'MUSIC_PLAYER', label: 'Music' },
  { id: 'NEWSPAPER', label: 'Paper' },
];

const COMMON_EMOJIS = ['😀','😂','🥺','😍','🔥','👏','🎵','🎨','🌟','💯','🚀','❤️','🎉','👀','🤔','😎','🙏','💪','🌈','✨'];

const GIF_MOCKS = [
  'https://media.tenor.com/1.gif',
  'https://media.tenor.com/2.gif',
  'https://media.tenor.com/3.gif',
];

type AssetTab = 'Albums' | 'Worlds' | 'More';
const MORE_TYPES: { label: string; type: AssetEmbed['type'] }[] = [
  { label: 'Video', type: 'VIDEO' },
  { label: 'Character', type: 'CHARACTER' },
  { label: 'Article', type: 'ARTICLE' },
  { label: 'Module', type: 'MODULE' },
];

const UniversalPostComposer: React.FC<UniversalPostComposerProps> = ({
  currentUser,
  placeholder = 'Share something...',
  onPost,
  onMakeStory,
  onMakeShort,
  onSendToRello,
  userAlbums = [],
  userWorlds = [],
  compact = false,
  avatarUrl,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [assetEmbed, setAssetEmbed] = useState<AssetEmbed | undefined>(undefined);
  const [theme, setTheme] = useState<ComposerPostData['theme']>('STANDARD');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetTab, setAssetTab] = useState<AssetTab>('Albums');
  const [moreAssetType, setMoreAssetType] = useState<AssetEmbed['type'] | null>(null);
  const [moreAssetId, setMoreAssetId] = useState('');
  const [moreAssetTitle, setMoreAssetTitle] = useState('');
  const [posting, setPosting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const canPost = text.trim().length > 0 || attachments.length > 0 || !!assetEmbed;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const type: ComposerAttachment['type'] = file.type.startsWith('video/')
        ? 'VIDEO'
        : file.type.startsWith('audio/')
        ? 'AUDIO'
        : 'PHOTO';
      setAttachments(prev => [...prev, { type, url, title: file.name, file }]);
    }
    e.target.value = '';
  };

  const removeAttachment = (i: number) => {
    setAttachments(prev => {
      const next = [...prev];
      next.splice(i, 1);
      return next;
    });
  };

  const insertEmoji = (emoji: string) => {
    setText(t => t + emoji);
    setShowEmoji(false);
  };

  const handlePost = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    try {
      await onPost({ text, attachments, assetEmbed, theme });
      setText('');
      setAttachments([]);
      setAssetEmbed(undefined);
      setTheme('STANDARD');
      setExpanded(false);
    } finally {
      setPosting(false);
    }
  };

  const addGifMock = (url: string) => {
    setAttachments(prev => [...prev, { type: 'GIF', url, title: 'GIF' }]);
    setShowGif(false);
  };

  const embedAlbum = (album: Album) => {
    setAssetEmbed({
      type: 'ALBUM',
      id: album.id,
      title: album.title,
      imageUrl: album.coverImage,
      subtitle: album.artist,
    });
    setShowAssetPicker(false);
  };

  const embedWorld = (world: IPWorld) => {
    setAssetEmbed({
      type: 'WORLD',
      id: world.id,
      title: world.name,
      imageUrl: world.coverImage,
      subtitle: world.worldType,
    });
    setShowAssetPicker(false);
  };

  const embedMoreAsset = () => {
    if (!moreAssetType || !moreAssetTitle.trim()) return;
    setAssetEmbed({
      type: moreAssetType,
      id: moreAssetId.trim() || '_new',
      title: moreAssetTitle.trim(),
    });
    setShowAssetPicker(false);
    setMoreAssetType(null);
    setMoreAssetId('');
    setMoreAssetTitle('');
  };

  const videoAttachments = attachments.filter(a => a.type === 'VIDEO');

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-3xl p-4 flex items-center gap-3 text-left hover:bg-white/[0.05] transition-all"
      >
        <img
          src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid || 'anon'}`}
          className="w-9 h-9 rounded-full border border-white/10 shrink-0"
          alt=""
        />
        <span className="text-sm text-white/30 font-medium">{placeholder}</span>
      </button>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-5 space-y-3">
      {/* Avatar + textarea */}
      <div className="flex items-start gap-3">
        <img
          src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid || 'anon'}`}
          className="w-9 h-9 rounded-full border border-white/10 shrink-0 mt-1"
          alt=""
        />
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="flex-1 bg-transparent text-sm font-medium resize-none outline-none placeholder:opacity-30 min-h-[80px] leading-relaxed"
          autoFocus
        />
      </div>

      {/* Theme chips */}
      <div className="flex flex-wrap gap-2 pl-12">
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
              theme === t.id ? 'bg-small-orange text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Attachment preview strip */}
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pl-12 pb-1 scrollbar-hide">
          {attachments.map((att, i) => (
            <div key={i} className="relative shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-white/5">
              {att.type === 'PHOTO' ? (
                <img src={att.url} className="w-24 h-20 object-cover" alt="" loading="lazy" />
              ) : att.type === 'VIDEO' ? (
                <video src={att.url} className="w-24 h-20 object-cover" muted playsInline controls />
              ) : (
                <div className="w-24 h-20 flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-white/40 p-2 text-center">
                  {att.title || att.type}
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center hover:bg-black transition-all"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Video action sheet */}
      {videoAttachments.length > 0 && (
        <div className="flex gap-2 flex-wrap pl-12">
          {videoAttachments.map((att, i) => (
            <div key={i} className="flex gap-2">
              {onSendToRello && (
                <button
                  onClick={() => onSendToRello(att.url, att.title || 'Video')}
                  className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-all"
                >
                  📺 Send to Rello
                </button>
              )}
              {onMakeStory && (
                <button
                  onClick={() => onMakeStory(att.url, 'VIDEO')}
                  className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-all"
                >
                  📖 Make Story
                </button>
              )}
              {onMakeShort && (
                <button
                  onClick={() => onMakeShort(att.url, att.title || 'Video')}
                  className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-all"
                >
                  ▶ Make Short
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Asset embed preview */}
      {assetEmbed && (
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 ml-12">
          {assetEmbed.imageUrl && (
            <img src={assetEmbed.imageUrl} className="w-12 h-12 rounded-xl object-cover shrink-0" alt="" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-small-orange mb-0.5">{assetEmbed.type}</p>
            <p className="text-xs font-bold truncate">{assetEmbed.title}</p>
            {assetEmbed.subtitle && <p className="text-[9px] text-white/40 truncate">{assetEmbed.subtitle}</p>}
          </div>
          <button
            onClick={() => setAssetEmbed(undefined)}
            className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 shrink-0 transition-all"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="pl-12 flex flex-wrap gap-1.5 bg-white/5 rounded-2xl p-3 border border-white/10">
          {COMMON_EMOJIS.map(emoji => (
            <button key={emoji} onClick={() => insertEmoji(emoji)} className="text-lg hover:scale-125 transition-transform">
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* GIF picker */}
      {showGif && (
        <div className="pl-12 space-y-2">
          <input
            value={gifQuery}
            onChange={e => setGifQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none placeholder:opacity-30"
          />
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {GIF_MOCKS.map((url, i) => (
              <button
                key={i}
                onClick={() => addGifMock(url)}
                className="shrink-0 w-24 h-16 bg-white/10 rounded-xl flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-white/30 hover:bg-white/20 transition-all border border-white/10"
              >
                GIF {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Asset embed picker modal */}
      {showAssetPicker && (
        <div className="ml-12 bg-black/80 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(['Albums', 'Worlds', 'More'] as AssetTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAssetTab(tab)}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                    assetTab === tab ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAssetPicker(false)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
              <X size={10} />
            </button>
          </div>

          {assetTab === 'Albums' && (
            <div className="grid grid-cols-4 gap-2">
              {userAlbums.slice(0, 8).map(album => (
                <button key={album.id} onClick={() => embedAlbum(album)} className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group">
                  <img src={album.coverImage} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" alt="" />
                  <p className="text-[8px] font-black truncate px-1 py-0.5 opacity-60">{album.title}</p>
                </button>
              ))}
              {userAlbums.length === 0 && <p className="col-span-4 text-[9px] text-white/30 text-center py-4">No albums yet</p>}
            </div>
          )}

          {assetTab === 'Worlds' && (
            <div className="grid grid-cols-3 gap-2">
              {userWorlds.slice(0, 6).map(world => (
                <button key={world.id} onClick={() => embedWorld(world)} className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group">
                  <img src={world.coverImage} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" alt="" />
                  <p className="text-[8px] font-black truncate px-1 py-0.5 opacity-60">{world.name}</p>
                </button>
              ))}
              {userWorlds.length === 0 && <p className="col-span-3 text-[9px] text-white/30 text-center py-4">No worlds yet</p>}
            </div>
          )}

          {assetTab === 'More' && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {MORE_TYPES.map(mt => (
                  <button
                    key={mt.type}
                    onClick={() => setMoreAssetType(moreAssetType === mt.type ? null : mt.type)}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                      moreAssetType === mt.type ? 'bg-small-orange text-black border-small-orange' : 'border-white/10 text-white/40 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
              {moreAssetType && (
                <div className="space-y-2">
                  <input
                    value={moreAssetId}
                    onChange={e => setMoreAssetId(e.target.value)}
                    placeholder="Asset ID (optional)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none placeholder:opacity-30"
                  />
                  <input
                    value={moreAssetTitle}
                    onChange={e => setMoreAssetTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none placeholder:opacity-30"
                  />
                  <button
                    onClick={embedMoreAsset}
                    disabled={!moreAssetTitle.trim()}
                    className="px-4 py-1.5 bg-white text-black rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-white/90"
                  >
                    Embed
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toolbar + post button */}
      <div className="flex items-center gap-1 pl-12">
        {/* File picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-all"
          title="Photo / Video"
        >
          <Image size={16} />
        </button>

        <button
          onClick={() => { setShowGif(s => !s); setShowEmoji(false); setShowAssetPicker(false); }}
          className={`p-2 rounded-xl transition-all text-[10px] font-black ${showGif ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="GIF"
        >
          GIF
        </button>

        <button
          onClick={() => { setShowEmoji(s => !s); setShowGif(false); setShowAssetPicker(false); }}
          className={`p-2 rounded-xl transition-all ${showEmoji ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Emoji"
        >
          <Smile size={16} />
        </button>

        <button
          onClick={() => { setShowAssetPicker(s => !s); setShowEmoji(false); setShowGif(false); }}
          className={`p-2 rounded-xl transition-all ${showAssetPicker ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Embed asset"
        >
          <Globe size={16} />
        </button>

        <div className="flex-1" />

        {/* Character count */}
        <span className={`text-[9px] font-black tabular-nums ${text.length > 280 ? 'text-red-400' : 'text-white/20'}`}>
          {text.length}/280
        </span>

        <button
          onClick={() => { setExpanded(false); setText(''); setAttachments([]); setAssetEmbed(undefined); }}
          className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/8 transition-all"
        >
          <X size={14} />
        </button>

        <button
          onClick={handlePost}
          disabled={!canPost || posting || text.length > 280}
          className="px-6 py-2 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-small-orange/90 transition-all"
        >
          {posting ? '...' : 'Post'}
        </button>
      </div>
    </div>
  );
};

export default UniversalPostComposer;
