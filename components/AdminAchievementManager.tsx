import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import {
  fetchAllAchievements,
  createAchievement,
  updateAchievement,
  deactivateAchievement,
} from '../services/achievementService';
import { Achievement, AchievementCategory, AchievementTriggerType } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminAchievementManagerProps {
  onClose?: () => void;
}

export const AdminAchievementManager: React.FC<AdminAchievementManagerProps> = ({ onClose }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [editing, setEditing] = useState<Achievement | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<AchievementCategory | 'ALL'>('ALL');

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      const data = await fetchAllAchievements();
      setAchievements(data);
    } catch (error) {
      console.error('Error loading achievements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (achievement: Omit<Achievement, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createAchievement(achievement);
      await loadAchievements();
      setIsCreating(false);
    } catch (error) {
      console.error('Error creating achievement:', error);
    }
  };

  const handleUpdate = async (id: string, updates: Partial<Achievement>) => {
    try {
      await updateAchievement(id, updates);
      await loadAchievements();
      setEditing(null);
    } catch (error) {
      console.error('Error updating achievement:', error);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (confirm('Deactivate this achievement?')) {
      try {
        await deactivateAchievement(id);
        await loadAchievements();
      } catch (error) {
        console.error('Error deactivating achievement:', error);
      }
    }
  };

  const filtered = filter === 'ALL' ? achievements : achievements.filter(a => a.category === filter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-white/60">Loading achievements...</p>
      </div>
    );
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black uppercase tracking-wider text-white">
          Manage Achievements
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-white/60" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-all"
        >
          <Plus size={18} />
          Create Achievement
        </button>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Categories</option>
          <option value="USER">User Achievements</option>
          <option value="ARTIST">Artist Achievements</option>
          <option value="ORGANIZATION">Organization Achievements</option>
        </select>
      </div>

      {/* Achievement List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filtered.map((achievement) => (
          <motion.div
            key={achievement.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`bg-white/5 border border-white/10 rounded-lg p-4 flex items-start justify-between hover:bg-white/10 transition-colors ${
              !achievement.isActive ? 'opacity-50' : ''
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-white">{achievement.title}</h3>
                <span className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 uppercase">
                  {achievement.category}
                </span>
                {!achievement.isActive && (
                  <span className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 uppercase">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-sm text-white/60 mb-2">{achievement.description}</p>
              <div className="flex gap-4 text-xs text-white/40">
                <span>Points: +{achievement.pointsValue}</span>
                <span>Type: {achievement.triggerType}</span>
                <span>By: {achievement.createdBy}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(achievement)}
                className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleDeactivate(achievement.id)}
                className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                title="Deactivate"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {(isCreating || editing) && (
          <AchievementFormModal
            achievement={editing}
            onSave={editing ? (a) => handleUpdate(editing.id, a) : handleCreate}
            onCancel={() => {
              setIsCreating(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── FORM MODAL ───────────────────────────────────────────────────────────────

interface AchievementFormModalProps {
  achievement?: Achievement;
  onSave: (achievement: any) => void;
  onCancel: () => void;
}

const AchievementFormModal: React.FC<AchievementFormModalProps> = ({
  achievement,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState(
    achievement || {
      title: '',
      description: '',
      category: 'USER' as AchievementCategory,
      triggerType: 'CUSTOM' as AchievementTriggerType,
      icon: 'Trophy',
      pointsValue: 10,
      requirements: { type: 'CUSTOM' },
      createdBy: 'ADMIN' as const,
      isActive: true,
    }
  );

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-black/80 border border-white/20 rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-xl font-black text-white mb-4">
          {achievement ? 'Edit Achievement' : 'Create Achievement'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-white/80 mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-white/80 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 h-20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-white/80 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option>USER</option>
                <option>ARTIST</option>
                <option>ORGANIZATION</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-white/80 mb-1">Points</label>
              <input
                type="number"
                value={formData.pointsValue}
                onChange={(e) => handleChange('pointsValue', parseInt(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-white/80 mb-1">Trigger Type</label>
            <select
              value={formData.triggerType}
              onChange={(e) => handleChange('triggerType', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option>CUSTOM</option>
              <option>FIRST_PLAY</option>
              <option>FIRST_UPLOAD</option>
              <option>FIRST_FAN</option>
              <option>FIRST_LISTENER</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => handleChange('isActive', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label className="text-sm text-white/80">Active</label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors"
          >
            <Save size={16} />
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-lg transition-colors"
          >
            <X size={16} />
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
