/**
 * components/Fabula/anima/AnimaMediaCompositor.tsx
 *
 * Media Ingestion & Effect Compositing Layer for Anima
 * Allows users to import still generated images (Midjourney, Flux, Imagen)
 * or generated video plates (Runway, Kling, Sora) and composite living motion on top:
 * - 2.5D Parallax & Breathing
 * - Atmospheric weather (rain, embers, fireflies, snow)
 * - Hair & strand physics pinned to the artwork
 * - Navier-Stokes fluid energy smoke
 * - Comic speech balloons & manga speed lines
 * - Interactive Storybook tap-to-bloom zones
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, Image as ImageIcon, Video, Sparkles, Wind,
  Flame, Droplets, MessageSquare, Zap, Eye, Sliders,
  RefreshCw, Layers, Check, Play, Pause
} from 'lucide-react';
import type { CreativeMedium } from '../../../services/anima/ariaMotionAgent';

export interface ImportedMediaPlate {
  id: string;
  type: 'image' | 'video';
  url: string;
  name: string;
  width: number;
  height: number;
}

interface Props {
  medium: CreativeMedium;
  activePlate: ImportedMediaPlate | null;
  onSelectPlate: (plate: ImportedMediaPlate) => void;
  onApplyCompositingEffect: (effectType: string, options?: any) => void;
}

const SAMPLE_GENERATED_PLATES: ImportedMediaPlate[] = [
  {
    id: 'sample_mj_01',
    type: 'image',
    name: 'Midjourney · Cyberpunk Wanderer',
    url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80',
    width: 1280,
    height: 720,
  },
  {
    id: 'sample_flux_02',
    type: 'image',
    name: 'Flux · Storybook Enchanted Forest',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&q=80',
    width: 1280,
    height: 720,
  },
  {
    id: 'sample_manga_03',
    type: 'image',
    name: 'Anime · Shonen Rooftop Duel',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1280&q=80',
    width: 1280,
    height: 720,
  },
];

export const AnimaMediaCompositor: React.FC<Props> = ({
  medium,
  activePlate,
  onSelectPlate,
  onApplyCompositingEffect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    const url = URL.createObjectURL(file);
    const newPlate: ImportedMediaPlate = {
      id: `plate_${Date.now()}`,
      type: isVideo ? 'video' : 'image',
      url,
      name: file.name,
      width: 1280,
      height: 720,
    };
    onSelectPlate(newPlate);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '12px 14px',
      backgroundColor: 'rgba(25, 23, 33, 0.95)',
      borderRadius: 10,
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      {/* 1. Header & Import Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#D0BCFF', letterSpacing: '0.06em' }}>
          <Layers size={14} />
          MEDIA PLATE & EFFECT COMPOSITOR
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 6,
            background: 'linear-gradient(135deg, #6B0099, #D40055)',
            border: 'none',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Upload size={12} />
          IMPORT STILL / VIDEO
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>

      {/* 2. Sample Presets Carousel / Quick Ingestion */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {SAMPLE_GENERATED_PLATES.map((plate) => (
          <div
            key={plate.id}
            onClick={() => onSelectPlate(plate)}
            style={{
              flex: 'none',
              width: 140,
              borderRadius: 6,
              overflow: 'hidden',
              border: `2px solid ${activePlate?.id === plate.id ? '#00DAF3' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
              position: 'relative',
              background: '#000',
            }}
          >
            <img src={plate.url} alt={plate.name} style={{ width: '100%', height: 78, objectFit: 'cover' }} />
            <div style={{
              padding: '4px 6px',
              fontSize: 9,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              backgroundColor: 'rgba(15, 14, 19, 0.9)',
            }}>
              {plate.name}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Quick "Bring to Life" Compositing Actions */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
          QUICK COMPOSITING ACTIONS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { id: 'weather_rain', label: 'Rain Atmosphere', icon: Droplets, color: '#00DAF3' },
            { id: 'fireflies', label: 'Floating Fireflies', icon: Sparkles, color: '#FFD700' },
            { id: 'camera_drift', label: '2.5D Parallax Drift', icon: Eye, color: '#D0BCFF' },
            { id: 'hair_flutter', label: 'Hair Wind Flutter', icon: Wind, color: '#00DAF3' },
            { id: 'fluid_aura', label: 'Fluid Magic Smoke', icon: Zap, color: '#D40055' },
            { id: 'speed_lines', label: 'Manga Speed Lines', icon: Flame, color: '#FF8C00' },
          ].map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => onApplyCompositingEffect(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Icon size={12} color={color} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
