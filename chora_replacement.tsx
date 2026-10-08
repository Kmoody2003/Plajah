{/* TAB 4: CHORA (All Artists, Albums, Personal Music Locker, Playlists & DJ) */}
        {/* ========================================================================= */}
        {activeTab === 'chora' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Sidebar: Subcategories & Audio Playlists */}
            <div className="w-56 border-r p-2 flex flex-col gap-1 flex-none overflow-y-auto" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Chora Catalog</div>
              {[
                { id: 'all', label: 'All Chora Music' },
                { id: 'Artists & Albums', label: 'Artists & Albums' },
                { id: 'Personal Music Locker', label: 'Personal Locker' },
                { id: 'Audius', label: 'Audius' },
                { id: 'Audio Playlists', label: 'Audio Playlists' },
                { id: 'Worship Anthems', label: 'Worship Anthems' },
                { id: 'Anthems & Hymns', label: 'Anthems & Hymns' },
                { id: 'Ambient Pads (12 Keys)', label: 'Ambient Pads (12 Keys)' },
                { id: 'Multitrack Stems', label: 'Multitrack Stems' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedSubcat(cat.id);
                    if (cat.id !== 'Audio Playlists') setSelectedPlaylistId(null);
                    setExpandedAlbumId(null);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat.id ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              {/* Audio Playlists List & Creator */}
              <div className="mt-3 pt-2 border-t border-white/10 flex flex-col gap-1">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Playlists</span>
                  <button
                    onClick={() => setIsNewAudioPlaylistModalOpen(true)}
                    className="p-1 rounded bg-[#D0BCFF]/15 hover:bg-[#D0BCFF]/25 text-[#D0BCFF] transition-all"
                    title="Create new audio playlist"
                  >
                    <Plus size={11} />
                  </button>
                </div>
                {audioPlaylists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      setSelectedSubcat('Audio Playlists');
                      setSelectedPlaylistId(pl.id);
                      setExpandedAlbumId(null);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md text-[10.5px] truncate transition-all flex items-center justify-between ${
                      selectedPlaylistId === pl.id && selectedSubcat === 'Audio Playlists'
                        ? 'bg-[#D0BCFF]/20 text-[#D0BCFF] font-bold border border-[#D0BCFF]/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{pl.title}</span>
                    <span className="text-[9px] font-mono opacity-50 flex-none ml-1">{pl.trackIds?.length || 0}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Search & Tracks Grid */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Header Bar */}
              <div className="px-3 py-2 border-b border-white/10 bg-black/30 flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search artist, title, album, key, or BPM..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 rounded-lg bg-white/5 border border-white/10 focus:border-[#D0BCFF] text-white text-[11px] outline-none transition-all placeholder:text-white/30"
                  />
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-[10px] text-white/40 font-mono">
                    Drag track into presentation to create Audio Slide
                  </span>
                  <button
                    onClick={() => setIsNewAudioPlaylistModalOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-[#D0BCFF]/15 hover:bg-[#D0BCFF]/25 text-[#D0BCFF] border border-[#D0BCFF]/30 text-[10px] font-bold transition-all flex items-center gap-1"
                  >
                    <Plus size={11} />
                    <span>New Playlist</span>
                  </button>
                </div>
              </div>

              {/* Grid / List Content */}
              <div className="flex-1 p-3 overflow-y-auto">
                {(() => {
                  const buildAlbumItems = () => {
                    const items: any[] = [];
                    if (selectedSubcat === 'Artists & Albums' || selectedSubcat === 'all') {
                      choraPublicAlbums.forEach(a => items.push({ type: 'album', data: a, category: 'Artists & Albums' }));
                    }
                    if (selectedSubcat === 'Personal Music Locker' || selectedSubcat === 'all') {
                      personalLockerAlbums.forEach(a => items.push({ type: 'album', data: a, category: 'Personal Music Locker' }));
                      // Group loose locker tracks? For simplicity we just use albums and the track filter below will catch them
                    }
                    if (selectedSubcat === 'Audius' || selectedSubcat === 'all') {
                      audiusTrending.forEach(t => items.push({ type: 'track', data: t, category: 'Audius' }));
                    }
                    return items;
                  };

                  const combinedTracks: AmboDJTrack[] = [
                    ...CHORA_TRACKS,
                    ...CHORA_PADS,
                    ...CHORA_STEMS,
                    ...choraPublicTracks,
                    ...personalLockerTracks,
                    ...audiusTrending,
                  ];

                  // We filter tracks for playlist or other specific track-based categories
                  const isGridMode = ['all', 'Artists & Albums', 'Personal Music Locker', 'Audius'].includes(selectedSubcat) && !searchQuery.trim();

                  if (isGridMode) {
                    const items = buildAlbumItems().filter(i => selectedSubcat === 'all' || i.category === selectedSubcat);
                    
                    if (items.length === 0) {
                      return (
                        <div className="h-40 flex flex-col items-center justify-center text-white/40 text-xs">
                          <Music size={24} className="mb-2 opacity-40" />
                          <span>No items found in this category.</span>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
                          {items.map(item => {
                            const id = item.data.id;
                            const title = item.data.title || item.data.name;
                            const artist = item.data.artist || 'Unknown';
                            const cover = item.type === 'album' ? (item.data.coverArt || item.data.artwork || item.data.coverImage) : item.data.coverImage;
                            const artistImg = item.type === 'album' ? item.data.artistImageUrl : undefined;
                            
                            return (
                              <div
                                key={id}
                                onClick={() => {
                                  if (expandedAlbumId === id) setExpandedAlbumId(null);
                                  else setExpandedAlbumId(id);
                                }}
                                className={`group flex flex-col gap-1 cursor-pointer rounded-lg p-1 transition-all ${expandedAlbumId === id ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`}
                              >
                                <div className="aspect-square w-full rounded-md bg-white/5 overflow-hidden relative">
                                  {cover ? (
                                    <img src={thumb(cover, THUMB.micro)} alt={title} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20">
                                      <Music size={24} />
                                    </div>
                                  )}
                                  
                                  {/* Artist Avatar overlay */}
                                  {artistImg && (
                                    <div className="absolute -bottom-1 -right-1 p-0.5 bg-black/80 rounded-full">
                                      <img src={thumb(artistImg, THUMB.micro)} className="w-5 h-5 rounded-full object-cover" alt={artist} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-white truncate leading-tight" title={title}>{title}</div>
                                  <div className="text-[9px] font-normal text-white/50 truncate flex items-center gap-1">
                                    {!artistImg && <div className="w-3 h-3 rounded-full bg-white/10 flex-none" />}
                                    <span className="truncate" title={artist}>{artist}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Expanded Album Tracks */}
                        {expandedAlbumId && (
                          <div className="mt-4 p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-white/80">Album Tracks</span>
                              <button onClick={() => setExpandedAlbumId(null)} className="p-1 text-white/40 hover:text-white/80"><X size={12} /></button>
                            </div>
                            {(() => {
                              const expItem = items.find(i => i.data.id === expandedAlbumId);
                              if (!expItem) return null;
                              
                              let expTracks: AmboDJTrack[] = [];
                              if (expItem.type === 'album') {
                                expTracks = expItem.data.tracks?.map((t: any) => ({
                                  id: t.id,
                                  title: t.title,
                                  artist: t.artist || expItem.data.artist,
                                  url: t.url,
                                  duration: t.duration,
                                  bpm: t.bpm,
                                  key: t.key
                                })) || [];
                              } else {
                                expTracks = [expItem.data];
                              }

                              if (expTracks.length === 0) {
                                return <div className="text-[10px] text-white/40 py-2">No tracks in this album.</div>;
                              }

                              return expTracks.map((t: AmboDJTrack) => {
                                const isPlayingThis = currentPlayingAudioId === t.id;
                                return (
                                  <div
                                    key={t.id}
                                    draggable
                                    onDragStart={e => {
                                      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ambo-audio', track: t }));
                                      e.dataTransfer.setData('text/plain', t.title);
                                    }}
                                    className={`group flex items-center justify-between px-2 py-1.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
                                      isPlayingThis ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-transparent hover:bg-white/5'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="text-[11px] font-semibold text-white truncate">{t.title}</div>
                                      <div className="text-[9px] text-white/40 truncate hidden sm:block">{t.artist}</div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 flex-none">
                                      {t.bpm && <span className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[8px] text-white/50">{t.bpm} BPM</span>}
                                      <span className="font-mono text-[9px] text-white/40 w-8 text-right">{t.duration || '--:--'}</span>

                                      {/* Quick Actions overlay (opacity 0 -> 100 on hover) */}
                                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                        <button onClick={() => onPlayAudioTrack?.(t)} className="p-1 rounded hover:bg-purple-600/50 text-white" title="DJ Play"><Sparkles size={11} /></button>
                                        <button onClick={() => onCueAudioTrack?.(t)} className="p-1 rounded hover:bg-white/20 text-white/80" title="Cue"><Volume2 size={11} /></button>
                                        <button onClick={() => onTakeAudioTrack?.(t)} className="p-1 rounded hover:bg-[#FF8C00]/30 text-[#FF8C00]" title="Take"><Play size={11} /></button>
                                        <button onClick={() => onInsertAudioSlide?.(t)} className="p-1 rounded hover:bg-white/20 text-white" title="+ Slide"><Plus size={11} /></button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Standard flat list mode for search or track-based categories
                  const filtered = combinedTracks.filter(t => {
                    if (selectedSubcat === 'Audio Playlists') {
                      if (!selectedPlaylistId) return true;
                      const activePl = audioPlaylists.find(p => p.id === selectedPlaylistId);
                      return activePl ? activePl.trackIds.includes(t.id || '') : true;
                    }
                    if (selectedSubcat !== 'all' && selectedSubcat !== 'All Chora Music') {
                      if (t.category !== selectedSubcat) return false;
                    }
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase();
                      const matchTitle = t.title?.toLowerCase().includes(q);
                      const matchArtist = t.artist?.toLowerCase().includes(q);
                      const matchKey = t.key?.toLowerCase().includes(q);
                      return matchTitle || matchArtist || matchKey;
                    }
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="h-40 flex flex-col items-center justify-center text-white/40 text-xs">
                        <Music size={24} className="mb-2 opacity-40" />
                        <span>No audio tracks found in this category.</span>
                        <span className="text-[10px] opacity-60 mt-1">Try searching or uploading tracks to your Personal Music Locker.</span>
                      </div>
                    );
                  }

                  return filtered.map(t => {
                    const isPlayingThis = currentPlayingAudioId === t.id;
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'ambo-audio',
                            track: t,
                          }));
                          e.dataTransfer.setData('text/plain', t.title);
                        }}
                        className={`flex items-center justify-between p-2.5 mb-2 rounded-xl border transition-all group cursor-grab active:cursor-grabbing ${
                          isPlayingThis
                            ? 'border-[#FF8C00] bg-[#FF8C00]/10 shadow-[0_0_15px_rgba(255,140,0,0.15)]'
                            : 'border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                        title="Drag into presentation to create an Audio Asset Slide | Click DJ to open horizontal waveform"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[#D0BCFF]/10 text-[#D0BCFF] grid place-items-center flex-none">
                            <Music size={15} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-white truncate flex items-center gap-2">
                              <span>{t.title}</span>
                              {t.category && (
                                <span className="px-1.5 py-0.2 rounded bg-white/10 font-mono text-[8.5px] text-white/50 font-normal">
                                  {t.category}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-white/40 flex items-center gap-2 truncate">
                              <span>{t.artist || 'Chora'}</span>
                              <span>·</span>
                              <span className="text-[#00DAF3]">{t.key || 'Key of C'}</span>
                              {t.bpm && t.bpm > 0 && <span>· {t.bpm} BPM</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-none">
                          <span className="font-mono text-[10px] text-white/40">{t.duration || '3:30'}</span>

                          <button
                            onClick={() => onPlayAudioTrack?.(t)}
                            className="px-2.5 py-1 rounded text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-500 transition-all flex items-center gap-1 shadow-sm"
                            title="Play with DJ Waveform, EQ & Hot Cues"
                          >
                            <Sparkles size={11} />
                            <span>DJ Play</span>
                          </button>

                          <button
                            onClick={() => onCueAudioTrack?.(t)}
                            className="px-2.5 py-1 rounded text-[10px] font-semibold text-white/80 bg-white/10 hover:bg-white/20 transition-all flex items-center gap-1"
                            title="Cue audio in Preview"
                          >
                            <Volume2 size={11} />
                            <span>Cue</span>
                          </button>

                          <button
                            onClick={() => onTakeAudioTrack?.(t)}
                            className="px-2.5 py-1 rounded text-[10px] font-bold text-[#FF8C00] bg-[#FF8C00]/15 hover:bg-[#FF8C00]/25 border border-[#FF8C00]/30 transition-all flex items-center gap-1"
                            title="Take live on Program Out"
                          >
                            <Play size={11} fill="#FF8C00" />
                            <span>Take</span>
                          </button>

                          <button
                            onClick={() => onInsertAudioSlide?.(t)}
                            className="px-2 py-1 rounded text-[10px] font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 transition-all flex items-center gap-1"
                            title="Create Audio Asset Slide in presentation"
                          >
                            <Plus size={11} />
                            <span>+ Slide</span>
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
