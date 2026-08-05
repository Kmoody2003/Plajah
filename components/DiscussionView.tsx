import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageCircle, ChevronUp, ChevronDown, Plus, ArrowLeft, Search,
  Flame, Clock, TrendingUp, Eye, UserCircle, Send, X, Shield,
  Hash, Users, PenSquare, MoreHorizontal, Trash2, ChevronRight
} from 'lucide-react';
import { auth } from '../services/backendService';
import {
  fetchDiscussionBoards, createDiscussionBoard,
  fetchDiscussionPosts, createDiscussionPost, voteDiscussionPost, deleteDiscussionPost,
  fetchDiscussionComments, createDiscussionComment, voteDiscussionComment,
  fetchMyDiscussionAliases, createDiscussionAlias,
  listenToDiscussionPosts, listenToDiscussionComments,
  reportDiscussionPost, reportDiscussionComment,
  removeDiscussionPost, deleteDiscussionComment, pinDiscussionPost,
} from '../services/backendService';
import { renderDiscussionMarkdown } from '../src/lib/discussionMarkdown';
import SignInPrompt from './SignInPrompt';

interface Props {
  onBack: () => void;
  currentUser: any;
}

type SortMode = 'hot' | 'new' | 'top';
type DiscussionScreen = 'BOARDS' | 'HOME' | 'FEED' | 'POST';

export default function DiscussionView({ onBack, currentUser }: Props) {
  const [screen, setScreen] = useState<DiscussionScreen>('BOARDS');
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<any | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [aliases, setAliases] = useState<any[]>([]);
  const [selectedAlias, setSelectedAlias] = useState<any | null>(null);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [showNewAlias, setShowNewAlias] = useState(false);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [homePosts, setHomePosts] = useState<any[]>([]);
  const [showModPanel, setShowModPanel] = useState(false);
  const [reportedPosts, setReportedPosts] = useState<any[]>([]);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);

  // New post form
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostBody, setNewPostBody] = useState('');
  const [newPostLink, setNewPostLink] = useState('');

  // New board form
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');

  // New alias form
  const [newAliasName, setNewAliasName] = useState('');
  const [newAliasBio, setNewAliasBio] = useState('');

  useEffect(() => {
    loadBoards();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchMyDiscussionAliases().then(setAliases);
    }
  }, [currentUser]);

  // Real-time posts subscription for FEED screen
  useEffect(() => {
    if (screen !== 'FEED' || !selectedBoard) return;
    setLoading(true);
    const unsub = listenToDiscussionPosts(selectedBoard.id, (data) => {
      const sorted = [...data];
      if (sortMode === 'new') sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      else if (sortMode === 'top') sorted.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
      else sorted.sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0)));
      setPosts(sorted);
      setLoading(false);
    });
    return unsub;
  }, [screen, selectedBoard?.id, sortMode]);

  // Real-time home feed (all boards)
  useEffect(() => {
    if (screen !== 'HOME') return;
    const unsub = listenToDiscussionPosts(null, (data) => {
      setHomePosts(data.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)));
    });
    return unsub;
  }, [screen]);

  // Real-time comments subscription
  useEffect(() => {
    if (screen !== 'POST' || !selectedPost) return;
    const unsub = listenToDiscussionComments(selectedPost.id, setComments);
    return unsub;
  }, [screen, selectedPost?.id]);

  const loadBoards = async () => {
    setLoading(true);
    try {
      const data = await fetchDiscussionBoards();
      setBoards(data);
    } catch (e) {
      console.error('[loadBoards]', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await fetchDiscussionPosts(selectedBoard?.id, sortMode);
      setPosts(data);
    } catch (e) {
      console.error('[loadPosts]', e);
    } finally {
      setLoading(false);
    }
  };

  const openBoard = (board: any) => {
    setSelectedBoard(board);
    setScreen('FEED');
  };

  const openPost = (post: any) => {
    setSelectedPost(post);
    setScreen('POST');
  };

  const goBack = () => {
    if (screen === 'POST') { setScreen('FEED'); setSelectedPost(null); }
    else if (screen === 'FEED') { setScreen('BOARDS'); setSelectedBoard(null); }
    else if (screen === 'HOME') { setScreen('BOARDS'); }
    else onBack();
  };

  const requireAuth = (action: string) => {
    if (!auth.currentUser) { setSignInAction(action); return false; }
    return true;
  };

  const handleCreateBoard = async () => {
    if (!requireAuth('create a discussion board')) return;
    if (!newBoardName.trim()) return;
    setSubmitting(true); setError(null);
    try {
      const board = await createDiscussionBoard(newBoardName.trim(), newBoardDesc.trim());
      if (!board) { setError('Failed to create board. Please try again.'); return; }
      setNewBoardName(''); setNewBoardDesc('');
      setShowNewBoard(false);
      loadBoards();
    } catch (e: any) {
      setError(e?.message || 'Failed to create board.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAlias = async () => {
    if (!requireAuth('create an alias')) return;
    if (!newAliasName.trim()) return;
    setSubmitting(true); setError(null);
    try {
      const alias = await createDiscussionAlias(newAliasName.trim(), undefined, newAliasBio.trim());
      if (!alias) { setError('Failed to create alias. Please try again.'); return; }
      setAliases(prev => [alias, ...prev]);
      setSelectedAlias(alias);
      setNewAliasName(''); setNewAliasBio('');
      setShowNewAlias(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to create alias.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePost = async () => {
    if (!requireAuth('post in discussions')) return;
    if (!newPostTitle.trim() || !selectedBoard) return;
    setSubmitting(true); setError(null);
    try {
      const displayName = selectedAlias ? selectedAlias.name : (currentUser?.displayName || 'Anonymous');
      const displayPhoto = selectedAlias ? (selectedAlias.avatar || '') : (currentUser?.photoURL || '');
      const post = await createDiscussionPost({
        boardId: selectedBoard.id, boardName: selectedBoard.name,
        title: newPostTitle.trim(), body: newPostBody.trim(),
        aliasId: selectedAlias?.id, displayName, displayPhoto,
        isAnonymous: !!selectedAlias,
        linkUrl: newPostLink.trim() || undefined,
      });
      if (!post) { setError('Failed to create post. Please try again.'); return; }
      setNewPostTitle(''); setNewPostBody(''); setNewPostLink('');
      setShowNewPost(false);
      loadPosts();
    } catch (e: any) {
      setError(e?.message || 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVotePost = async (post: any, value: 1 | -1) => {
    if (!requireAuth('vote')) return;
    try { await voteDiscussionPost(post.id, value); loadPosts(); } catch {}
  };

  const handleSubmitComment = async () => {
    if (!requireAuth('comment')) return;
    if (!commentText.trim() || !selectedPost) return;
    setSubmitting(true); setError(null);
    try {
      const displayName = selectedAlias ? selectedAlias.name : (currentUser?.displayName || 'Anonymous');
      const displayPhoto = selectedAlias ? (selectedAlias.avatar || '') : (currentUser?.photoURL || '');
      const result = await createDiscussionComment({
        postId: selectedPost.id, body: commentText.trim(),
        parentCommentId: replyTo?.id, aliasId: selectedAlias?.id,
        displayName, displayPhoto, isAnonymous: !!selectedAlias,
        depth: replyTo ? (replyTo.depth || 0) + 1 : 0,
      });
      if (!result) { setError('Failed to post comment. Please try again.'); return; }
      setCommentText(''); setReplyTo(null);
      const updated = await fetchDiscussionComments(selectedPost.id);
      setComments(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteComment = async (comment: any, value: 1 | -1) => {
    if (!requireAuth('vote')) return;
    try { await voteDiscussionComment(comment.id, value); } catch {}
  };

  const handleReportPost = async (postId: string) => {
    if (!requireAuth('report content')) return;
    await reportDiscussionPost(postId);
  };

  const handleReportComment = async (commentId: string) => {
    if (!requireAuth('report content')) return;
    await reportDiscussionComment(commentId);
  };

  const handleRemovePost = async (postId: string) => {
    await removeDiscussionPost(postId, 'Removed by moderator');
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteDiscussionComment(commentId);
  };

  const isCurrentUserBoardCreator = selectedBoard && auth.currentUser && selectedBoard.creatorId === auth.currentUser.uid;

  const filteredBoards = boards.filter(b =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const identityLabel = selectedAlias
    ? `👤 ${selectedAlias.name}`
    : currentUser
      ? `🔵 ${currentUser.displayName || 'You'}`
      : 'Guest';

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <button onClick={goBack} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <MessageCircle size={20} className="text-violet-400" />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm leading-tight">
            {screen === 'BOARDS' ? 'Discussion'
             : screen === 'HOME' ? 'Home Feed'
             : screen === 'FEED' ? `d/${selectedBoard?.name}`
             : selectedPost?.title}
          </h1>
          {screen === 'BOARDS' && <p className="text-xs text-white/40">Reddit-style forums</p>}
          {screen === 'HOME' && <p className="text-xs text-white/40">All boards · real-time</p>}
        </div>

        {/* Identity switcher */}
        {currentUser && (
          <button
            onClick={() => setShowIdentityPicker(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-xs text-white/60 transition-colors"
          >
            {selectedAlias ? <Shield size={12} className="text-violet-400" /> : <UserCircle size={12} />}
            <span className="max-w-[80px] truncate">{identityLabel}</span>
          </button>
        )}

        {screen === 'BOARDS' && (
          <div className="flex items-center gap-1">
            <button onClick={() => setScreen('HOME')}
              className="px-3 py-1.5 text-xs font-semibold text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-colors flex items-center gap-1">
              <TrendingUp size={12} /> Home
            </button>
            <button onClick={() => requireAuth('create a board') && setShowNewBoard(true)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-violet-400">
              <Plus size={18} />
            </button>
          </div>
        )}
        {screen === 'FEED' && (
          <button
            onClick={() => requireAuth('create a post') && setShowNewPost(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-full text-xs font-semibold transition-colors"
          >
            <PenSquare size={13} />
            Post
          </button>
        )}
      </div>

      {/* Boards Screen */}
      {screen === 'BOARDS' && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search boards…"
                className="w-full pl-8 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm placeholder-white/30 focus:outline-none focus:border-violet-500"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-white/30">Loading…</div>
            ) : filteredBoards.length === 0 ? (
              <div className="text-center py-16">
                <MessageCircle size={40} className="mx-auto mb-3 text-white/20" />
                <p className="text-white/40 text-sm">No boards yet. Create the first one!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBoards.map(board => (
                  <motion.button
                    key={board.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => openBoard(board)}
                    className="w-full flex items-center gap-3 p-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-left transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                      <Hash size={16} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">d/{board.name}</div>
                      <div className="text-xs text-white/40 truncate">{board.description}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-white/30 flex items-center gap-1">
                          <Users size={11} />{board.memberCount || 0}
                        </span>
                        <span className="text-xs text-white/30 flex items-center gap-1">
                          <MessageCircle size={11} />{board.postCount || 0}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-white/20 shrink-0" />
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HOME Screen — aggregated feed across all boards */}
      {screen === 'HOME' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06]">
            {(['hot', 'new', 'top'] as SortMode[]).map(mode => (
              <button key={mode} onClick={() => setSortMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sortMode === mode ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                {mode === 'hot' && <Flame size={12} />}{mode === 'new' && <Clock size={12} />}{mode === 'top' && <TrendingUp size={12} />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {homePosts.length === 0 ? (
            <div className="text-center py-16 text-white/30 text-sm">No posts yet across any boards.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {homePosts.filter(p => !p.isRemoved).map(post => (
                <div key={post.id} className="flex gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button onClick={() => handleVotePost(post, 1)} className="p-1 hover:text-orange-400 text-white/30 transition-colors"><ChevronUp size={16} /></button>
                    <span className="text-xs font-bold text-white/70 min-w-[20px] text-center">{(post.upvotes || 0) - (post.downvotes || 0)}</span>
                    <button onClick={() => handleVotePost(post, -1)} className="p-1 hover:text-blue-400 text-white/30 transition-colors"><ChevronDown size={16} /></button>
                  </div>
                  <button onClick={() => { setSelectedBoard({ id: post.boardId, name: post.boardName }); openPost(post); }} className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 text-xs rounded-full">d/{post.boardName}</span>
                      {post.flair && <span className="px-1.5 py-0.5 bg-white/8 text-white/50 text-xs rounded-full">{post.flair}</span>}
                    </div>
                    <h3 className="font-semibold text-sm leading-snug mb-1">{post.title}</h3>
                    {post.body && <p className="text-xs text-white/50 line-clamp-2 mb-1">{post.body}</p>}
                    <div className="flex items-center gap-3 text-xs text-white/30">
                      <span>{post.displayName}</span>
                      <span>{formatTime(post.timestamp)}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={11} />{post.commentCount || 0}</span>
                    </div>
                  </button>
                  <button onClick={() => handleReportPost(post.id)} className="p-1.5 text-white/15 hover:text-red-400 transition-colors self-start flex-shrink-0" title="Report">
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feed Screen */}
      {screen === 'FEED' && (
        <div className="flex-1 overflow-y-auto">
          {/* Sort bar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06]">
            {(['hot', 'new', 'top'] as SortMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sortMode === mode ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
              >
                {mode === 'hot' && <Flame size={12} />}
                {mode === 'new' && <Clock size={12} />}
                {mode === 'top' && <TrendingUp size={12} />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/30">Loading…</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16">
              <PenSquare size={36} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/40 text-sm mb-2">No posts yet.</p>
              <button onClick={() => requireAuth('post') && setShowNewPost(true)} className="text-violet-400 text-sm hover:underline">
                Be the first to post
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {posts.map(post => (
                <div key={post.id} className="flex gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                  {/* Votes */}
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button onClick={() => handleVotePost(post, 1)} className="p-1 hover:text-orange-400 text-white/30 transition-colors">
                      <ChevronUp size={16} />
                    </button>
                    <span className="text-xs font-bold text-white/70 min-w-[20px] text-center">
                      {(post.upvotes || 0) - (post.downvotes || 0)}
                    </span>
                    <button onClick={() => handleVotePost(post, -1)} className="p-1 hover:text-blue-400 text-white/30 transition-colors">
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {/* Content */}
                  <button onClick={() => openPost(post)} className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {post.flair && <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 text-xs rounded-full">{post.flair}</span>}
                      {post.isPinned && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded-full">📌 Pinned</span>}
                    </div>
                    <h3 className="font-semibold text-sm leading-snug mb-1">{post.title}</h3>
                    {post.body && <p className="text-xs text-white/50 line-clamp-2 mb-2">{post.body}</p>}
                    {post.linkUrl && (
                      <div className="flex items-center gap-1 text-xs text-blue-400 mb-2">
                        <Eye size={11} /><span className="truncate max-w-[200px]">{post.linkUrl}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-white/30">
                      <span className="flex items-center gap-1">
                        {post.isAnonymous ? <Shield size={11} className="text-violet-400" /> : <UserCircle size={11} />}
                        {post.displayName}
                      </span>
                      <span>{formatTime(post.timestamp)}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={11} />{post.commentCount || 0}</span>
                    </div>
                  </button>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => handleReportPost(post.id)} className="p-1.5 text-white/15 hover:text-red-400 transition-colors" title="Report">
                      <MoreHorizontal size={13} />
                    </button>
                    {isCurrentUserBoardCreator && (
                      <button onClick={() => handleRemovePost(post.id)} className="p-1.5 text-white/15 hover:text-red-400 transition-colors" title="Remove">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post / Comments Screen */}
      {screen === 'POST' && selectedPost && (
        <div className="flex-1 overflow-y-auto">
          {/* Post detail */}
          <div className="p-4 border-b border-white/10">
            <div className="flex gap-3">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <button onClick={() => handleVotePost(selectedPost, 1)} className="p-1 hover:text-orange-400 text-white/30 transition-colors">
                  <ChevronUp size={16} />
                </button>
                <span className="text-xs font-bold text-white/70 min-w-[20px] text-center">
                  {(selectedPost.upvotes || 0) - (selectedPost.downvotes || 0)}
                </span>
                <button onClick={() => handleVotePost(selectedPost, -1)} className="p-1 hover:text-blue-400 text-white/30 transition-colors">
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-base leading-snug mb-2">{selectedPost.title}</h2>
                {selectedPost.body && (
                  <div className="text-sm text-white/70 mb-3 leading-relaxed prose-discussion"
                    dangerouslySetInnerHTML={{ __html: renderDiscussionMarkdown(selectedPost.body) }} />
                )}
                {selectedPost.linkUrl && (
                  <a href={selectedPost.linkUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 underline break-all">
                    {selectedPost.linkUrl}
                  </a>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-white/30">
                  <span className="flex items-center gap-1">
                    {selectedPost.isAnonymous ? <Shield size={11} className="text-violet-400" /> : <UserCircle size={11} />}
                    {selectedPost.displayName}
                  </span>
                  <span>{formatTime(selectedPost.timestamp)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comment input */}
          <div className="p-4 border-b border-white/10">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 text-xs text-violet-400">
                <span>Replying to {replyTo.displayName}</span>
                <button onClick={() => setReplyTo(null)}><X size={12} /></button>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder={auth.currentUser ? "Add a comment…" : "Sign in to comment"}
                rows={2}
                onClick={() => !auth.currentUser && setSignInAction('comment in discussions')}
                readOnly={!auth.currentUser}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 resize-none"
              />
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim()}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Comments */}
          <div className="divide-y divide-white/[0.04]">
            {comments.length === 0 ? (
              <div className="text-center py-10 text-white/30 text-sm">No comments yet. Be the first!</div>
            ) : (
              comments.map(comment => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  onVote={handleVoteComment}
                  onReply={(c: any) => { setReplyTo(c); }}
                  onReport={handleReportComment}
                  onDelete={handleDeleteComment}
                  isCreator={isCurrentUserBoardCreator}
                  formatTime={formatTime}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Identity Picker Modal */}
      <AnimatePresence>
        {showIdentityPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowIdentityPicker(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="w-full max-w-sm bg-[#1a1a2e] border border-white/10 rounded-2xl p-5"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-bold text-base mb-1">Post as…</h3>
              <p className="text-xs text-white/40 mb-4">Choose your identity for this session</p>

              {/* Real profile option */}
              <button
                onClick={() => { setSelectedAlias(null); setShowIdentityPicker(false); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition-colors ${!selectedAlias ? 'bg-blue-500/20 border border-blue-500/40' : 'hover:bg-white/5 border border-white/[0.06]'}`}
              >
                <UserCircle size={20} className="text-blue-400" />
                <div className="text-left">
                  <div className="font-semibold text-sm">{currentUser?.displayName || 'You'}</div>
                  <div className="text-xs text-white/40">Your real profile</div>
                </div>
                {!selectedAlias && <div className="ml-auto w-2 h-2 rounded-full bg-blue-400" />}
              </button>

              {/* Aliases */}
              {aliases.map(alias => (
                <button
                  key={alias.id}
                  onClick={() => { setSelectedAlias(alias); setShowIdentityPicker(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition-colors ${selectedAlias?.id === alias.id ? 'bg-violet-500/20 border border-violet-500/40' : 'hover:bg-white/5 border border-white/[0.06]'}`}
                >
                  <Shield size={20} className="text-violet-400" />
                  <div className="text-left">
                    <div className="font-semibold text-sm">{alias.name}</div>
                    <div className="text-xs text-white/40">Anonymous alias</div>
                  </div>
                  {selectedAlias?.id === alias.id && <div className="ml-auto w-2 h-2 rounded-full bg-violet-400" />}
                </button>
              ))}

              <button
                onClick={() => { setShowIdentityPicker(false); setShowNewAlias(true); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/20 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors text-white/40 hover:text-violet-300"
              >
                <Plus size={18} />
                <span className="text-sm">Create anonymous alias</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Alias Modal */}
      <AnimatePresence>
        {showNewAlias && (
          <Modal title="Create Alias" onClose={() => setShowNewAlias(false)}>
            <label className="block text-xs text-white/50 mb-1">Alias name *</label>
            <input
              value={newAliasName} onChange={e => setNewAliasName(e.target.value)}
              placeholder="e.g. CryptoWalrus42"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-3"
            />
            <label className="block text-xs text-white/50 mb-1">Bio (optional)</label>
            <input
              value={newAliasBio} onChange={e => setNewAliasBio(e.target.value)}
              placeholder="Short bio"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-4"
            />
            <button onClick={handleCreateAlias} disabled={!newAliasName.trim()} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl font-semibold text-sm transition-colors">
              Create Alias
            </button>
          </Modal>
        )}
      </AnimatePresence>

      {/* New Board Modal */}
      <AnimatePresence>
        {showNewBoard && (
          <Modal title="Create Board" onClose={() => setShowNewBoard(false)}>
            <label className="block text-xs text-white/50 mb-1">Board name *</label>
            <input
              value={newBoardName} onChange={e => setNewBoardName(e.target.value)}
              placeholder="e.g. MusicProduction"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-3"
            />
            <label className="block text-xs text-white/50 mb-1">Description</label>
            <textarea
              value={newBoardDesc} onChange={e => setNewBoardDesc(e.target.value)}
              placeholder="What's this board about?"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-4 resize-none"
            />
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            <button onClick={handleCreateBoard} disabled={submitting || !newBoardName.trim()} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Board
            </button>
          </Modal>
        )}
      </AnimatePresence>

      {/* New Post Modal */}
      <AnimatePresence>
        {showNewPost && (
          <Modal title={`Post to d/${selectedBoard?.name}`} onClose={() => setShowNewPost(false)}>
            <label className="block text-xs text-white/50 mb-1">Title *</label>
            <input
              value={newPostTitle} onChange={e => setNewPostTitle(e.target.value)}
              placeholder="Post title"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-3"
            />
            <label className="block text-xs text-white/50 mb-1">Body (optional)</label>
            <textarea
              value={newPostBody} onChange={e => setNewPostBody(e.target.value)}
              placeholder="Share your thoughts…"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-3 resize-none"
            />
            <label className="block text-xs text-white/50 mb-1">Link (optional)</label>
            <input
              value={newPostLink} onChange={e => setNewPostLink(e.target.value)}
              placeholder="https://…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 mb-4"
            />
            <div className="flex items-center gap-2 mb-4 text-xs text-white/40">
              {selectedAlias ? <Shield size={12} className="text-violet-400" /> : <UserCircle size={12} />}
              Posting as <span className="text-white/70 font-medium">{selectedAlias ? selectedAlias.name : (currentUser?.displayName || 'You')}</span>
            </div>
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            <button onClick={handleCreatePost} disabled={submitting || !newPostTitle.trim()} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Post
            </button>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {signInAction && (
          <SignInPrompt
            action={signInAction}
            onClose={() => setSignInAction(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CommentCard({ comment, onVote, onReply, onReport, onDelete, formatTime, isCreator }: any) {
  if (comment.isRemoved) {
    return (
      <div className={`flex gap-2 px-4 py-3 ${comment.depth > 0 ? `ml-${Math.min(comment.depth * 4, 16)}` : ''}`}>
        <div className="flex-1">
          <p className="text-xs text-white/20 italic">[comment removed]</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex gap-2 px-4 py-3 hover:bg-white/[0.01] transition-colors ${comment.depth > 0 ? `ml-${Math.min(comment.depth * 4, 16)}` : ''}`}>
      {comment.depth > 0 && <div className="w-0.5 bg-white/10 shrink-0" />}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {comment.isAnonymous ? <Shield size={12} className="text-violet-400" /> : <UserCircle size={12} className="text-white/40" />}
          <span className="text-xs font-semibold text-white/70">{comment.displayName}</span>
          <span className="text-xs text-white/30">{formatTime(comment.timestamp)}</span>
          {(comment.reportedBy?.length ?? 0) > 0 && isCreator && (
            <span className="text-[9px] text-red-400 font-black uppercase tracking-widest">⚑ {comment.reportedBy.length} report{comment.reportedBy.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="text-sm text-white/80 leading-relaxed mb-2"
          dangerouslySetInnerHTML={{ __html: renderDiscussionMarkdown(comment.body) }} />
        <div className="flex items-center gap-3">
          <button onClick={() => onVote(comment, 1)} className="p-0.5 hover:text-orange-400 text-white/30 transition-colors"><ChevronUp size={14} /></button>
          <span className="text-xs text-white/50">{(comment.upvotes || 0) - (comment.downvotes || 0)}</span>
          <button onClick={() => onVote(comment, -1)} className="p-0.5 hover:text-blue-400 text-white/30 transition-colors"><ChevronDown size={14} /></button>
          <button onClick={() => onReply(comment)} className="text-xs text-white/30 hover:text-white/60 transition-colors ml-1">Reply</button>
          <button onClick={() => onReport(comment.id)} className="text-xs text-white/20 hover:text-red-400 transition-colors">Report</button>
          {isCreator && (
            <button onClick={() => onDelete(comment.id)} className="text-xs text-white/15 hover:text-red-400 transition-colors">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-sm bg-[#1a1a2e] border border-white/10 rounded-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
