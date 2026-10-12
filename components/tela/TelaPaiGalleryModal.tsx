// TelaPaiGalleryModal.tsx — Chronological PAI Generations gallery accessible directly in Tela documents.
// Allows placing past generations as new frames, adding as layers to active image devices, or reopening in studio.

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  History,
  Search,
  Heart,
  PlusCircle,
  Layers,
  Wand2,
  Download,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import {
  getPaiGenerations,
  subscribePaiGenerations,
  deletePaiGeneration,
  toggleFavoritePaiGeneration,
  type PaiGenerationItem
} from '../../services/localAi/paiGenerationHistory';

export interface TelaPaiGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertFrame: (item: PaiGenerationItem) => void;
  onAddLayer?: (item: PaiGenerationItem) => void;
  onOpenInStudio?: (item: PaiGenerationItem) => void;
  isImageDeviceActive?: boolean;
}

export const TelaPaiGalleryModal: React.FC<TelaPaiGalleryModalProps> = ({
  isOpen,
  onClose,
  onInsertFrame,
  onAddLayer,
  onOpenInStudio,
  isImageDeviceActive = false,
}) => {
  const [items, setItems] = useState<PaiGenerationItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [selectedItem, setSelectedItem] = useState<PaiGenerationItem | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribePaiGenerations(setItems);
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = items.filter((item) => {
    if (filter === 'favorites' && !item.favorite) return false;
    if (query && !item.prompt.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '1150px',
          height: '840px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          backgroundColor: '#121418',
          border: '1px solid #282b33',
          borderRadius: '16px',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e2e8f0',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 22px',
            backgroundColor: '#181b22',
            borderBottom: '1px solid #282b33',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #00DAF3, #6B0099)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(0, 218, 243, 0.3)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  PAI Generations Gallery
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: '#232730',
                    color: '#38bdf8',
                    padding: '2px 8px',
                    borderRadius: '10px',
                  }}
                >
                  {items.length} generations
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>
                Your local AI creations on NVIDIA GPU · Non-destructive insert into Tela canvas & layers
              </p>
            </div>
          </div>

          {/* Controls & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                color="#64748b"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search generations…"
                style={{
                  padding: '7px 12px 7px 32px',
                  backgroundColor: '#111317',
                  border: '1px solid #282b33',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  width: '210px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Filter Toggle */}
            <div
              style={{
                display: 'flex',
                backgroundColor: '#111317',
                borderRadius: '6px',
                padding: '2px',
                border: '1px solid #282b33',
              }}
            >
              <button
                onClick={() => setFilter('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: filter === 'all' ? '#00DAF3' : 'transparent',
                  color: filter === 'all' ? '#000' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              <button
                onClick={() => setFilter('favorites')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: filter === 'favorites' ? '#00DAF3' : 'transparent',
                  color: filter === 'favorites' ? '#000' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Heart size={12} fill={filter === 'favorites' ? '#000' : 'none'} />
                <span>Favorites</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Gallery Content Area */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '100px 20px', color: '#64748b' }}>
              <History size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8' }}>
                {items.length === 0 ? 'No PAI generations yet' : 'No matching creations found'}
              </div>
              <div style={{ fontSize: '13px', maxWidth: '380px', margin: '8px auto 20px' }}>
                {items.length === 0
                  ? 'Render images in Local Creative Studio or Comic Studio, and they will automatically populate here for quick access in your documents.'
                  : 'Try typing different keywords or clearing your favorites filter.'}
              </div>
              {items.length === 0 && onOpenInStudio && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenInStudio({} as any);
                  }}
                  style={{
                    padding: '9px 18px',
                    backgroundColor: '#f59e0b',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Wand2 size={15} />
                  <span>Open Local Creative Studio</span>
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                gap: '20px',
              }}
            >
              {filtered.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const dateStr = new Date(item.timestamp).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(isSelected ? null : item)}
                    style={{
                      backgroundColor: '#16181d',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #00DAF3' : '1px solid #282b33',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 20px rgba(0,218,243,0.2)' : 'none',
                    }}
                  >
                    {/* Thumbnail View */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        paddingTop: '65%',
                        backgroundColor: '#0a0b0d',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={item.url}
                        alt={item.prompt}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />

                      {/* Model & Favorite Badges */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: '8px',
                          right: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            backgroundColor: 'rgba(0,0,0,0.75)',
                            color: '#38bdf8',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          {item.modelId.includes('turbo')
                            ? 'SDXL Turbo'
                            : item.modelId.includes('animagine')
                            ? 'Animagine XL'
                            : 'SDXL'}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleFavoritePaiGeneration(item.id);
                          }}
                          style={{
                            border: 'none',
                            background: 'rgba(0,0,0,0.65)',
                            borderRadius: '50%',
                            width: '26px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          <Heart
                            size={13}
                            color={item.favorite ? '#ef4444' : '#cbd5e1'}
                            fill={item.favorite ? '#ef4444' : 'none'}
                          />
                        </button>
                      </div>

                      {/* Dimension Pill */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          fontSize: '10px',
                          backgroundColor: 'rgba(0,0,0,0.75)',
                          color: '#94a3b8',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        {item.aspect || `${item.width}×${item.height}`}
                      </div>
                    </div>

                    {/* Metadata Body */}
                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '10px',
                          color: '#64748b',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} />
                          <span>{dateStr}</span>
                        </div>
                        {item.syncedToPhotos && (
                          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle2 size={11} /> Photos Synced
                          </span>
                        )}
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontSize: '12px',
                          color: '#f1f5f9',
                          lineHeight: '1.45',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {item.prompt}
                      </p>

                      {/* Actions */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          marginTop: 'auto',
                          paddingTop: '10px',
                          borderTop: '1px solid #232730',
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInsertFrame(item);
                            onClose();
                          }}
                          title="Insert onto Tela canvas as a new image frame"
                          style={{
                            flex: 1,
                            padding: '7px 10px',
                            backgroundColor: '#2563eb',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <PlusCircle size={13} />
                          <span>Insert Frame</span>
                        </button>

                        {isImageDeviceActive && onAddLayer && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddLayer(item);
                              onClose();
                            }}
                            title="Add as non-destructive layer to currently selected image"
                            style={{
                              padding: '7px 10px',
                              backgroundColor: '#7c3aed',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Layers size={13} />
                            <span>Layer</span>
                          </button>
                        )}

                        {onOpenInStudio && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose();
                              onOpenInStudio(item);
                            }}
                            title="Open in Local Creative Studio to relight or enhance"
                            style={{
                              padding: '7px 8px',
                              backgroundColor: '#232730',
                              border: '1px solid #3b3f4a',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            <Wand2 size={13} />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const a = document.createElement('a');
                            a.href = item.url;
                            a.download = `pai_${item.id}.png`;
                            a.click();
                          }}
                          title="Download PNG to PC"
                          style={{
                            padding: '7px 8px',
                            backgroundColor: '#232730',
                            border: '1px solid #3b3f4a',
                            borderRadius: '6px',
                            color: '#cbd5e1',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          <Download size={13} />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void deletePaiGeneration(item.id);
                          }}
                          title="Delete generation"
                          style={{
                            padding: '7px 8px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ef4444',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelaPaiGalleryModal;
