import React, { useState } from 'react';
import { Plus, Save, X, Heart } from 'lucide-react';
import { createAchievement } from '../services/achievementService';
import { Achievement, AchievementTriggerType } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface CreatorAchievementBuilderProps {
  creatorId: string;
  creatorName: string;
  albumId?: string;
  fandomId?: string;
  onClose?: () => void;
}

export const CreatorAchievementBuilder: React.FC<CreatorAchievementBuilderProps> = ({
  creatorId,
  creatorName,
  albumId,
  fandomId,
  onClose,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    pointsValue: 25,
    icon: 'Trophy',
    backgroundColor: '#FF6B35',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      setError('Achievement title is required');
      return;
    }

    if (!formData.description.trim()) {
      setError('Achievement description is required');
      return;
    }

    try {
      const achievement: Omit<Achievement, 'id' | 'createdAt' | 'updatedAt'> = {
        title: formData.title,
        description: formData.description,
        category: 'USER',
        triggerType: 'CUSTOM',
        icon: formData.icon,
        backgroundColor: formData.backgroundColor,
        pointsValue: formData.pointsValue,
        requirements: { type: 'CUSTOM', customCondition: 'Creator-defined' },
        rewards: { pointsBonus: formData.pointsValue },
        createdBy: 'CREATOR',
        creatorId,
        albumId,
        fandomId,
        isActive: true,
      };

      await createAchievement(achievement);
      setSuccess('Achievement created! Your fans can now earn this.');
      setFormData({ title: '', description: '', pointsValue: 25, icon: 'Trophy', backgroundColor: '#FF6B35' });
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError('Failed to create achievement. Please try again.');
      console.error(err);
    }
  };

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-wider text-white mb-1">
            Create Fan Achievement
          </h2>
          <p className="text-sm text-white/60">
            Design exclusive achievements for your fans to unlock
            {albumId && ' on this album'}
            {fandomId && ' in this fandom'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-white/60" />
          </button>
        )}
      </div>

      {/* Alert Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg p-3 mb-4 text-sm"
          >
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-green-500/20 border border-green-500/40 text-green-300 rounded-lg p-3 mb-4 text-sm"
          >
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-bold text-white/80 mb-2">
            Achievement Title *
          </label>
          <input
            type="text"
            placeholder="e.g., 'True Believer' or 'Album Completionist'"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            maxLength={50}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-white/40 mt-1">{formData.title.length}/50</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-bold text-white/80 mb-2">
            Description *
          </label>
          <textarea
            placeholder="Describe what fans need to do to earn this achievement..."
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            maxLength={150}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500 h-20 resize-none"
          />
          <p className="text-xs text-white/40 mt-1">{formData.description.length}/150</p>
        </div>

        {/* Points Value */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-white/80 mb-2">
              Points Reward
            </label>
            <input
              type="number"
              value={formData.pointsValue}
              onChange={(e) => handleChange('pointsValue', Math.max(5, parseInt(e.target.value) || 5))}
              min={5}
              max={500}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-white/40 mt-1">5-500 points</p>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-bold text-white/80 mb-2">
              Badge Color
            </label>
            <input
              type="color"
              value={formData.backgroundColor}
              onChange={(e) => handleChange('backgroundColor', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg h-10 cursor-pointer"
            />
          </div>
        </div>

        {/* Icon Preview */}
        <div>
          <label className="block text-sm font-bold text-white/80 mb-2">
            Icon
          </label>
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl"
              style={{ backgroundColor: formData.backgroundColor + '40', borderColor: formData.backgroundColor, borderWidth: '1px' }}
            >
              <Heart size={24} className="text-white" />
            </div>
            <div className="text-sm text-white/60">
              <p className="font-bold mb-1">Preview</p>
              <p>Your custom achievement badge</p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-sm text-white/70">
          <p className="font-bold mb-1">💡 Tips for great achievements:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Make them meaningful but achievable for your fans</li>
            <li>Link them to specific milestones or challenges</li>
            <li>Higher point values for harder achievements</li>
            <li>Use descriptive titles that motivate engagement</li>
          </ul>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!formData.title.trim() || !formData.description.trim()}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all"
        >
          <Save size={18} />
          Create Achievement
        </button>
      </div>

      {/* Footer */}
      <p className="text-xs text-white/40 mt-4 text-center">
        Created achievements will appear on your profile and be available to your fans
      </p>
    </div>
  );
};
