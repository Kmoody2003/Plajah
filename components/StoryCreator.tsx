import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Video, Type, Link as LinkIcon, Send, Loader2, Image as ImageIcon } from 'lucide-react';
import { createStory, uploadStoryMedia } from '../services/backendService';

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
  const fileRef                      = useRef<HTMLInputElement>(null);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const publish = async () => {
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

      await createStory(currentUserId, {
        ownerName: currentUserName,
        ownerPhoto: currentUserPhoto,
        mediaUrl,
        mediaType,
        caption: caption.trim() || undefined,
        link: link.trim() || undefined,
        photoDisplayDuration: duration,
        isPublic: true,
        backgroundColor: mode === 'TEXT' ? bgPreset : undefined,
      });
      onClose();
    } catch (e) {
      console.error('publish story', e);
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

          {/* Publish */}
          <button
            onClick={publish}
            disabled={!canPublish || uploading}
            className="w-full py-4 rounded-2xl bg-small-orange text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {uploading ? 'Publishing...' : 'Share Story'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default StoryCreator;
