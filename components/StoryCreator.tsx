import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Video, Type, Link as LinkIcon, Send, Loader2, Image as ImageIcon, Globe, Users, Star, EyeOff, ChevronRight } from 'lucide-react';
import { createStory, uploadStoryMedia } from '../services/backendService';
import { getStoryCircle, isPrivateAccount, type StoryAudience, type StoryCircle } from '../services/storyAudience';
import StoryAudienceSheet from './StoryAudienceSheet';

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  onClose: () => void;
}

const BG_PRESETS = [
  'linear-gradient(135deg,#1a1a2e,#16213e)',
  'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',
  'linear-gradient(135deg,#870000,#190a05)',
  'linear-gradient(135deg,#141e30,#243b55)',
  'linear-gradient(135deg,#093028,#237a57)',
  'linear-gradient(135deg,#4a00e0,#8e2de2)',
  'linear-gradient(135deg,#f09819,#ff512f)',
  'linear-gradient(135deg,#000000,#434343)',
];

const StoryCreator: React.FC<Props> = ({ currentUserId, currentUserName, currentUserPhoto, onClose }) => {
  const [mode, setMode]             = useState<'PHOTO' | 'VIDEO' | 'TEXT'>('PHOTO');
  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [caption, setCaption]       = useState('');
  const [link, setLink]             = useState('');
  const [bgPreset, setBgPreset]     = useState(BG_PRESETS[0]);
  const [uploading, setUploading]   = useState(false);
  const [duration, setDuration]     = useState(5);
  const [failed, setFailed]         = useState(false);
  // Audience — like Instagram: Public (public accounts), Followers, or Close Friends.
  const [audience, setAudience]     = useState<StoryAudience>('PUBLIC');
  const [isPrivate, setIsPrivate]   = useState(false);
  const [circle, setCircle]         = useState<StoryCircle>({ closeFriends: [], hiddenFrom: [] });
  const [editing, setEditing]       = useState<null | 'closeFriends' | 'hiddenFrom'>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([isPrivateAccount(currentUserId), getStoryCircle(currentUserId)]).then(([priv, c]) => {
      if (!alive) return;
      setIsPrivate(priv);
      setCircle(c);
      if (priv) setAudience(a => (a === 'PUBLIC' ? 'FOLLOWERS' : a));
    }).catch(() => {});
    return () => { alive = false; };
  }, [currentUserId]);
  const fileRef                      = useRef<HTMLInputElement>(null);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const publish = async () => {
    // Close Friends with nobody on the list: build the list first (before uploading anything).
    if (audience === 'CLOSE_FRIENDS' && circle.closeFriends.length === 0) { setEditing('closeFriends'); return; }
    setUploading(true);
    try {
      let mediaUrl = '';
      let mediaType: 'PHOTO' | 'VIDEO' = 'PHOTO';

      if (mode === 'TEXT') {
        // Text-only story — use a 1×1 transparent pixel as placeholder
        mediaUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        mediaType = 'PHOTO';
      } else if (file) {
        const url = await uploadStoryMedia(file, currentUserId);
        if (!url) throw new Error('Upload failed');
        mediaUrl = url;
        mediaType = file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
      } else {
        return;
      }

      setFailed(false);
      const id = await createStory(currentUserId, {
        ownerName: currentUserName,
        ownerPhoto: currentUserPhoto,
        mediaUrl,
        mediaType,
        caption: caption.trim() || undefined,
        link: link.trim() || undefined,
        photoDisplayDuration: duration,
        backgroundColor: mode === 'TEXT' ? bgPreset : undefined,
      }, audience);
      if (!id) throw new Error('Story was not saved');
      onClose();
    } catch (e) {
      console.error('publish story', e);
      setFailed(true);
    } finally {
      setUploading(false);
    }
  };

  const canPublish = (mode === 'TEXT' && caption.trim()) || (mode !== 'TEXT' && file);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl"
    >
      <div className="w-full max-w-sm bg-[#111] rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl border border-white/5">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="font-black text-sm uppercase tracking-[0.3em] text-white">Create Story</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={20} /></button>
        </div>

        {/* Mode picker */}
        <div className="flex gap-2 px-6 py-3 border-b border-white/5">
          {(['PHOTO', 'VIDEO', 'TEXT'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setFile(null); setPreview(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
            >
              {m === 'PHOTO' ? <ImageIcon size={12} /> : m === 'VIDEO' ? <Video size={12} /> : <Type size={12} />}
              {m}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {mode === 'TEXT' ? (
            <>
              {/* Text story preview */}
              <div className="w-full aspect-[9/14] rounded-2xl flex items-center justify-center p-8 relative overflow-hidden" style={{ background: bgPreset }}>
                <p className="text-white text-xl font-bold text-center leading-relaxed drop-shadow-lg">{caption || 'Your story text...'}</p>
              </div>
              {/* BG presets */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {BG_PRESETS.map((bg, i) => (
                  <button key={i} onClick={() => setBgPreset(bg)}
                    className={`w-8 h-8 rounded-full shrink-0 border-2 transition-all ${bgPreset === bg ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ background: bg }}
                  />
                ))}
              </div>
            </>
          ) : preview ? (
            <div className="relative w-full aspect-[9/14] rounded-2xl overflow-hidden bg-black">
              {mode === 'VIDEO'
                ? <video src={preview} className="w-full h-full object-cover" controls={false} muted playsInline autoPlay loop />
                : <img src={preview} className="w-full h-full object-cover" alt="" />
              }
              <button onClick={() => { setFile(null); setPreview(null); }} className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[9/14] rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3 hover:border-white/30 transition-colors"
            >
              {mode === 'PHOTO' ? <Camera size={36} className="text-white/20" /> : <Video size={36} className="text-white/20" />}
              <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Tap to select {mode.toLowerCase()}</span>
            </button>
          )}

          <input ref={fileRef} type="file" accept={mode === 'VIDEO' ? 'video/*' : 'image/*'} className="hidden" onChange={pickFile} />

          {/* Caption */}
          <div className="relative">
            <Type size={14} className="absolute left-3 top-3 text-white/30" />
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value.slice(0, 200))}
              placeholder="Add a caption..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 resize-none"
            />
          </div>

          {/* Link */}
          <div className="relative">
            <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="Add a link (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-white/20"
            />
          </div>

          {/* Photo duration */}
          {mode === 'PHOTO' && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 w-24">Duration</span>
              {[3, 5, 7, 10].map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black transition-all ${duration === d ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40'}`}
                >{d}s</button>
              ))}
            </div>
          )}

          {/* Audience */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Share to</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['PUBLIC', 'Public', Globe],
                ['FOLLOWERS', 'Followers', Users],
                ['CLOSE_FRIENDS', 'Close Friends', Star],
              ] as const).map(([key, label, Icon]) => {
                const off = key === 'PUBLIC' && isPrivate;
                const on = audience === key;
                return (
                  <button key={key} disabled={off} onClick={() => setAudience(key)}
                    title={off ? 'Your account is private, so stories go to your followers.' : undefined}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30 ${on ? (key === 'CLOSE_FRIENDS' ? 'bg-green-500 text-black' : 'bg-small-orange text-white') : 'bg-white/5 text-white/45 hover:bg-white/10'}`}>
                    <Icon size={14} /> {label}
                  </button>
                );
              })}
            </div>
            {audience === 'PUBLIC' && circle.hiddenFrom.length > 0 && (
              <p className="text-[11px] text-white/45">You’ve hidden your story from {circle.hiddenFrom.length} {circle.hiddenFrom.length === 1 ? 'person' : 'people'}, so this one goes to your followers.</p>
            )}
            {isPrivate && <p className="text-[11px] text-white/45">Your account is private — only approved followers see your stories.</p>}
            <div className="flex flex-col divide-y divide-white/5 rounded-xl bg-white/[0.03] border border-white/5">
              <button onClick={() => setEditing('closeFriends')} className="flex items-center gap-2 px-3 py-2.5 text-left text-xs text-white/70 hover:text-white">
                <Star size={13} className="text-green-400" /> <span className="flex-1">Close Friends</span>
                <span className="text-white/35">{circle.closeFriends.length}</span><ChevronRight size={13} className="text-white/30" />
              </button>
              <button onClick={() => setEditing('hiddenFrom')} className="flex items-center gap-2 px-3 py-2.5 text-left text-xs text-white/70 hover:text-white">
                <EyeOff size={13} className="text-white/50" /> <span className="flex-1">Hide story from</span>
                <span className="text-white/35">{circle.hiddenFrom.length}</span><ChevronRight size={13} className="text-white/30" />
              </button>
            </div>
          </div>

          {/* Publish */}
          {failed && <p className="text-xs text-red-400 text-center">Your story didn't post. Try again.</p>}
          <button
            onClick={publish}
            disabled={!canPublish || uploading}
            className="w-full py-4 rounded-2xl bg-small-orange text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {uploading ? 'Publishing...' : audience === 'CLOSE_FRIENDS' ? 'Share to Close Friends' : 'Share Story'}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {editing && (
          <StoryAudienceSheet ownerId={currentUserId} list={editing} onClose={c => { setCircle(c); setEditing(null); }} />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StoryCreator;
