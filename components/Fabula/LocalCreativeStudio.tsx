// LocalCreativeStudio.tsx — Plajah's local creative studio for Fabula and Tela.
// Delivers high-end cinematic stills, 3D relighting, and micro-texture enhancement natively on-device.
// 100% Native Plajah Platform: zero external vendor dependencies.

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Sun,
  Maximize2,
  Film,
  Layers,
  Wand2,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  Sliders,
  Image as ImageIcon,
  Download,
  PlusCircle,
  HardDrive,
  Folder,
  FolderOpen
} from 'lucide-react';
import { getLocalEngineStatus, LocalEngineStatus } from '../../services/localAi/localEngineDiscovery';
import { executeCreativeStudioTask } from '../../services/localAi/creativeStudioBridge';
import {
  RECOMMENDED_MODELS,
  auditInstalledModels,
  installModel,
  ModelPackage,
  getModelStorageInfo,
  pickModelStorageDirectory,
  setModelStorageDirectory,
  ModelStorageInfo,
} from '../../services/localAi/localModelInstaller';

interface LocalCreativeStudioProps {
  initialImage?: string;
  onSendToTimeline?: (url: string) => void;
  onSendToTela?: (url: string) => void;
  onClose?: () => void;
}

export const LocalCreativeStudio: React.FC<LocalCreativeStudioProps> = ({
  initialImage,
  onSendToTimeline,
  onSendToTela,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'cinema' | 'enhance' | 'relight' | 'video' | 'models'>('cinema');
  const [status, setStatus] = useState<LocalEngineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Inputs
  const [prompt, setPrompt] = useState('');
  const [sourceImage, setSourceImage] = useState<string | null>(initialImage || null);
  const [aspect, setAspect] = useState<'16:9' | '2.39:1' | '1:1' | '9:16'>('16:9');
  const [lens, setLens] = useState<'anamorphic' | '35mm' | '50mm' | '85mm'>('anamorphic');
  const [lighting, setLighting] = useState<'chiaroscuro' | 'golden_hour' | 'neon_noir' | 'dramatic_rim'>('chiaroscuro');

  // Detail Enhancer Dials
  const [hallucination, setHallucination] = useState(45);
  const [resemblance, setResemblance] = useState(75);
  const [enginePreset, setEnginePreset] = useState<'cinematic' | 'photoreal' | 'comic_ink' | 'storybook'>('cinematic');

  // Relight Dials
  const [azimuth, setAzimuth] = useState(45);
  const [elevation, setElevation] = useState(30);
  const [lightColor, setLightColor] = useState('#fff2df');
  const [intensity, setIntensity] = useState(1.0);

  // Output
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [metaNote, setMetaNote] = useState<string | null>(null);

  // Storage Location & Drive Management
  const [storageInfo, setStorageInfo] = useState<ModelStorageInfo | null>(null);
  const [customPathInput, setCustomPathInput] = useState('');
  const [isEditingPath, setIsEditingPath] = useState(false);

  useEffect(() => {
    getLocalEngineStatus().then(setStatus);
    auditInstalledModels().then(setInstalledMap);
    getModelStorageInfo().then((info) => {
      setStorageInfo(info);
      setCustomPathInput(info.path);
    });
  }, []);

  const handlePickStorageFolder = async () => {
    const updated = await pickModelStorageDirectory();
    if (updated) {
      setStorageInfo(updated);
      setCustomPathInput(updated.path);
      auditInstalledModels().then(setInstalledMap);
    }
  };

  const handleSaveCustomPath = async () => {
    if (!customPathInput.trim()) return;
    const updated = await setModelStorageDirectory(customPathInput.trim());
    setStorageInfo(updated);
    setIsEditingPath(false);
    auditInstalledModels().then(setInstalledMap);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setProgressPct(10);
    setProgressMsg('Initiating local engine…');

    try {
      let op: any = 'cinema_generate';
      if (activeTab === 'enhance') op = 'detail_enhance';
      if (activeTab === 'relight') op = 'relight_scene';

      const res = await executeCreativeStudioTask(
        {
          op,
          prompt,
          sourceImageUrl: sourceImage || undefined,
          aspect,
          lens,
          lighting,
          hallucinationLevel: hallucination,
          resemblance,
          engine: enginePreset,
          lightAzimuth: azimuth,
          lightElevation: elevation,
          lightColorHex: lightColor,
          lightIntensity: intensity,
        },
        (p) => {
          setProgressPct(p.percent);
          setProgressMsg(p.status);
        }
      );

      if (res.outputUrls.length > 0) {
        setOutputUrl(res.outputUrls[0]);
        setMetaNote(res.note || 'Generation finished.');
      } else if (res.error) {
        setMetaNote(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setMetaNote(`Execution failed: ${err.message}`);
    } finally {
      setLoading(false);
      setProgressPct(100);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#121316',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Top Header & Engine Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        backgroundColor: '#181a1f',
        borderBottom: '1px solid #282b33',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wand2 size={20} color="#f59e0b" />
          <span style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '-0.2px' }}>
            Plajah Local Creative Studio
          </span>
          <span style={{
            fontSize: '11px',
            backgroundColor: '#232730',
            padding: '2px 8px',
            borderRadius: '12px',
            color: '#94a3b8',
          }}>
            ComfyUI Engine · Directorial Intent
          </span>
        </div>

        {/* Local Hardware Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '6px',
            backgroundColor: status?.online ? '#064e3b' : '#334155',
            color: status?.online ? '#6ee7b7' : '#94a3b8',
          }}>
            <Cpu size={14} />
            <span>{status?.device?.name || 'Probing Local Hardware…'}</span>
            {status?.device?.vramTotalMb && (
              <span style={{ opacity: 0.8 }}>({Math.round(status.device.vramTotalMb / 1024)}GB VRAM)</span>
            )}
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              backgroundColor: '#047857',
              color: '#fff',
              padding: '1px 5px',
              borderRadius: '4px',
              marginLeft: '4px',
            }}>
              100% FREE / 0 CREDITS
            </span>
          </div>

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
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left Control Column */}
        <div style={{
          width: '380px',
          borderRight: '1px solid #282b33',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#14161a',
        }}>
          {/* Mode Switcher */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '2px',
            padding: '8px',
            backgroundColor: '#1b1d22',
            borderBottom: '1px solid #282b33',
          }}>
            {[
              { id: 'cinema', label: 'Cinema Stills', icon: Film },
              { id: 'enhance', label: 'Detail Enhancer', icon: Maximize2 },
              { id: 'relight', label: '3D Relight', icon: Sun },
              { id: 'video', label: 'Cinema Motion', icon: Sparkles },
              { id: 'models', label: 'Models & Setup', icon: HardDrive },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 2px',
                    fontSize: '9px',
                    fontWeight: 500,
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: isActive ? '#f59e0b' : 'transparent',
                    color: isActive ? '#000' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center',
                  }}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Directorial Controls Scroll Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeTab !== 'models' && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                  Creative Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    activeTab === 'cinema' ? 'Describe the cinematic scene in natural language…' :
                    activeTab === 'enhance' ? 'Describe fine textures, materials, and micro-details to hallucinate…' :
                    activeTab === 'relight' ? 'Atmospheric lighting mood (e.g. wet rain, cyberpunk dusk)…' :
                    'Describe camera and subject motion…'
                  }
                  style={{
                    width: '100%',
                    height: '74px',
                    backgroundColor: '#0f1013',
                    border: '1px solid #2d3139',
                    borderRadius: '6px',
                    padding: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    resize: 'none',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* TAB: Cinema Dials */}
            {activeTab === 'cinema' && (
              <>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Frame Aspect</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {(['16:9', '2.39:1', '1:1', '9:16'] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => setAspect(a)}
                        style={{
                          padding: '6px',
                          fontSize: '11px',
                          borderRadius: '4px',
                          border: aspect === a ? '1px solid #f59e0b' : '1px solid #282b33',
                          backgroundColor: aspect === a ? '#261f10' : '#1a1c22',
                          color: aspect === a ? '#f59e0b' : '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Cinematic Lens</label>
                  <select
                    value={lens}
                    onChange={(e) => setLens(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#1a1c22',
                      border: '1px solid #282b33',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  >
                    <option value="anamorphic">Panavision Anamorphic (Cinematic Flares & Oval Bokeh)</option>
                    <option value="35mm">35mm Classic Prime (Organic Grain & Depth)</option>
                    <option value="50mm">50mm Standard Human Eye</option>
                    <option value="85mm">85mm Portrait (Creamy Shallow Depth)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Lighting Style</label>
                  <select
                    value={lighting}
                    onChange={(e) => setLighting(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#1a1c22',
                      border: '1px solid #282b33',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  >
                    <option value="chiaroscuro">Chiaroscuro (Rich Contrast, High Drama)</option>
                    <option value="golden_hour">Golden Hour (Warm Soft Backlight)</option>
                    <option value="neon_noir">Neon Noir (Cyan/Magenta Cyberpunk)</option>
                    <option value="dramatic_rim">Dramatic Rim Light (Edge Separation)</option>
                  </select>
                </div>
              </>
            )}

            {/* TAB: Detail Enhancer Dials */}
            {activeTab === 'enhance' && (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ color: '#94a3b8' }}>Detail Injection & Hallucination</span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{hallucination}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={hallucination}
                    onChange={(e) => setHallucination(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b' }}
                  />
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Low = faithful cleanup  ·  High = generates pores, weave, micro-textures
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ color: '#94a3b8' }}>Resemblance (Fidelity to Original)</span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{resemblance}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={resemblance}
                    onChange={(e) => setResemblance(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Style Engine</label>
                  <select
                    value={enginePreset}
                    onChange={(e) => setEnginePreset(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#1a1c22',
                      border: '1px solid #282b33',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  >
                    <option value="cinematic">Cinematic Film (Pores, Fabric, 35mm Grain)</option>
                    <option value="photoreal">Ultra Photorealism (Macro Nature & Architecture)</option>
                    <option value="comic_ink">Graphic Novel & Comic (Crisp Inking Lines)</option>
                    <option value="storybook">Storybook Illustration (Gouache & Paper Texture)</option>
                  </select>
                </div>
              </>
            )}

            {/* TAB: 3D Relight Dials */}
            {activeTab === 'relight' && (
              <>
                <div style={{
                  padding: '12px',
                  backgroundColor: '#1b1d22',
                  borderRadius: '6px',
                  border: '1px solid #282b33',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                    3D Spherical Light Position
                  </div>
                  {/* Virtual Light Angle Controller */}
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 50% 50%, #2a2e39 0%, #101216 100%)',
                    margin: '0 auto',
                    position: 'relative',
                    border: '1px solid #3d4352',
                  }}>
                    {/* The light bead */}
                    <div style={{
                      position: 'absolute',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: lightColor,
                      boxShadow: `0 0 10px ${lightColor}`,
                      top: `${50 - (elevation / 90) * 40}%`,
                      left: `${50 + (azimuth / 180) * 40}%`,
                      transform: 'translate(-50%, -50%)',
                    }} />
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '8px' }}>
                    Azimuth: {azimuth}° · Elevation: {elevation}°
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ color: '#94a3b8' }}>Horizontal Angle (Azimuth)</span>
                    <span style={{ color: '#f59e0b' }}>{azimuth}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={azimuth}
                    onChange={(e) => setAzimuth(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ color: '#94a3b8' }}>Vertical Angle (Elevation)</span>
                    <span style={{ color: '#f59e0b' }}>{elevation}°</span>
                  </div>
                  <input
                    type="range"
                    min="-90"
                    max="90"
                    value={elevation}
                    onChange={(e) => setElevation(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b' }}
                  />
                </div>
              </>
            )}

            {/* TAB: Models Info in Left Rail */}
            {activeTab === 'models' && (
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 10px 0' }}>
                  Manage the open-source neural weights installed on your computer.
                </p>
                <p style={{ margin: '0 0 10px 0' }}>
                  Once weights are downloaded into your ComfyUI or sidecar directory, they run offline with zero internet access required.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Execution Action */}
          {activeTab !== 'models' && (
            <div style={{ padding: '14px', backgroundColor: '#181a1f', borderTop: '1px solid #282b33' }}>
              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: loading ? '#475569' : '#f59e0b',
                  color: '#000',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {loading ? (
                  <>
                    <RotateCw size={16} className="animate-spin" />
                    <span>{progressMsg || 'Running on GPU…'}</span>
                  </>
                ) : (
                  <>
                    <Play size={16} fill="#000" />
                    <span>Generate Free Locally</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Preview & Canvas Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0b0d',
          position: 'relative',
        }}>
          {/* Models & Setup Management Dashboard */}
          {activeTab === 'models' ? (
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 6px 0' }}>
                  Local Open-Source Model Weights
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  Quantized weights running 100% locally on your discrete GPU. Zero cloud bills, complete privacy, unlimited runs.
                </p>
              </div>

              {/* Hardware Profile Card */}
              <div style={{
                padding: '14px 18px',
                backgroundColor: '#16181d',
                borderRadius: '8px',
                border: '1px solid #282b33',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Cpu size={28} color="#10b981" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>
                      {status?.device?.name || 'Local Discrete GPU'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Backend: {status?.backend || 'offline'} · Available VRAM: {status?.device?.vramTotalMb ? `${Math.round(status.device.vramTotalMb / 1024)}GB` : 'Probing…'}
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: status?.online ? '#064e3b' : '#334155',
                  color: status?.online ? '#6ee7b7' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 600,
                }}>
                  {status?.online ? 'Engine Connected' : 'Engine Offline'}
                </div>
              </div>

              {/* Dedicated Drive & Storage Location Card */}
              <div style={{
                padding: '16px 18px',
                backgroundColor: '#16181d',
                borderRadius: '8px',
                border: '1px solid #282b33',
                marginBottom: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <HardDrive size={26} color={storageInfo?.isCustomDrive ? '#38bdf8' : '#a855f7'} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Model Storage Drive</span>
                        {storageInfo?.isCustomDrive && (
                          <span style={{ fontSize: '10px', backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px' }}>
                            Dedicated Drive
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Store models on secondary NVMe/SSD drives to avoid filling your system drive.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handlePickStorageFolder}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FolderOpen size={13} />
                      <span>Change Drive / Folder</span>
                    </button>

                    <button
                      onClick={() => setIsEditingPath(!isEditingPath)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#262930',
                        color: '#cbd5e1',
                        border: '1px solid #3b3f4a',
                        borderRadius: '6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {isEditingPath ? 'Cancel' : 'Edit Path'}
                    </button>
                  </div>
                </div>

                {/* Path display or edit field */}
                {isEditingPath ? (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="text"
                      value={customPathInput}
                      onChange={(e) => setCustomPathInput(e.target.value)}
                      placeholder="e.g. D:\PlajahModels or E:\AI_Models"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        backgroundColor: '#0f1115',
                        border: '1px solid #38bdf8',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                    <button
                      onClick={handleSaveCustomPath}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Save Path
                    </button>
                  </div>
                ) : (
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: '#0e1014',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#cbd5e1',
                    marginBottom: '10px',
                    wordBreak: 'break-all',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <Folder size={14} color="#64748b" />
                    <span>{storageInfo?.path || 'Detecting storage path…'}</span>
                  </div>
                )}

                {/* Storage space bar */}
                {storageInfo && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                      <span>Drive Space ({storageInfo.driveName})</span>
                      <span style={{ color: storageInfo.freeSpaceGb < 25 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                        {storageInfo.freeSpaceGb} GB free of {storageInfo.totalSpaceGb} GB
                      </span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#262930', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(5, Math.round(((storageInfo.totalSpaceGb - storageInfo.freeSpaceGb) / storageInfo.totalSpaceGb) * 100)))}%`,
                          backgroundColor: storageInfo.freeSpaceGb < 25 ? '#ef4444' : storageInfo.freeSpaceGb < 50 ? '#f59e0b' : '#10b981',
                          borderRadius: '3px',
                        }}
                      />
                    </div>

                    {storageInfo.freeSpaceGb < 25 && (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#fca5a5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <AlertCircle size={14} />
                        <span>Low disk space on current drive. Click <b>Change Drive / Folder</b> to store models on a secondary SSD/NVMe drive.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Models List */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {RECOMMENDED_MODELS.map((pkg) => {
                  const isInstalled = !!installedMap[pkg.id];
                  const isInstalling = installingId === pkg.id;

                  return (
                    <div
                      key={pkg.id}
                      style={{
                        padding: '14px',
                        backgroundColor: '#14161a',
                        borderRadius: '8px',
                        border: isInstalled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #282b33',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: '#f1f5f9' }}>{pkg.name}</span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: isInstalled ? '#064e3b' : '#262930',
                            color: isInstalled ? '#6ee7b7' : '#94a3b8',
                          }}>
                            {isInstalled ? 'Installed' : `${pkg.sizeGb} GB`}
                          </span>
                        </div>

                        <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 500, marginBottom: '6px' }}>
                          {pkg.recommendedRole}
                        </div>

                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                          {pkg.description}
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #22262e' }}>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          Req: {pkg.vramRequiredGb}GB VRAM
                        </span>

                        <button
                          onClick={async () => {
                            setInstallingId(pkg.id);
                            await installModel(pkg);
                            setInstallingId(null);
                            const updated = await auditInstalledModels();
                            setInstalledMap(updated);
                          }}
                          disabled={isInstalled || isInstalling}
                          style={{
                            padding: '5px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: isInstalled ? '#1e293b' : isInstalling ? '#475569' : '#2563eb',
                            color: isInstalled ? '#64748b' : '#fff',
                            cursor: isInstalled || isInstalling ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isInstalled ? (
                            <>
                              <CheckCircle2 size={12} color="#10b981" />
                              <span>Ready</span>
                            </>
                          ) : isInstalling ? (
                            <>
                              <RotateCw size={12} className="animate-spin" />
                              <span>Downloading…</span>
                            </>
                          ) : (
                            <>
                              <Download size={12} />
                              <span>Install Weights</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              position: 'relative',
            }}>
              {outputUrl ? (
                <img
                  src={outputUrl}
                  alt="Rendered output"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: '4px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
                  }}
                />
              ) : sourceImage ? (
                <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
                  <img
                    src={sourceImage}
                    alt="Source reference"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: '4px',
                      opacity: 0.7,
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '12px',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}>
                    Source Image Loaded
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#475569' }}>
                  <ImageIcon size={48} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8' }}>No Active Render</div>
                  <div style={{ fontSize: '12px', maxWidth: '300px', margin: '4px auto 0' }}>
                    Choose your directorial settings on the left and hit Generate to render on your local discrete GPU.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Destination Bar (Timeline & Tela export) */}
          {outputUrl && activeTab !== 'models' && (
            <div style={{
              padding: '12px 18px',
              backgroundColor: '#14161a',
              borderTop: '1px solid #282b33',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} />
                <span>{metaNote || 'Ready'}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {onSendToTimeline && (
                  <button
                    onClick={() => onSendToTimeline(outputUrl)}
                    style={{
                      padding: '7px 12px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <PlusCircle size={14} />
                    <span>Drop into Fabula Timeline</span>
                  </button>
                )}

                {onSendToTela && (
                  <button
                    onClick={() => onSendToTela(outputUrl)}
                    style={{
                      padding: '7px 12px',
                      backgroundColor: '#7c3aed',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Layers size={14} />
                    <span>Place in Tela Canvas</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
