// TelaLookGallery.tsx — Interactive Cinematic & Camera Look Gallery for Tela & Photos.
// 100% Native on-device: zero cloud dependencies, pure mathematical & WebGL color processing.

import React, { useState } from 'react';
import {
  Sparkles,
  Camera,
  Film,
  Sliders,
  Download,
  Check,
  RotateCcw,
  Eye,
  Layers,
  Wand2,
  X,
  Palette,
  FilmIcon
} from 'lucide-react';
import {
  CINEMATIC_LUTS,
  type CinematicLut,
  type LutCategory,
  lutToCssFilter,
  generate3dCubeText,
  getLutById
} from '../../../services/color/cinematicLutLibrary';
import type { TelaImageLayer, TelaImageAdjust } from '../../../types';

interface TelaLookGalleryProps {
  currentLayer?: TelaImageLayer | null;
  sampleImageUrl?: string;
  onApplyLut: (lut: CinematicLut, strength: number) => void;
  onClearLut?: () => void;
  onClose?: () => void;
}

const CATEGORIES: { id: 'all' | LutCategory; label: string; icon: any }[] = [
  { id: 'all', label: 'All 24+ Looks', icon: Sparkles },
  { id: 'camera_profile', label: 'Camera Profiles', icon: Camera },
  { id: 'film_stock', label: 'Film Stocks', icon: Film },
  { id: 'director_look', label: 'Director Looks', icon: Wand2 },
  { id: 'monochrome', label: 'Monochrome', icon: Sliders },
  { id: 'creative_scifi', label: 'Sci-Fi & Worlds', icon: Palette },
];

export const TelaLookGallery: React.FC<TelaLookGalleryProps> = ({
  currentLayer,
  sampleImageUrl,
  onApplyLut,
  onClearLut,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | LutCategory>('all');
  const [selectedLutId, setSelectedLutId] = useState<string | null>(
    currentLayer?.adjust?.activeLutId || 'kodak_2383_print'
  );
  const [strength, setStrength] = useState<number>(
    currentLayer?.adjust?.lutStrength !== undefined ? currentLayer.adjust.lutStrength : 1.0
  );
  const [copiedCubeId, setCopiedCubeId] = useState<string | null>(null);

  const previewSrc =
    sampleImageUrl ||
    currentLayer?.src ||
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80';

  const filteredLuts = CINEMATIC_LUTS.filter(
    (lut) => activeCategory === 'all' || lut.category === activeCategory
  );

  const selectedLut = selectedLutId ? getLutById(selectedLutId) : null;

  const handleSelectLut = (lut: CinematicLut) => {
    setSelectedLutId(lut.id);
    onApplyLut(lut, strength);
  };

  const handleStrengthChange = (newStrength: number) => {
    setStrength(newStrength);
    if (selectedLut) {
      onApplyLut(selectedLut, newStrength);
    }
  };

  const handleDownloadCube = (e: React.MouseEvent, lut: CinematicLut) => {
    e.stopPropagation();
    const cubeText = generate3dCubeText(lut, 17);
    const blob = new Blob([cubeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lut.id}_3d_lut.cube`;
    link.click();
    URL.revokeObjectURL(url);

    setCopiedCubeId(lut.id);
    setTimeout(() => setCopiedCubeId(null), 2500);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f1115',
        color: '#e2e8f0',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: '#16181f',
          borderBottom: '1px solid #232732',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #0ea5e9, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Film size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
              Cinematic Looks & 3D LUT Gallery
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>
              Hollywood Film Stocks · ARRI / RED / Venice Log Profiles · Procedural .cube
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onClearLut && (
            <button
              onClick={() => {
                setSelectedLutId(null);
                onClearLut();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                color: '#94a3b8',
                backgroundColor: '#1e222b',
                border: '1px solid #2d3342',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
              title="Reset layer to neutral colors"
            >
              <RotateCcw size={12} />
              <span>Neutral / Clear</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Layout: Master Preview & Dial Header */}
      {selectedLut && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#12141a',
            borderBottom: '1px solid #1f232b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #333a48',
                flexShrink: 0,
              }}
            >
              <img
                src={previewSrc}
                alt="Selected LUT Preview"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: lutToCssFilter(selectedLut, strength),
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                  {selectedLut.name}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    color: selectedLut.accentColor,
                    border: `1px solid ${selectedLut.accentColor}33`,
                  }}
                >
                  {selectedLut.categoryLabel}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                {selectedLut.description}
              </p>
            </div>
          </div>

          {/* Strength Slider & Export Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            <div style={{ width: '150px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: '#94a3b8',
                  marginBottom: '2px',
                }}
              >
                <span>Look Intensity</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{Math.round(strength * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(strength * 100)}
                onChange={(e) => handleStrengthChange(Number(e.target.value) / 100)}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>

            <button
              onClick={(e) => handleDownloadCube(e, selectedLut)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: copiedCubeId === selectedLut.id ? '#059669' : '#2563eb',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              title="Download 3D .cube file for DaVinci Resolve, Premiere Pro & Photoshop"
            >
              {copiedCubeId === selectedLut.id ? <Check size={13} /> : <Download size={13} />}
              <span>{copiedCubeId === selectedLut.id ? 'Exported!' : 'Export .CUBE'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '8px 16px',
          backgroundColor: '#111317',
          borderBottom: '1px solid #1e222a',
          overflowX: 'auto',
        }}
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                border: isActive ? '1px solid #38bdf8' : '1px solid #232834',
                backgroundColor: isActive ? 'rgba(56, 189, 248, 0.15)' : '#181b22',
                color: isActive ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={12} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* LUT Cards Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: '12px',
        }}
      >
        {filteredLuts.map((lut) => {
          const isSelected = selectedLutId === lut.id;
          const cssFilter = lutToCssFilter(lut, strength);

          return (
            <div
              key={lut.id}
              onClick={() => handleSelectLut(lut)}
              style={{
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#15171e',
                border: isSelected ? '2px solid #38bdf8' : '1px solid #262a36',
                boxShadow: isSelected ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.18s ease-in-out',
              }}
            >
              {/* Thumbnail Container */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '110px',
                  overflow: 'hidden',
                  backgroundColor: '#0a0b0e',
                }}
              >
                <img
                  src={previewSrc}
                  alt={lut.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: cssFilter,
                    transition: 'transform 0.4s',
                  }}
                  loading="lazy"
                />

                {/* Accent Color Band */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    backgroundColor: lut.accentColor,
                  }}
                />

                {/* Category Pill */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    fontSize: '9px',
                    fontWeight: 700,
                    backgroundColor: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(4px)',
                    color: '#e2e8f0',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {lut.categoryLabel}
                </div>

                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                  >
                    <Check size={12} color="#000" strokeWidth={3} />
                  </div>
                )}
              </div>

              {/* Card Meta */}
              <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                <div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: isSelected ? '#38bdf8' : '#f1f5f9',
                      marginBottom: '4px',
                      lineHeight: 1.25,
                    }}
                  >
                    {lut.name}
                  </div>
                  <p
                    style={{
                      fontSize: '10px',
                      color: '#94a3b8',
                      margin: 0,
                      lineHeight: 1.35,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {lut.description}
                  </p>
                </div>

                {/* Bottom Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                    paddingTop: '6px',
                    borderTop: '1px solid #1f232c',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: isSelected ? '#38bdf8' : '#64748b',
                    }}
                  >
                    {isSelected ? 'Applied to Layer' : 'Click to Apply'}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => handleDownloadCube(e, lut)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '3px 6px',
                      fontSize: '9px',
                      fontWeight: 600,
                      backgroundColor: '#1f2430',
                      border: '1px solid #2d3444',
                      borderRadius: '4px',
                      color: copiedCubeId === lut.id ? '#34d399' : '#cbd5e1',
                      cursor: 'pointer',
                    }}
                    title="Export .cube"
                  >
                    {copiedCubeId === lut.id ? <Check size={10} /> : <Download size={10} />}
                    <span>.cube</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
