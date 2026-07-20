import { useState, useEffect, useRef } from 'react';
import { collab as collabApi } from '../services/api';
import {
  getSocket,
  emitViewingItem, emitCursorMove, emitReadItem,
  emitReactionBurst, emitChatMessage,
  emitPresenterStart, emitPresenterStop, emitSpotlightSet, emitSpotlightClear,
  emitControlRequest, emitControlGrant, emitControlRevoke,
  emitScreenRequest, emitScreenGrant, emitSessionEnd,
} from '../services/socket';

/**
 * All Tier 1-4, 6 co-presence state/socket-listeners/handlers for a Squad
 * Cart session, pulled out of CollabCartPage.js into its own hook.
 *
 * Why a separate file: this is genuinely live-only state (see
 * StyleOS-backend/src/sockets/index.js's header comment) that doesn't touch
 * cart/mission data at all — but more practically, CollabCartPage.js's own
 * hook + JSX volume was tripping a babel-eslint rules-of-hooks parser bug
 * once it grew past a certain size (confirmed via bisection: Babel's own
 * parser accepted the file fine, only the older `babel-eslint` package used
 * by eslint-config-react-app choked). Moving this composition into its own
 * hook — one hook CALL from the parent's perspective — keeps the page
 * component's own hook density low regardless of how much lives inside here.
 */
export function useCollabPresence({ token, identity, items, currentItem, effectiveUser, effectiveGuest, presence, onNavigate }) {
  const mySocketIdRef = useRef(null);
  const [viewers, setViewers] = useState({}); // itemId -> [{socketId, name}]
  const [cursors, setCursors] = useState({}); // socketId -> {name, itemId, xPct, yPct}
  const [readBy, setReadBy] = useState({}); // itemId -> [{socketId, name}]
  const [typingName, setTypingName] = useState(null);
  const [bursts, setBursts] = useState([]); // [{id, itemId, emoji, x}]
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [presenterSocketId, setPresenterSocketId] = useState(null);
  const [presenterName, setPresenterName] = useState(null);
  const [followingPresenter, setFollowingPresenter] = useState(false);
  const [spotlightItemId, setSpotlightItemId] = useState(null);
  const [spotlightToast, setSpotlightToast] = useState(null);
  const [controllerSocketId, setControllerSocketId] = useState(null);
  const [controllerName, setControllerName] = useState(null);
  const [controlRequests, setControlRequests] = useState([]);
  const [swapOptions, setSwapOptions] = useState(null);
  const [swapOptionsLoading, setSwapOptionsLoading] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [screenRequests, setScreenRequests] = useState([]); // [{socketId, name}]
  const [sessionEnded, setSessionEnded] = useState(null); // { byName } | null

  const imageAreaRef = useRef(null);
  const readTimerRef = useRef(null);
  const cursorThrottleRef = useRef(0);

  // Refs mirroring props/state the narrow-deps socket effect below needs to
  // read without going stale — same pattern CollabCartPage.js already used
  // for its own autopilot effects.
  const followingPresenterRef = useRef(false);
  const presenterSocketIdRef = useRef(null);
  const itemsRef = useRef([]);
  const chatOpenRef = useRef(false);
  const presenceRef = useRef([]);
  const viewersRef = useRef({});
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => { followingPresenterRef.current = followingPresenter; }, [followingPresenter]);
  useEffect(() => { presenterSocketIdRef.current = presenterSocketId; }, [presenterSocketId]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffect(() => { presenceRef.current = presence; }, [presence]);
  useEffect(() => { viewersRef.current = viewers; }, [viewers]);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);

  // Tier 1 — broadcast "viewing this item" the moment the card changes, and
  // queue a read receipt after a short dwell (so a half-second swipe-past
  // doesn't count as "read").
  useEffect(() => {
    if (!currentItem || !token) return;
    emitViewingItem(token, currentItem.id);
    clearTimeout(readTimerRef.current);
    readTimerRef.current = setTimeout(() => emitReadItem(token, currentItem.id), 1200);
    return () => clearTimeout(readTimerRef.current);
  }, [currentItem?.id, token]);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();

    const handleConnect = () => { mySocketIdRef.current = socket.id; };
    if (socket.connected) handleConnect();
    socket.on('connect', handleConnect);

    socket.on('presence:roster', ({ members, presenterSocketId: pSid, spotlightItemId: sItem, controllerSocketId: cSid, chatHistory }) => {
      const byItem = {};
      for (const m of members || []) {
        if (m.socketId === mySocketIdRef.current) continue;
        if (!m.viewingItemId) continue;
        (byItem[m.viewingItemId] = byItem[m.viewingItemId] || []).push({ socketId: m.socketId, name: m.name });
      }
      setViewers(byItem);
      setPresenterSocketId(pSid || null);
      const presenter = (members || []).find(m => m.socketId === pSid);
      setPresenterName(presenter?.name || null);
      setSpotlightItemId(sItem || null);
      setControllerSocketId(cSid || null);
      const controller = (members || []).find(m => m.socketId === cSid);
      setControllerName(controller?.name || null);
      setChatMessages(chatHistory || []);
    });

    socket.on('presence:viewing', ({ socketId, itemId }) => {
      setViewers(prev => {
        const next = {};
        for (const [id, list] of Object.entries(prev)) next[id] = list.filter(v => v.socketId !== socketId);
        if (itemId) {
          const knownPresence = presenceRef.current.find(p => p.socketId === socketId);
          const viewerName = knownPresence ? knownPresence.name : 'Someone';
          next[itemId] = [...(next[itemId] || []), { socketId, name: viewerName }];
        }
        return next;
      });
      // Follow-me (Tier 3) — if I'm following the presenter and THEY just
      // moved to a different item, snap my own view to match.
      if (followingPresenterRef.current && socketId === presenterSocketIdRef.current && itemId) {
        const idx = itemsRef.current.findIndex(it => it.id === itemId);
        if (idx >= 0) onNavigateRef.current(idx);
      }
    });

    socket.on('presence:cursor', ({ socketId, itemId, xPct, yPct }) => {
      setCursors(prev => ({ ...prev, [socketId]: { ...(prev[socketId] || {}), itemId, xPct, yPct } }));
    });

    socket.on('presence:read', ({ socketId, name, itemId }) => {
      setReadBy(prev => {
        const list = prev[itemId] || [];
        if (list.some(r => r.socketId === socketId)) return prev;
        return { ...prev, [itemId]: [...list, { socketId, name }] };
      });
    });

    socket.on('collab:typing', ({ userName }) => {
      setTypingName(userName);
      clearTimeout(socket._typingTimer);
      socket._typingTimer = setTimeout(() => setTypingName(null), 3000);
    });

    socket.on('presence:burst', ({ itemId, emoji }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setBursts(prev => [...prev, { id, itemId, emoji, x: 15 + Math.random() * 70 }]);
      setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), 1800);
    });

    socket.on('chat:message', (msg) => {
      setChatMessages(prev => [...prev.slice(-49), msg]);
      setChatUnread(prev => chatOpenRef.current ? 0 : prev + 1);
    });

    socket.on('presence:presenter', ({ socketId, name }) => {
      setPresenterSocketId(socketId);
      setPresenterName(name);
      if (!socketId) setFollowingPresenter(false);
    });

    socket.on('presence:spotlight', ({ itemId, byName }) => {
      setSpotlightItemId(itemId);
      if (itemId && byName) {
        setSpotlightToast(`📍 ${byName} spotlighted an item`);
        setTimeout(() => setSpotlightToast(null), 3500);
      }
    });

    socket.on('control:requested', ({ socketId, name }) => {
      setControlRequests(prev => prev.some(r => r.socketId === socketId) ? prev : [...prev, { socketId, name }]);
    });
    socket.on('control:granted', ({ socketId, name }) => {
      setControllerSocketId(socketId);
      setControllerName(name);
      setControlRequests(prev => prev.filter(r => r.socketId !== socketId));
    });
    socket.on('control:revoked', ({ socketId }) => {
      setControllerSocketId(prev => (prev === socketId ? null : prev));
      if (socketId === mySocketIdRef.current) setSwapOptions(null);
    });

    socket.on('screen:requested', ({ socketId, name }) => {
      setScreenRequests(prev => prev.some(r => r.socketId === socketId) ? prev : [...prev, { socketId, name }]);
    });
    socket.on('screen:granted', ({ socketId }) => {
      setScreenRequests(prev => prev.filter(r => r.socketId !== socketId));
      if (socketId !== mySocketIdRef.current) return;
      setFollowingPresenter(true);
      const presenterItemId = Object.keys(viewersRef.current).find(
        id => viewersRef.current[id].some(v => v.socketId === presenterSocketIdRef.current)
      );
      if (presenterItemId) {
        const idx = itemsRef.current.findIndex(it => it.id === presenterItemId);
        if (idx >= 0) onNavigateRef.current(idx);
      }
    });

    socket.on('session:ended', ({ byName }) => setSessionEnded({ byName }));

    // Independent of CollabCartPage.js's own presence:leave listener (which
    // only touches its `presence` array) — this one cleans up state that's
    // local to this hook.
    socket.on('presence:leave', ({ socketId }) => {
      setViewers(prev => {
        const next = {};
        for (const [itemId, list] of Object.entries(prev)) next[itemId] = list.filter(v => v.socketId !== socketId);
        return next;
      });
      setCursors(prev => { const next = { ...prev }; delete next[socketId]; return next; });
      setControlRequests(prev => prev.filter(r => r.socketId !== socketId));
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('presence:roster');
      socket.off('presence:viewing');
      socket.off('presence:cursor');
      socket.off('presence:read');
      socket.off('collab:typing');
      socket.off('presence:burst');
      socket.off('chat:message');
      socket.off('presence:presenter');
      socket.off('presence:spotlight');
      socket.off('control:requested');
      socket.off('control:granted');
      socket.off('control:revoked');
      socket.off('presence:leave');
      socket.off('screen:requested');
      socket.off('screen:granted');
      socket.off('session:ended');
    };
  }, [token]);

  const currentViewers = (currentItem && viewers[currentItem.id]) || [];
  const currentReadBy = (currentItem && readBy[currentItem.id]) || [];
  const currentItemBursts = currentItem ? bursts.filter(b => b.itemId === currentItem.id) : [];
  const isSpotlit = Boolean(currentItem && spotlightItemId === currentItem.id);
  const iAmPresenter = Boolean(presenterSocketId && presenterSocketId === mySocketIdRef.current);
  const iAmController = Boolean(controllerSocketId && controllerSocketId === mySocketIdRef.current);

  const visibleCursors = [];
  if (currentItem) {
    for (const socketId of Object.keys(cursors)) {
      const c = cursors[socketId];
      if (c.itemId !== currentItem.id || socketId === mySocketIdRef.current) continue;
      const known = presence.find(p => p.socketId === socketId);
      visibleCursors.push({ socketId, xPct: c.xPct, yPct: c.yPct, name: known ? known.name : 'Someone' });
    }
  }

  const myName = effectiveUser?.name || effectiveGuest?.guestName || 'Someone';

  const handleImageMouseMove = (e) => {
    if (!currentItem || !token || !imageAreaRef.current) return;
    const now = Date.now();
    if (now - cursorThrottleRef.current < 80) return;
    cursorThrottleRef.current = now;
    const rect = imageAreaRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    const xPct = ((point.clientX - rect.left) / rect.width) * 100;
    const yPct = ((point.clientY - rect.top) / rect.height) * 100;
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;
    emitCursorMove(token, currentItem.id, xPct, yPct);
  };

  const handleEmojiBurst = (emoji) => {
    if (!currentItem || !token) return;
    emitReactionBurst(token, currentItem.id, emoji);
  };

  const emitTyping = () => {
    if (!token) return;
    getSocket().emit('collab:typing', { shareToken: token, userName: myName });
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !token) return;
    const msg = { socketId: mySocketIdRef.current, name: myName, text: chatInput.trim(), ts: Date.now() };
    setChatMessages(prev => [...prev.slice(-49), msg]);
    emitChatMessage(token, chatInput.trim());
    setChatInput('');
  };

  const toggleChat = () => {
    setChatOpen(prev => {
      if (!prev) setChatUnread(0);
      return !prev;
    });
  };

  const handleTogglePresenter = () => {
    if (!token) return;
    if (iAmPresenter) emitPresenterStop(token);
    else { emitPresenterStart(token); setFollowingPresenter(false); }
  };

  const handleToggleFollow = () => {
    const turningOn = !followingPresenter;
    setFollowingPresenter(turningOn);
    if (!turningOn || !presenterSocketId) return;
    const presenterItemId = Object.keys(viewers).find(id => viewers[id].some(v => v.socketId === presenterSocketId));
    if (presenterItemId) {
      const idx = items.findIndex(it => it.id === presenterItemId);
      if (idx >= 0) onNavigate(idx);
    }
  };

  const handleSpotlight = () => {
    if (!currentItem || !token) return;
    if (isSpotlit) emitSpotlightClear(token);
    else emitSpotlightSet(token, currentItem.id);
  };

  const handleRequestControl = () => { if (token) emitControlRequest(token); };
  const handleGrantControl = (socketId) => { if (token) emitControlGrant(token, socketId); };
  const dismissControlRequest = (socketId) => setControlRequests(prev => prev.filter(x => x.socketId !== socketId));
  const handleRevokeControl = () => {
    if (!token) return;
    emitControlRevoke(token);
    setSwapOptions(null);
  };

  const handleOpenSwapOptions = async () => {
    if (!currentItem) return;
    setSwapOptionsLoading(true);
    try {
      const data = await collabApi.voteOptions(token, currentItem.id, identity);
      setSwapOptions({ cartItemId: currentItem.id, options: (data.options || []).slice(1) });
    } catch (err) {
      console.error(err);
    } finally {
      setSwapOptionsLoading(false);
    }
  };

  const handleControlSwap = async (productId) => {
    if (!currentItem) return;
    try {
      await collabApi.controlSwap(token, currentItem.id, productId, identity);
      setSwapOptions(null);
    } catch (err) {
      console.error(err);
      alert("Couldn't make that swap — try again.");
    }
  };
  const cancelSwap = () => setSwapOptions(null);

  // Screen-share requests — the reverse direction of "Show my screen"
  // (Collab Cart Complete Session UX Spec §4b). A joiner asks; whoever
  // grants it becomes presenter (if not already) and the specific
  // requester auto-follows.
  const handleRequestScreen = () => { if (token) emitScreenRequest(token); };
  const dismissScreenRequest = (socketId) => setScreenRequests(prev => prev.filter(x => x.socketId !== socketId));
  const handleGrantScreen = (socketId) => {
    if (!token) return;
    if (!iAmPresenter) emitPresenterStart(token);
    emitScreenGrant(token, socketId);
  };

  const handleEndSession = () => { if (token) emitSessionEnd(token); };

  const handleOpenTimeline = async () => {
    setTimelineOpen(true);
    setTimelineLoading(true);
    try {
      const data = await collabApi.timeline(token, identity);
      setTimeline(data.timeline || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTimelineLoading(false);
    }
  };
  const closeTimeline = () => setTimelineOpen(false);

  return {
    mySocketId: mySocketIdRef.current,
    imageAreaRef,
    currentViewers, currentReadBy, currentItemBursts, visibleCursors,
    isSpotlit, iAmPresenter, iAmController,
    typingName,
    chatOpen, chatMessages, chatUnread, chatInput, setChatInput,
    presenterSocketId, presenterName, followingPresenter,
    spotlightToast,
    controllerSocketId, controllerName, controlRequests,
    swapOptions, swapOptionsLoading,
    timelineOpen, timeline, timelineLoading,
    screenRequests, sessionEnded,
    handleImageMouseMove, handleEmojiBurst, emitTyping,
    handleSendChat, toggleChat,
    handleTogglePresenter, handleToggleFollow, handleSpotlight,
    handleRequestControl, handleGrantControl, dismissControlRequest, handleRevokeControl,
    handleRequestScreen, handleGrantScreen, dismissScreenRequest, handleEndSession,
    handleOpenSwapOptions, handleControlSwap, cancelSwap,
    handleOpenTimeline, closeTimeline,
  };
}
