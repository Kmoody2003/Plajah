import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  Users, 
  Plus, 
  History, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Search,
  ChevronRight,
  FileText,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Newsletter, MailingListSubscriber, UserProfile } from '../types';
import { 
  fetchMailingListSubscribers, 
  fetchNewsletters, 
  sendNewsletter,
  importMailingList
} from '../services/backendService';
import { Upload, X } from 'lucide-react';

interface MailingListManagerProps {
  artistId: string;
}

const MailingListManager: React.FC<MailingListManagerProps> = ({ artistId }) => {
  const [subscribers, setSubscribers] = useState<MailingListSubscriber[]>([]);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'SUBSCRIBERS' | 'COMPOSE' | 'HISTORY'>('SUBSCRIBERS');
  
  // Compose State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [subs, news] = await Promise.all([
        fetchMailingListSubscribers(artistId),
        fetchNewsletters(artistId)
      ]);
      setSubscribers(subs);
      setNewsletters(news);
      setLoading(false);
    };
    loadData();
  }, [artistId]);

  const handleSend = async () => {
    if (!title || !content || subscribers.length === 0) return;
    setIsSending(true);
    try {
      const news = await sendNewsletter({
        artistId,
        title,
        content
      });
      if (news) {
        setNewsletters([news, ...newsletters]);
        setSendSuccess(true);
        setTitle('');
        setContent('');
        setTimeout(() => setSendSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    try {
      const lines = importText.split('\n').filter(l => l.trim());
      const entries = lines.map(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          return { email: parts[0], name: parts[1] };
        }
        return { email: parts[0] };
      }).filter(e => e.email.includes('@'));

      if (entries.length > 0) {
        await importMailingList(artistId, entries);
        setImportText('');
        setShowImport(false);
        // Reload subscribers
        const subs = await fetchMailingListSubscribers(artistId);
        setSubscribers(subs);
        alert(`Successfully imported ${entries.length} subscribers`);
      }
    } catch (err) {
      console.error(err);
      alert('Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredSubscribers = subscribers.filter(s => 
    s.subscriberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.subscriberEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-40">
        <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest">Loading Mailing List...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] flex items-center gap-4">
          <div className="p-3 bg-small-orange/20 rounded-2xl">
            <Users className="text-small-orange" size={24} />
          </div>
          <div>
            <h4 className="text-2xl font-black uppercase tracking-tightest">{subscribers.length}</h4>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total Subscribers</p>
          </div>
        </div>
        <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] flex items-center gap-4">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <Mail className="text-blue-400" size={24} />
          </div>
          <div>
            <h4 className="text-2xl font-black uppercase tracking-tightest">{newsletters.length}</h4>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Newsletters Sent</p>
          </div>
        </div>
        <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] flex items-center gap-4">
          <div className="p-3 bg-green-500/20 rounded-2xl">
            <Sparkles className="text-green-400" size={24} />
          </div>
          <div>
            <h4 className="text-2xl font-black uppercase tracking-tightest">
              {newsletters.reduce((acc, n) => acc + n.sentCount, 0)}
            </h4>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total Reach</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-white/5 rounded-full self-start">
        {[
          { id: 'SUBSCRIBERS', label: 'Subscribers', icon: Users },
          { id: 'COMPOSE', label: 'Compose', icon: Plus },
          { id: 'HISTORY', label: 'History', icon: History }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[400px]">
        {activeTab === 'SUBSCRIBERS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Mailing List Members</h3>
                <button 
                  onClick={() => setShowImport(!showImport)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60 transition-all"
                >
                  <Upload size={12} /> Import List
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                <input 
                  type="text"
                  placeholder="Search subscribers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-6 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-white/30 transition-all"
                />
              </div>
            </div>

            <AnimatePresence>
              {showImport && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Import Subscribers (CSV format: email, name)</h4>
                      <button onClick={() => setShowImport(false)} className="text-white/20 hover:text-white"><X size={16} /></button>
                    </div>
                    <textarea 
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="email1@example.com, John Doe&#10;email2@example.com, Jane Smith"
                      className="w-full h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-xs font-medium leading-relaxed outline-none focus:border-small-orange transition-all resize-none"
                    />
                    <div className="flex justify-end">
                      <button 
                        onClick={handleImport}
                        disabled={isImporting || !importText.trim()}
                        className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                      >
                        {isImporting ? 'Importing...' : 'Start Import'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-2">
              {filteredSubscribers.length > 0 ? (
                filteredSubscribers.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/40 font-black">
                        {sub.subscriberName[0]}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-wider">{sub.subscriberName}</h4>
                        <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{sub.subscriberEmail}</p>
                      </div>
                    </div>
                    <div className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                      Joined {new Date(sub.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center opacity-20">
                  <Users size={48} className="mx-auto mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">No subscribers found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'COMPOSE' && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase tracking-tightest">New Newsletter</h3>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                Send an update to all {subscribers.length} subscribers
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Subject Line</label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. New Album Drops Tonight!"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Message Content</label>
                <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your message here..."
                  className="w-full h-64 bg-white/5 border border-white/10 rounded-[2rem] px-6 py-6 text-sm font-medium leading-relaxed outline-none focus:border-small-orange transition-all resize-none"
                />
              </div>

              <div className="flex items-center justify-between p-6 bg-small-orange/10 border border-small-orange/20 rounded-2xl">
                <div className="flex items-center gap-3">
                  <AlertCircle className="text-small-orange" size={18} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-small-orange">
                    This will be sent to {subscribers.length} people immediately.
                  </p>
                </div>
                <button 
                  onClick={handleSend}
                  disabled={isSending || !title || !content || subscribers.length === 0}
                  className="flex items-center gap-2 px-8 py-3 bg-small-orange text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 shadow-xl"
                >
                  {isSending ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {isSending ? 'Sending...' : 'Send Newsletter'}
                </button>
              </div>

              <AnimatePresence>
                {sendSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-green-400 justify-center"
                  >
                    <CheckCircle2 size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Newsletter Sent Successfully!</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Sent Newsletters</h3>
            <div className="grid grid-cols-1 gap-4">
              {newsletters.length > 0 ? (
                newsletters.map(news => (
                  <div key={news.id} className="p-6 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/[0.08] transition-all group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-lg">
                          <FileText size={16} className="text-white/60" />
                        </div>
                        <h4 className="text-sm font-bold uppercase tracking-wider">{news.title}</h4>
                      </div>
                      <div className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                        {new Date(news.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <p className="text-xs text-white/40 line-clamp-2 mb-4 font-medium leading-relaxed">
                      {news.content}
                    </p>
                    <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <Users size={12} className="text-white/20" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
                          Sent to {news.sentCount} people
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center opacity-20">
                  <History size={48} className="mx-auto mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">No history found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MailingListManager;
