import React, { useState, useEffect } from 'react';
import { UserProfile, PartnerConfig } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, Cloud, Link, Check, X, 
  ArrowLeft, Save, RefreshCw, HardDrive, 
  Globe, ShieldCheck, Box, Plus, Trash2
} from 'lucide-react';
import { updateUserProfile } from '../services/backendService';

interface PartnerDashboardProps {
  profile: UserProfile;
  onBack: () => void;
}

const PartnerDashboard: React.FC<PartnerDashboardProps> = ({ profile, onBack }) => {
  const [config, setConfig] = useState<PartnerConfig>(profile.partnerConfig || {
    cloudProvider: 'AWS',
    provider: 'AWS',
    bucketName: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: '',
    endpoint: '',
    importStatus: 'IDLE'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'SUCCESS' | 'FAILED' | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateUserProfile(profile.uid, {
        partnerConfig: config,
        isPartner: true
      });
      alert('Partner configuration saved successfully');
    } catch (error) {
      console.error("Failed to save partner config:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 2000));
      setTestResult('SUCCESS');
    } catch (error) {
      setTestResult('FAILED');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex-1 bg-theme text-white p-6 lg:p-12 overflow-y-auto custom-scrollbar pb-40">
      <header className="mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-all">
              <ArrowLeft size={20} />
            </button>
            <span className="text-xs font-black uppercase tracking-[0.4em] text-small-orange">Partner Portal</span>
          </div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Content Library Import</h1>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={testConnection}
            disabled={isTesting}
            className="flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/10 text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            {isTesting ? <RefreshCw size={18} className="animate-spin" /> : <Link size={18} />}
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
          >
            <Save size={18} /> {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </header>

      {testResult && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-12 p-6 rounded-3xl border flex items-center gap-4 ${
            testResult === 'SUCCESS' ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'
          }`}
        >
          {testResult === 'SUCCESS' ? <ShieldCheck size={24} /> : <X size={24} />}
          <div>
            <p className="text-sm font-black uppercase tracking-widest">
              {testResult === 'SUCCESS' ? 'Connection Verified' : 'Connection Failed'}
            </p>
            <p className="text-[10px] font-bold opacity-60">
              {testResult === 'SUCCESS' ? 'Your cloud bucket is ready for library synchronization.' : 'Please check your credentials and endpoint configuration.'}
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Configuration Form */}
        <div className="lg:col-span-2 space-y-8">
          <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
            <h3 className="text-xl font-black uppercase tracking-widest mb-8 flex items-center gap-3">
              <Cloud className="text-small-orange" size={24} /> Cloud Provider Settings
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Storage Provider</label>
                <select 
                  value={config.provider}
                  onChange={e => setConfig({...config, provider: e.target.value as any})}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all appearance-none"
                >
                  <option value="AWS">Amazon S3</option>
                  <option value="GCP">Google Cloud Storage</option>
                  <option value="AZURE">Azure Blob Storage</option>
                  <option value="ONEDRIVE">Microsoft OneDrive</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Bucket / Container Name</label>
                <input 
                  type="text" 
                  value={config.bucketName}
                  onChange={e => setConfig({...config, bucketName: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all"
                  placeholder="e.g. plajah-content-archive"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Access Key ID</label>
                <input 
                  type="text" 
                  value={config.accessKeyId}
                  onChange={e => setConfig({...config, accessKeyId: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all"
                  placeholder="AKIA..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Secret Access Key</label>
                <input 
                  type="password" 
                  value={config.secretAccessKey}
                  onChange={e => setConfig({...config, secretAccessKey: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all"
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>
          </section>

          <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
            <h3 className="text-xl font-black uppercase tracking-widest mb-8 flex items-center gap-3">
              <RefreshCw className="text-small-orange" size={24} /> Sync Schedule
            </h3>
            <div className="flex items-center gap-8">
              <label className="flex items-center gap-4 cursor-pointer group">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-small-orange transition-all">
                  <div className="w-3 h-3 bg-small-orange rounded-full" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Real-time Webhook</span>
              </label>
              <label className="flex items-center gap-4 cursor-pointer group opacity-40">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-small-orange transition-all" />
                <span className="text-xs font-black uppercase tracking-widest">Daily Batch (00:00 UTC)</span>
              </label>
            </div>
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
          <div className="p-8 bg-gradient-to-br from-[#6B0099] to-[#FF8C00] rounded-[2.5rem] shadow-2xl">
            <Database size={48} className="text-white mb-6" />
            <h3 className="text-2xl font-display font-black tracking-tight uppercase mb-4">Library Aggregator</h3>
            <p className="text-sm font-medium text-white/80 leading-relaxed mb-6">
              Connect your external storage to automatically index and serve your content through the Plajah Global Archive.
            </p>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                <Check size={14} /> Automatic Metadata Extraction
              </li>
              <li className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                <Check size={14} /> Global CDN Distribution
              </li>
              <li className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                <Check size={14} /> Rights Management Integration
              </li>
            </ul>
          </div>

          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-6">Recent Imports</h4>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Box size={16} className="text-white/20" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Batch_{i}42.zip</span>
                  </div>
                  <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">Synced</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerDashboard;
