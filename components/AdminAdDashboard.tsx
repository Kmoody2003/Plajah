import React from 'react';
import { ArrowLeft } from 'lucide-react';
import AdminAdPlatform from './admin/AdminAdPlatform';

/**
 * Standalone entry to the Ad Platform (view ADMIN_AD_DASHBOARD). It used to be a second, separate
 * ad console with hard-coded inventory numbers; the one real console now lives in
 * components/admin/AdminAdPlatform.tsx and System Admin → Ad Platform opens the same thing.
 */
const AdminAdDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="flex-1 bg-theme text-white p-6 lg:p-12 overflow-y-auto custom-scrollbar pb-40">
    <button onClick={onBack} className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
      <ArrowLeft size={16} /> Back
    </button>
    <AdminAdPlatform />
  </div>
);

export default AdminAdDashboard;
