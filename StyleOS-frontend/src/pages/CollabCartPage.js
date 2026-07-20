import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collab as collabApi, agent as agentApi } from '../services/api';
import { getSocket, joinCollab, leaveCollab, joinMission } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { useCollabPresence } from '../hooks/useCollabPresence';
import LiveActionRail from '../components/collab/LiveActionRail';
import LiveBanners from '../components/collab/LiveBanners';
import LiveOverlay from '../components/collab/LiveOverlay';
import EngagementBar from '../components/collab/EngagementBar';
import ChatPanel from '../components/collab/ChatPanel';
import TimelinePanel from '../components/collab/TimelinePanel';
import PresenceBar from '../components/collab/PresenceBar';
import SharingControlsPanel from '../components/collab/SharingControlsPanel';
import JoinerControlsPanel from '../components/collab/JoinerControlsPanel';
import SessionEndScreen from '../components/collab/SessionEndScreen';
import CelebrationBurst from '../components/collab/CelebrationBurst';
import { getIsActualOwner } from '../helpers/collabOwnership';
import './CollabCartPage.css';
import '../pages/Mission.css'; // shared deadlock/escalation modal — same "winning moment" on both phones

const REACTIONS = [
  { type: 'love', emoji: '❤️', label: 'Love it' },
  { type: 'skip', emoji: '❌', label: 'Skip it' },
];

// Tap labels map straight onto convergence.js's reason classes (Section
// 3.1.2) — no LLM round-trip needed for the common taps, only "Say why"
// needs interpretation, and that's handled the same way free text always was.
const REJECT_REASONS = [
  { label: 'Too expensive', content: 'Too expensive' },
  { label: 'Not nice enough', content: 'Not nice enough for the occasion' },
  { label: 'Wrong colour', content: 'Wrong colour' },
  { label: "Not their style", content: "Not their style" },
];

const DEFAULT_MOM_GUEST = { guestToken: 'mom-guest-token', guestName: 'Mom' };

export default function CollabCartPage({ overrideView }) {
  const { token: routeToken } = useParams();
  const token = routeToken || window.location.pathname.split('/')[2];
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('cart'); // 'cart' | 'mission'
  const [cart, setCart] = useState(null);
  const [missionInfo, setMissionInfo] = useState(null); // { mission, events, missionMembers }
  const [slotItems, setSlotItems] = useState([]); // normalized mission slots -> item shape
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState(null); // 'auth' | 'notfound' | null

  // Zero-friction join (Section 3.2) — a family member never needs a
  // StyleOS account to weigh in. `guest` is null until they type a name.
  const [guest, setGuest] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`styleos_guest_${token}`)) || null; } catch { return null; }
  });
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);

  // Who actually sent this link — "Jai invited you," not "someone wants
  // your opinion." Fetched from the public preview endpoint so it's
  // available even before a guest has a name/token yet.
  const [ownerName, setOwnerName] = useState(null);
  // A visible "X just joined" moment for whoever's already in the room —
  // the live half of the invite loop, not just the static join screen.
  const [joinToast, setJoinToast] = useState(null);

  // "Mom is looking..." — live presence, no account required to show up.
  const [presence, setPresence] = useState([]); // [{ socketId, name }]
  const [leaveToast, setLeaveToast] = useState(null);
  const [celebrating, setCelebrating] = useState(false);
  // The invite link's live window has passed (Collab Cart Complete Session
  // UX Spec §1's "session stays live for" duration).
  const [expired, setExpired] = useState(false);

  // --- Autopilot walkthrough script ---
  const urlParams = new URLSearchParams(window.location.search);
  const view = overrideView || urlParams.get('view') || 'owner';
  const isGuestView = view === 'guest';
  const effectiveUser = isGuestView ? null : user;
  const effectiveGuest = isGuestView ? (guest || DEFAULT_MOM_GUEST) : guest;
  const identity = effectiveUser ? null : effectiveGuest; // null identity => collabApi uses the real Authorization header

  const items = mode === 'mission' ? slotItems : (cart?.items || []);
  const autopilot = urlParams.get('autopilot') === 'true';
  const updateToast = (msg) => {
    window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: msg }));
  };

  const scrollToViewportBottom = () => {
    const viewports = document.querySelectorAll('.phone-content-viewport');
    viewports.forEach(viewport => {
      setTimeout(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }, 100);
    });
  };

  // The whole Step 2 story is ONE item, two beats, in order:
  //   Beat 1 — Mom comments -> Rohan actually swaps the item -> Mom approves.
  //   Beat 2 — Dad sets a hard budget cap, sequenced clearly AFTER beat 1
  //            resolves, not interleaved with it.
  // Every hand-off between beats is driven by the real socket event the
  // matching action already emits, with a fallback timer as a backstop —
  // the same discipline as the Wedding Matrix fix, so a single dropped
  // event can't strand the walkthrough on this step either.
  const orchestrateStarted = useRef(false);
  const momApproveTriggered = useRef(false);
  const swapTriggered = useRef(false);
  const transitionStarted = useRef(false);
  const targetItemId = items[0]?.id;

  useEffect(() => {
    if (!autopilot || view !== 'guest' || orchestrateStarted.current) return;
    const socket = getSocket();

    const momApproveThenPayerLock = async () => {
      if (!momApproveTriggered.current) {
        momApproveTriggered.current = true;
        scrollToViewportBottom();
        await new Promise(r => setTimeout(r, 1800));
        updateToast("👩‍🦱 Mom reacting to the new pick...");
        try {
          await collabApi.react(token, targetItemId, 'love', 'Yes, this works! 😍', undefined, identity);
        } catch (e) { console.error(e); }
        await new Promise(r => setTimeout(r, 3000));
      }
      updateToast("👨 Dad setting Payer Lock...");
      try {
        await collabApi.setPayerLock(token, 8000, 1200, 'full', { guestToken: 'dad-guest-token', guestName: 'Dad (CFO)' });
      } catch (e) { console.error(e); }
    };

    const handleSwap = ({ cartItemId }) => {
      if (cartItemId === targetItemId) momApproveThenPayerLock();
    };
    socket.on('cart:item_swapped', handleSwap);
    // Fallback — if the swap never lands (dropped event, or no valid
    // alternative existed), Mom still moves the story forward on the item
    // as-is instead of the demo waiting on it forever.
    const swapFallback = setTimeout(momApproveThenPayerLock, 14000);

    const runGuestAutopilot = async () => {
      if (!items || items.length === 0) return;
      orchestrateStarted.current = true;

      const firstItem = items[0];
      updateToast("👩‍🦱 Mom swiping skip...");
      await new Promise(r => setTimeout(r, 3500));
      try {
        await collabApi.react(token, firstItem.id, 'skip', 'Too plain', undefined, identity);
      } catch (e) { console.error(e); }

      await new Promise(r => setTimeout(r, 2000));
      updateToast("👩‍🦱 Mom typing feedback...");
      const txt = "yeh itna plain hai, kuch aur dikhao";
      for (let i = 1; i <= txt.length; i++) {
        setComment(txt.slice(0, i));
        scrollToViewportBottom();
        await new Promise(r => setTimeout(r, 50));
      }

      await new Promise(r => setTimeout(r, 1500));
      try {
        await collabApi.react(token, firstItem.id, 'comment', txt, undefined, identity);
        setComment('');
        scrollToViewportBottom();
      } catch (e) { console.error(e); }

      // From here Mom is just watching — her next move (loving the swap +
      // Dad's Payer Lock) is triggered by the socket handler above, keyed
      // off what actually happens on Rohan's screen.
    };

    runGuestAutopilot();

    return () => { socket.off('cart:item_swapped', handleSwap); clearTimeout(swapFallback); };
  }, [autopilot, view, items.length, targetItemId, token, identity]);

  // Owner side — respond to Mom's comment with a real swap, then move on
  // once Dad's Payer Lock actually lands (not a blind wait "probably" long
  // enough to cover both beats).
  useEffect(() => {
    if (!autopilot || view !== 'owner' || !targetItemId) return;
    const socket = getSocket();

    const advanceToStep3 = async () => {
      if (transitionStarted.current) return;
      transitionStarted.current = true;
      await new Promise(r => setTimeout(r, 2500));
      updateToast("✅ Cart re-optimized under Dad's ₹8,000 cap!");
      await new Promise(r => setTimeout(r, 3000));
      updateToast("🚀 Transitioning to Step 3: Clash Engine...");
      await new Promise(r => setTimeout(r, 2000));
      try {
        const state = JSON.parse(localStorage.getItem('styleos_autopilot_state') || '{}');
        if (state.partyToken) {
          window.location.href = `/party/${state.partyToken}?autopilot=true`;
        }
      } catch (e) {
        console.error(e);
      }
    };

    const respondToComment = async (reaction) => {
      if (swapTriggered.current || reaction.type !== 'comment' || reaction.cartItemId !== targetItemId) return;
      swapTriggered.current = true;

      updateToast("👀 Rohan reading Mom's feedback...");
      await new Promise(r => setTimeout(r, 1800));
      updateToast("🔄 Finding something Mom will love...");
      try {
        const alt = await agentApi.alternatives(targetItemId);
        const pick = alt.alternatives?.[0];
        if (pick && cart?.id) {
          await new Promise(r => setTimeout(r, 1000));
          await agentApi.swap(cart.id, targetItemId, pick.id);
          updateToast(`✅ Swapped in "${pick.title}"`);
          await loadSession();
        }
      } catch (e) { console.error(e); }
    };

    socket.on('reaction:new', respondToComment);
    socket.on('payer_lock:updated', advanceToStep3);
    // Fallback — the same discipline as the deadlock fix: never let one
    // socket delivery be the only path off this step.
    const transitionFallback = setTimeout(advanceToStep3, 32000);

    return () => {
      socket.off('reaction:new', respondToComment);
      socket.off('payer_lock:updated', advanceToStep3);
      clearTimeout(transitionFallback);
    };
  }, [autopilot, view, targetItemId, cart?.id]);

  // Rejection reason chips — feeds the convergence engine directly.
  const [rejectingItemId, setRejectingItemId] = useState(null);
  const [rejectFreeText, setRejectFreeText] = useState('');

  // The winning moment (Section 3.1.3/3.1.4) — both phones see this, not
  // just the shopper's Matrix screen. Read-only here: resolution buttons
  // live on the owner's own Wedding Matrix screen.
  const [deadlock, setDeadlock] = useState(null);
  const [escalation, setEscalation] = useState(null);
  const [loopGuardMessage, setLoopGuardMessage] = useState(null);

  // Five Modes (collab_cart_five_modes.md) — which of the five relationships
  // this link models. Defaults to 'advisor', the original swipe/react flow.
  const [askMode, setAskMode] = useState('advisor');
  const [payerLock, setPayerLock] = useState({ budgetLock: null, itemPriceCap: null });
  const [tooMuchInput, setTooMuchInput] = useState('');
  const [showTooMuch, setShowTooMuch] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [peerDeadlock, setPeerDeadlock] = useState(null);
  const [recipientProfile, setRecipientProfile] = useState({ size: '', colours: '', avoid: '', notes: '' });
  const [profileSaved, setProfileSaved] = useState(false);

  // ADVISOR — live vote (Five Modes). "Which one?" is a completely
  // different question from Mom's "how much?" — this is entertainment,
  // not a chore, so it stays lightweight: fetch on demand, tally live.
  const [voteOptions, setVoteOptions] = useState(null); // { options, tally } | null
  const [voteLoading, setVoteLoading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const celebratedItemRef = useRef(null);



  useEffect(() => {
    loadSession(effectiveGuest);
  }, [token, effectiveUser, effectiveGuest]);

  // Pre-join preview — runs specifically for the case loadSession skips
  // (no account, no guest token yet), so the join screen can still say who
  // actually invited them instead of a generic prompt.
  useEffect(() => {
    if (effectiveUser || effectiveGuest || !token) return;
    collabApi.preview(token).then(data => {
      if (data.expired) { setExpired(true); return; }
      setOwnerName(data.ownerName);
    }).catch(() => {});
  }, [token, effectiveUser, effectiveGuest]);

  useEffect(() => {
    setRejectingItemId(null);
  }, [currentIndex]);

  useEffect(() => {
    if (!token || (!effectiveUser && !effectiveGuest)) return;

    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const handleConnect = () => {
      joinCollab(token, effectiveUser?.name || effectiveGuest?.guestName);
      if (missionInfo?.mission?.ID || missionInfo?.mission?.id) {
        joinMission(missionInfo.mission.ID || missionInfo.mission.id);
      }
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on('connect', handleConnect);

    socket.on('presence:join', ({ socketId, name }) => {
      setPresence(prev => prev.some(p => p.socketId === socketId) ? prev : [...prev, { socketId, name }]);
    });
    socket.on('presence:leave', ({ socketId, name }) => {
      setPresence(prev => {
        const leaving = prev.find(p => p.socketId === socketId);
        const label = leaving?.name || name;
        if (label) {
          setLeaveToast(`${label} left`);
          setTimeout(() => setLeaveToast(null), 4000);
        }
        return prev.filter(p => p.socketId !== socketId);
      });
    });

    socket.on('mission:deadlock', (payload) => setDeadlock(payload));
    socket.on('mission:escalation', (payload) => setEscalation(payload));
    socket.on('mission:loop_guard', ({ message }) => {
      setLoopGuardMessage(message);
      setTimeout(() => setLoopGuardMessage(null), 6000);
    });

    // PEER mode — shuttle diplomacy (Five Modes). Same "winning moment" as
    // the mission deadlock, just triggered on a shared cart item instead of
    // a wedding slot.
    socket.on('peer:deadlock', (payload) => setPeerDeadlock(payload));
    socket.on('peer:resolved', () => { setPeerDeadlock(null); loadSession(); });

    // APPROVER mode — the Payer Lock changing (someone said "too much" and
    // the cart re-solved) should refresh everyone's view live.
    socket.on('payer_lock:updated', () => { loadSession(); scrollToViewportBottom(); });

    // The owner swapping an item (e.g. in response to a comment) should be
    // visible on a reviewer's screen immediately, not just after their next
    // manual reload — a family member is watching THIS cart, live.
    socket.on('cart:item_swapped', ({ cartItemId, product }) => {
      scrollToViewportBottom();
      setCart(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item =>
            item.id === cartItemId ? { ...item, product, _justSwapped: true } : item
          ),
        };
      });
      setTimeout(() => {
        setCart(prev => {
          if (!prev) return prev;
          return { ...prev, items: prev.items.map(item => item.id === cartItemId ? { ...item, _justSwapped: false } : item) };
        });
      }, 1400);
    });

    // ADVISOR mode — live vote tally, the cheapest joy per line of code.
    socket.on('vote:updated', ({ cartItemId, tally }) => {
      setVoteOptions(prev => (prev && prev.cartItemId === cartItemId) ? { ...prev, tally } : prev);
    });

    socket.on('reaction:new', (reaction) => {
      scrollToViewportBottom();
      if (mode === 'mission') {
        setSlotItems(prev => prev.map(it =>
          it.id === reaction.missionSlotId
            ? { ...it, reactions: [...(it.reactions || []), reaction] }
            : it
        ));
      } else {
        setCart(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(item =>
              item.id === reaction.cartItemId
                ? { ...item, reactions: [...(item.reactions || []), reaction] }
                : item
            ),
          };
        });
      }
    });

    socket.on('member:joined', (member) => {
      setMembers(prev => [...prev, member]);
      setJoinToast(`${member.name || 'Someone'} just joined 👋`);
      setTimeout(() => setJoinToast(null), 4500);
    });

    socket.on('cart:reconciled', () => { loadSession(); });
    socket.on('mission:slot_filled', () => { loadSession(); });
    socket.on('mission:orchestrate_done', () => { loadSession(); });

    return () => {
      socket.off('connect', handleConnect);
      leaveCollab(token);
      socket.off('presence:join');
      socket.off('presence:leave');
      socket.off('mission:deadlock');
      socket.off('mission:escalation');
      socket.off('mission:loop_guard');
      socket.off('peer:deadlock');
      socket.off('peer:resolved');
      socket.off('payer_lock:updated');
      socket.off('cart:item_swapped');
      socket.off('vote:updated');
      socket.off('reaction:new');
      socket.off('member:joined');
      socket.off('cart:reconciled');
      socket.off('mission:slot_filled');
      socket.off('mission:orchestrate_done');
    };
  }, [effectiveUser, effectiveGuest, token, mode, missionInfo]);

  async function loadSession(guestOverride) {
    setLoading(true);
    setLoadError(null);
    const activeGuest = guestOverride !== undefined ? guestOverride : effectiveGuest;
    if (!effectiveUser && !activeGuest) {
      // No account, no guest name yet — render the join screen instead of
      // an auth wall. This is the whole point of Section 3.2.
      setLoading(false);
      return;
    }
    try {
      if (effectiveUser) { try { await collabApi.join(token); } catch {} }
      const data = await collabApi.get(token, effectiveUser ? null : activeGuest);
      if (data.expired) { setExpired(true); setLoading(false); return; }
      setMembers(data.members || []);
      setOwnerName(data.ownerName || null);

      const sessionData = data.session || {};
      setAskMode(sessionData.ASK_MODE || sessionData.askMode || 'advisor');
      setPayerLock({
        budgetLock: sessionData.BUDGET_LOCK ?? sessionData.budgetLock ?? null,
        itemPriceCap: sessionData.ITEM_PRICE_CAP ?? sessionData.itemPriceCap ?? null,
      });

      if (data.mode === 'mission') {
        setMode('mission');
        setMissionInfo({ mission: data.mission, events: data.events, missionMembers: data.missionMembers });

        const eventName = Object.fromEntries((data.events || []).map(e => [e.id, e.name]));
        const memberName = Object.fromEntries((data.missionMembers || []).map(m => [m.id, m.name]));

        const normalized = (data.slots || [])
          .filter(s => s.status === 'filled' && s.product)
          .map(s => ({
            id: s.id, isMissionSlot: true, missionSlotId: s.id,
            eventId: s.eventId, memberId: s.memberId,
            eventName: eventName[s.eventId], memberName: memberName[s.memberId],
            product: s.product, reactions: s.reactions || [],
          }));
        setSlotItems(normalized);
      } else {
        setMode('cart');
        setCart(data.cart);
      }
    } catch (err) {
      console.error(err);
      if (err.status === 401 && activeGuest) {
        // Stale guest token (e.g. the session was recreated) — clear it and
        // fall back to the join screen rather than a dead-end error page.
        localStorage.removeItem(`styleos_guest_${token}`);
        setGuest(null);
      } else if (err.status !== 401) {
        setLoadError('notfound');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestJoin() {
    if (!joinName.trim()) return;
    setJoining(true);
    try {
      const res = await collabApi.guestJoin(token, joinName.trim());
      const g = { guestToken: res.guestToken, guestName: res.name };
      localStorage.setItem(`styleos_guest_${token}`, JSON.stringify(g));
      setGuest(g);
      setLoading(true);
      await loadSession(g);
    } catch (err) {
      console.error(err);
      alert("Couldn't join right now — try again in a moment.");
    } finally {
      setJoining(false);
    }
  }

  const currentItem = items[currentIndex];
  const images = currentItem?.product?.images || [];
  const currentItemJustSwapped = Boolean(currentItem && currentItem._justSwapped);
  const isActualOwner = getIsActualOwner(mode, cart, missionInfo, effectiveUser);

  const {
    mySocketId, imageAreaRef,
    currentViewers, currentReadBy, currentItemBursts, visibleCursors,
    isSpotlit, iAmPresenter, iAmController,
    typingName,
    chatOpen, chatMessages, chatUnread, chatInput, setChatInput,
    presenterName, followingPresenter,
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
  } = useCollabPresence({
    token, identity, items, currentItem, effectiveUser, effectiveGuest, presence,
    onNavigate: (idx) => { setCurrentIndex(idx); setCurrentImageIndex(0); },
  });

  const productCardClassName = 'collab-product-card'
    + (currentItemJustSwapped ? ' item-swapped-flash' : '')
    + (isSpotlit ? ' item-spotlit' : '');

  const handleCommentChange = (val) => {
    setComment(val);
    emitTyping();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 40) {
      if (dy < 0 && currentIndex < items.length - 1) {
        setCurrentIndex(i => i + 1);
        setCurrentImageIndex(0);
      } else if (dy > 0 && currentIndex > 0) {
        setCurrentIndex(i => i - 1);
        setCurrentImageIndex(0);
      }
    } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0 && currentImageIndex < images.length - 1) {
        setCurrentImageIndex(i => i + 1);
      } else if (dx > 0 && currentImageIndex > 0) {
        setCurrentImageIndex(i => i - 1);
      }
    }
  };

  const handleReact = async (type, content = '') => {
    if (!currentItem) return;
    // Ambient reaction float (Collab Cart Complete Session UX Spec §5) — a
    // love tap floats up on everyone's screen live, not just the count.
    if (type === 'love') handleEmojiBurst('❤️');
    try {
      if (mode === 'mission') {
        await collabApi.react(token, null, type, content, currentItem.missionSlotId, identity);
      } else {
        await collabApi.react(token, currentItem.id, type, content, undefined, identity);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // "Skip it" no longer fires blind — it opens the reason-chip row so the
  // rejection carries a classifiable reason into the convergence engine
  // (Section 3.1.2) instead of an empty string that teaches it nothing.
  const handleStartReject = () => {
    if (!currentItem) return;
    setRejectingItemId(currentItem.id);
    setRejectFreeText('');
  };

  const handleRejectReason = async (content) => {
    await handleReact('skip', content);
    setRejectingItemId(null);
    setRejectFreeText('');
  };

  const handleComment = async () => {
    if (!comment.trim() || !currentItem) return;
    try {
      if (mode === 'mission') {
        await collabApi.react(token, null, 'comment', comment, currentItem.missionSlotId, identity);
      } else {
        await collabApi.react(token, currentItem.id, 'comment', comment, undefined, identity);
      }
      setComment('');
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        try {
          if (mode === 'mission') {
            await collabApi.voice(token, null, blob, currentItem.missionSlotId, identity);
          } else {
            await collabApi.voice(token, currentItem.id, blob, undefined, identity);
          }
        } catch (err) {
          console.error('Voice upload failed:', err);
        }
      };
      mr.start();
      setIsRecording(true);
    } catch {
      alert('Microphone access needed for voice notes');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const result = await collabApi.reconcile(token, identity);
      setReconcileResult(result);
      await loadSession();
    } catch (err) {
      console.error(err);
    } finally {
      setReconciling(false);
    }
  };

  // APPROVER — the Payer Lock (Five Modes). One tap sets the fence; every
  // /shop call for this cart then treats item_price_cap as a hard ceiling.
  const handleApproveLock = async () => {
    setLockSaving(true);
    try {
      const currentTotal = cart?.totalPrice || cart?.TOTAL_PRICE || 0;
      await collabApi.setPayerLock(token, currentTotal, payerLock.itemPriceCap, 'full', identity);
      await loadSession();
    } catch (err) {
      console.error(err);
    } finally {
      setLockSaving(false);
    }
  };

  const handleTooMuch = async () => {
    const newBudget = parseInt(tooMuchInput.replace(/[^\d]/g, ''), 10);
    if (!newBudget) return;
    setLockSaving(true);
    try {
      await collabApi.setPayerLock(token, newBudget, payerLock.itemPriceCap, 'full', identity);
      setShowTooMuch(false);
      setTooMuchInput('');
      await loadSession();
    } catch (err) {
      console.error(err);
    } finally {
      setLockSaving(false);
    }
  };

  // PROXY — recipient profile (Five Modes). Buyer-entered, best-effort;
  // honestly partial rather than pretending to pull real account history.
  const handleSaveRecipientProfile = async () => {
    try {
      await collabApi.setRecipientProfile(token, recipientProfile, identity);
      setProfileSaved(true);
    } catch (err) {
      console.error(err);
    }
  };

  // PEER — shuttle diplomacy resolution (Five Modes).
  const handleResolvePeerDeadlock = async (resolution) => {
    if (!peerDeadlock) return;
    try {
      await collabApi.resolvePeerDeadlock(token, peerDeadlock.cartItemId, resolution, identity);
      setPeerDeadlock(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ADVISOR — live vote (Five Modes).
  const handleOpenVote = async () => {
    if (!currentItem) return;
    setVoteLoading(true);
    try {
      const data = await collabApi.voteOptions(token, currentItem.id, identity);
      setVoteOptions({ cartItemId: currentItem.id, options: data.options, tally: data.tally });
    } catch (err) {
      console.error(err);
    } finally {
      setVoteLoading(false);
    }
  };

  const handleCastVote = async (productId) => {
    if (!currentItem) return;
    try {
      const data = await collabApi.vote(token, currentItem.id, productId, identity);
      setVoteOptions(prev => prev ? { ...prev, tally: data.tally } : prev);
    } catch (err) {
      console.error(err);
    }
  };

  const myReactions = currentItem?.reactions?.filter(r =>
    effectiveUser ? r.userId === effectiveUser.id : (effectiveGuest && r.user?.name === effectiveGuest.guestName)
  ) || [];
  const allReactions = currentItem?.reactions || [];

  // "Everyone agreed" (Collab Cart Complete Session UX Spec §5) — every
  // currently-present reviewer has loved the item on screen. Fires once
  // per item, not on every re-render.
  useEffect(() => {
    if (!currentItem || presence.length === 0) return;
    const loveNames = new Set(allReactions.filter(r => r.type === 'love').map(r => r.user?.name));
    const everyoneLoved = presence.every(p => loveNames.has(p.name));
    if (!everyoneLoved) return;
    if (celebratedItemRef.current === currentItem.id) return;
    celebratedItemRef.current = currentItem.id;
    setCelebrating(true);
    setTimeout(() => setCelebrating(false), 2600);
  }, [currentItem, allReactions, presence]);

  if (loading) return <div className="collab-loading"><div className="spinner" />Loading wardrobe...</div>;

  if (expired) {
    return <SessionEndScreen expired onBack={() => navigate(effectiveUser ? '/agent' : '/')} />;
  }

  if (sessionEnded) {
    return <SessionEndScreen byName={sessionEnded.byName} onBack={() => navigate(effectiveUser ? '/agent' : '/')} />;
  }

  // Zero-friction join (Section 3.2) — no account, just a name. The person
  // whose opinion was asked for should never hit a login wall to give it.
  if (!effectiveUser && !effectiveGuest) {
    return (
      <div className="collab-join-screen">
        <div className="collab-join-card">
          <span className="collab-join-emoji">👋</span>
          <h2>{ownerName ? `${ownerName} invited you!` : 'Who\'s this?'}</h2>
          <p>{ownerName ? `${ownerName} wants your take on their wardrobe.` : 'Someone wants your take on their wardrobe.'} No account needed — just your name.</p>
          <input
            className="collab-join-input"
            placeholder="e.g. Mom, Rhea, Dad..."
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGuestJoin()}
            autoFocus
            maxLength={40}
          />
          <button className="btn-primary" onClick={handleGuestJoin} disabled={!joinName.trim() || joining}>
            {joining ? 'Joining...' : 'Take a look →'}
          </button>
          <button className="collab-join-alt" onClick={() => navigate('/login', { state: { from: `/collab/${token}` } })}>
            I have a StyleOS account
          </button>
        </div>
      </div>
    );
  }

  if (loadError === 'notfound' || (mode === 'cart' && !cart) || (mode === 'mission' && !missionInfo)) {
    return <div className="collab-error">This link doesn't lead anywhere — the wardrobe may have been removed.</div>;
  }

  const headerTitle = mode === 'mission'
    ? (missionInfo.mission.TITLE || missionInfo.mission.title)
    : cart.name;
  const cartTotalValue = cart.totalPrice || 0;
  const itemQuantityTotal = items.reduce((s, it) => s + (it.quantity || 1), 0);
  const headerSub = mode === 'mission'
    ? `${items.length} outfits filled`
    : `₹${cartTotalValue.toLocaleString()} · ${itemQuantityTotal} items`;



  return (
    <div className="collab-page">
      {/* Header */}
      <div className="collab-header">
        <button className="collab-back" onClick={() => navigate(-1)}>←</button>
        <div className="collab-title">
          <h2>{headerTitle}</h2>
          <span>{headerSub}</span>
        </div>
        <div className="collab-members">
          {members.slice(0, 3).map((m, i) => (
            <div key={i} className="member-avatar" title={m.user?.name || m.name}>
              {(m.user?.name || m.name || '?')[0].toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* Live top bar (Collab Cart Complete Session UX Spec §3a) */}
      <PresenceBar presence={presence} hasOwnerish={isActualOwner} onEndSession={handleEndSession} />

      <LiveActionRail chatUnread={chatUnread} onToggleChat={toggleChat} onOpenTimeline={handleOpenTimeline} />

      {/* Sharing controls — owner gets the four-button panel (§3c), joiner
          gets the mirrored request buttons (§4b). Mode is 'cart'-only:
          mission/Wedding-Matrix collab keeps its existing council flow. */}
      {mode === 'cart' && (
        isActualOwner ? (
          <SharingControlsPanel
            iAmPresenter={iAmPresenter} onToggleScreen={handleTogglePresenter}
            presence={presence} controllerSocketId={controllerSocketId} controllerName={controllerName}
            onGrantControl={handleGrantControl} onRevokeControl={handleRevokeControl}
            isSpotlit={isSpotlit} onSpotlight={handleSpotlight} hasCurrentItem={Boolean(currentItem)}
            onAskToVote={handleOpenVote} voteLoading={voteLoading}
          />
        ) : (
          <JoinerControlsPanel
            presenterName={presenterName} followingPresenter={followingPresenter} onToggleFollow={handleToggleFollow}
            onRequestScreen={handleRequestScreen}
            iAmController={iAmController} controllerName={controllerName}
            onRequestControl={handleRequestControl} onRevokeControl={handleRevokeControl}
          />
        )
      )}

      <LiveBanners
        controlRequests={controlRequests} onGrantControl={handleGrantControl} onDismissRequest={dismissControlRequest}
        screenRequests={screenRequests} onGrantScreen={handleGrantScreen} onDismissScreenRequest={dismissScreenRequest}
        spotlightToast={spotlightToast}
      />

      {loopGuardMessage && (
        <div className="matrix-loopguard-toast">⏸ {loopGuardMessage}</div>
      )}

      {joinToast && (
        <div className="join-toast">🎉 {joinToast}</div>
      )}

      {leaveToast && (
        <div className="leave-toast">👋 {leaveToast}</div>
      )}

      <CelebrationBurst show={celebrating} />

      {/* APPROVER — the Payer Lock (Five Modes). Mom is a CFO and a risk
          officer, not a stylist — one number, one tap, not thirty items to
          review. */}
      {mode === 'cart' && askMode === 'approver' && (
        <div className="approver-card">
          <span className="approver-emoji">💳</span>
          <h2>{itemQuantityTotal} items · ₹{cartTotalValue.toLocaleString('en-IN')}</h2>
          <p className="approver-sub">That's the total. Nothing hidden, nothing to scroll through.</p>

          {payerLock.budgetLock ? (
            <div className="approver-locked">
              <p>Approved up to ₹{payerLock.budgetLock.toLocaleString('en-IN')}</p>
              {payerLock.itemPriceCap && <p className="approver-cap">Nothing over ₹{payerLock.itemPriceCap.toLocaleString('en-IN')} per item</p>}
            </div>
          ) : showTooMuch ? (
            <div className="approver-too-much">
              <input
                placeholder="What's your number?"
                value={tooMuchInput}
                onChange={e => setTooMuchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTooMuch()}
                inputMode="numeric"
              />
              <button className="btn-primary" onClick={handleTooMuch} disabled={lockSaving}>Set budget</button>
            </div>
          ) : (
            <div className="approver-actions">
              <button className="btn-primary" onClick={handleApproveLock} disabled={lockSaving}>
                {lockSaving ? 'Approving...' : '✅ Approve'}
              </button>
              <button className="btn-secondary" onClick={() => setShowTooMuch(true)}>Too much</button>
            </div>
          )}
        </div>
      )}

      {/* PROXY — "who is this for" extended to identity (Five Modes). The
          buyer's cart, sized/coloured for someone else — the recipient
          never sees this screen if they open the same link later; the
          buyer never needs to ask for a size. */}
      {mode === 'cart' && askMode === 'proxy' && !profileSaved && (
        <div className="proxy-card">
          <span className="proxy-emoji">🎁</span>
          <h2>Shopping for {cart.recipientName || 'someone'}</h2>
          <p className="proxy-sub">Tell us what you know — even a little helps. This stays private; they won't see this cart.</p>
          <input placeholder="Their size, if you know it" value={recipientProfile.size}
            onChange={e => setRecipientProfile(p => ({ ...p, size: e.target.value }))} />
          <input placeholder="Colours they wear a lot" value={recipientProfile.colours}
            onChange={e => setRecipientProfile(p => ({ ...p, colours: e.target.value }))} />
          <input placeholder="Anything to avoid" value={recipientProfile.avoid}
            onChange={e => setRecipientProfile(p => ({ ...p, avoid: e.target.value }))} />
          <button className="btn-primary" onClick={handleSaveRecipientProfile}>Save</button>
          <button className="proxy-skip" onClick={() => setProfileSaved(true)}>I don't know — surprise me</button>
        </div>
      )}

      {/* PEER — shuttle diplomacy (Five Modes). Two people, no hierarchy,
          same item, opposite reasons — the machine absorbs the conflict so
          the relationship doesn't have to. */}
      {peerDeadlock && (
        <div className="deadlock-overlay" onClick={() => setPeerDeadlock(null)}>
          <div className="deadlock-card" onClick={e => e.stopPropagation()}>
            <div className="deadlock-title">Two opinions, one item</div>
            <div className="deadlock-body">
              <div className="deadlock-line">
                <span>{peerDeadlock.conflict?.maxPriceSetByName} said too expensive</span>
                <span className="deadlock-arrow">↓ up to ₹{peerDeadlock.conflict?.maxPrice?.toLocaleString('en-IN')}</span>
              </div>
              <div className="deadlock-line">
                <span>{peerDeadlock.conflict?.minPriceSetByName} said not nice enough</span>
                <span className="deadlock-arrow">↑ needs ₹{peerDeadlock.conflict?.minPrice?.toLocaleString('en-IN')}+</span>
              </div>
            </div>
            <p className="deadlock-explain">Neither of you has to be the one who gives in — let Kiya find the middle.</p>
            <div className="deadlock-actions">
              <button onClick={() => handleResolvePeerDeadlock('go_with_min')}>Go with {peerDeadlock.conflict?.minPriceSetByName}'s pick</button>
              <button onClick={() => handleResolvePeerDeadlock('go_with_max')}>Go with {peerDeadlock.conflict?.maxPriceSetByName}'s pick</button>
              <button onClick={() => handleResolvePeerDeadlock('split')}>Split the difference</button>
            </div>
          </div>
        </div>
      )}

      {/* The winning moment (Section 3.1.4) — both phones see this, not just
          the shopper's own Matrix screen. Read-only here: the owner resolves
          it from their Wedding Matrix, everyone else just sees why things
          paused. */}
      {deadlock && (
        <div className="deadlock-overlay" onClick={() => setDeadlock(null)}>
          <div className="deadlock-card" onClick={e => e.stopPropagation()}>
            <div className="deadlock-title">Two opinions, one budget</div>
            <div className="deadlock-body">
              <div className="deadlock-line">
                <span>{deadlock.conflict?.maxPriceSetByName} said too expensive</span>
                <span className="deadlock-arrow">↓ up to ₹{deadlock.conflict?.maxPrice?.toLocaleString('en-IN')}</span>
              </div>
              <div className="deadlock-line">
                <span>{deadlock.conflict?.minPriceSetByName} said not nice enough</span>
                <span className="deadlock-arrow">↑ needs ₹{deadlock.conflict?.minPrice?.toLocaleString('en-IN')}+</span>
              </div>
            </div>
            <p className="deadlock-explain">
              {deadlock.memberName}'s {deadlock.eventName} pick is waiting on the family to make the call — StyleOS won't guess between you.
            </p>
            <button className="btn-secondary" onClick={() => setDeadlock(null)} style={{ width: '100%' }}>Got it</button>
          </div>
        </div>
      )}
      {escalation && (
        <div className="deadlock-overlay" onClick={() => setEscalation(null)}>
          <div className="deadlock-card" onClick={e => e.stopPropagation()}>
            <div className="deadlock-title">Running out of strict matches</div>
            <p className="deadlock-explain">
              {escalation.memberName}'s {escalation.eventName} outfit has been rejected {escalation.rejectionCount} times — StyleOS is checking back with the family instead of guessing again.
            </p>
            {escalation.rules?.length > 0 && (
              <ul className="escalation-rules">
                {escalation.rules.map((rule, i) => <li key={i}>{rule}</li>)}
              </ul>
            )}
            <button className="btn-secondary" onClick={() => setEscalation(null)} style={{ width: '100%' }}>Got it</button>
          </div>
        </div>
      )}

      {/* Product card — full screen swipeable */}
      {currentItem && (
        <div
          className={productCardClassName}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Image area */}
          <div
            className="collab-image-area"
            ref={imageAreaRef}
            onMouseMove={handleImageMouseMove}
            onTouchMove={handleImageMouseMove}
          >
            <LiveOverlay
              visibleCursors={visibleCursors}
              currentViewers={currentViewers}
              bursts={currentItemBursts}
            />

            {images.length > 0 ? (
              <img
                src={images[currentImageIndex]}
                alt={currentItem.product?.title}
                className="collab-product-image"
                onError={e => { e.target.src = 'https://via.placeholder.com/400x500?text=No+Image'; }}
              />
            ) : (
              <div className="collab-no-image">
                <span>👕</span>
                <p>{currentItem.product?.articleType}</p>
              </div>
            )}

            {images.length > 1 && (
              <div className="image-dots">
                {images.map((_, i) => (
                  <span key={i} className={`dot ${i === currentImageIndex ? 'active' : ''}`} />
                ))}
              </div>
            )}

            <div className="price-badge">
              ₹{currentItem.product?.price?.toLocaleString()}
              {currentItem.product?.mrp > currentItem.product?.price && (
                <span className="original-price"> MRP ₹{currentItem.product?.mrp?.toLocaleString()}</span>
              )}
            </div>

            <div className="product-counter">{currentIndex + 1} / {items.length}</div>
          </div>

          {/* Product info */}
          <div className="collab-product-info">
            {mode === 'mission' ? (
              <p className="product-brand">{currentItem.memberName} · {currentItem.eventName}</p>
            ) : (
              <p className="product-brand">{currentItem.product?.brand}</p>
            )}
            <p className="product-title">{currentItem.product?.title}</p>
            <div className="product-tags">
              {currentItem.product?.baseColour && <span className="tag">{currentItem.product.baseColour}</span>}
              {currentItem.product?.fabric && <span className="tag">{currentItem.product.fabric}</span>}
              {currentItem.product?.deliveryDays && <span className="tag">🚚 {currentItem.product.deliveryDays} days</span>}
            </div>

            <button
              className="view-product-btn"
              onClick={() => navigate(`/product/${currentItem.product?.id}`)}
            >
              View Product ↗
            </button>
          </div>

          {/* Reactions */}
          <div className="collab-reactions">
            <div className="reaction-buttons">
              {REACTIONS.map(r => {
                const myCount = myReactions.filter(mr => mr.type === r.type).length;
                return (
                  <button
                    key={r.type}
                    className={`reaction-btn ${myCount > 0 ? 'active' : ''}`}
                    onClick={() => r.type === 'skip' ? handleStartReject() : handleReact(r.type)}
                  >
                    {r.emoji} {allReactions.filter(mr => mr.type === r.type).length || ''}
                  </button>
                );
              })}

              <button
                className={`reaction-btn voice-btn ${isRecording ? 'recording' : ''}`}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
              >
                {isRecording ? '🔴' : '🎤'}
              </button>

              {askMode === 'advisor' && (
                <button className="reaction-btn vote-btn" onClick={handleOpenVote} disabled={voteLoading}>
                  {voteLoading ? '⏳' : '🗳️'}
                </button>
              )}
            </div>

            <EngagementBar
              onBurst={handleEmojiBurst}
              currentReadBy={currentReadBy}
              iAmController={iAmController} mode={mode}
              swapOptions={swapOptions} swapOptionsLoading={swapOptionsLoading}
              onOpenSwapOptions={handleOpenSwapOptions} onControlSwap={handleControlSwap}
              onCancelSwap={cancelSwap}
            />

            {/* ADVISOR — live vote (Five Modes). "Which one?" not "how
                much?" — a different question, judged by people who aren't
                paying and have no veto, so it stays fun, not a chore. */}
            {voteOptions && voteOptions.cartItemId === currentItem.id && (
              <div className="vote-panel">
                <p className="vote-label">Which one?</p>
                <div className="vote-options">
                  {voteOptions.options.map(opt => {
                    const count = voteOptions.tally[opt.id] || 0;
                    const total = Object.values(voteOptions.tally).reduce((a, b) => a + b, 0) || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <button key={opt.id} className="vote-option" onClick={() => handleCastVote(opt.id)}>
                        {opt.images?.[0] && <img src={opt.images[0]} alt={opt.title} />}
                        <span className="vote-option-title">{opt.title}</span>
                        <span className="vote-option-price">₹{opt.price?.toLocaleString('en-IN')}</span>
                        {count > 0 && (
                          <span className="vote-bar-wrap">
                            <span className="vote-bar" style={{ width: `${pct}%` }} />
                            <span className="vote-count">{count} vote{count === 1 ? '' : 's'}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button className="vote-close" onClick={() => setVoteOptions(null)}>Close</button>
              </div>
            )}

            {/* Rejection reason chips — feeds the convergence engine a
                classifiable reason instead of a bare "skip" (Section 3.1.2). */}
            {rejectingItemId === currentItem.id && (
              <div className="reject-reason-row">
                <p className="reject-reason-label">Why not this one?</p>
                <div className="reject-reason-chips">
                  {REJECT_REASONS.map(r => (
                    <button key={r.label} className="reject-reason-chip" onClick={() => handleRejectReason(r.content)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="comment-row">
                  <input
                    className="comment-input"
                    value={rejectFreeText}
                    onChange={e => setRejectFreeText(e.target.value)}
                    placeholder="Or say why in your own words..."
                    onKeyDown={e => e.key === 'Enter' && rejectFreeText.trim() && handleRejectReason(rejectFreeText.trim())}
                  />
                  <button
                    className="comment-send"
                    onClick={() => rejectFreeText.trim() && handleRejectReason(rejectFreeText.trim())}
                  >
                    Send
                  </button>
                </div>
                <button className="reject-reason-cancel" onClick={() => setRejectingItemId(null)}>Cancel</button>
              </div>
            )}

            {typingName && <p className="typing-indicator-line">{typingName} is typing…</p>}
            <div className="comment-row">
              <input
                className="comment-input"
                value={comment}
                onChange={e => handleCommentChange(e.target.value)}
                placeholder={mode === 'mission' ? "Why? e.g. 'too bright, something darker'" : "Add a comment..."}
                onKeyDown={e => e.key === 'Enter' && handleComment()}
              />
              <button className="comment-send" onClick={handleComment}>Send</button>
            </div>

            {allReactions.length > 0 && (
              <div className="reactions-list">
                {allReactions.slice(-3).map((r, i) => (
                  <div key={i} className="reaction-item">
                    <span className="reaction-user">{r.user?.name?.split(' ')[0]}</span>
                    <span className="reaction-content">
                      {r.type === 'love' ? '❤️' : r.type === 'skip' ? '❌' : '💬'} {r.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="swipe-hints">
            {currentIndex > 0 && <div className="hint-top">↑ Swipe up for previous</div>}
            {currentIndex < items.length - 1 && <div className="hint-bottom">↓ Swipe down for next</div>}
          </div>
        </div>
      )}

      {/* Bottom bar — AI reconcile */}
      <div className="collab-bottom-bar">
        {reconcileResult ? (
          <div className="reconcile-result">
            ✅ {reconcileResult.message || `Applied ${reconcileResult.actions?.length || 0} changes`}
          </div>
        ) : (
          <button
            className="reconcile-btn"
            onClick={handleReconcile}
            disabled={reconciling}
          >
            {reconciling
              ? '🔄 AI is updating...'
              : mode === 'mission' ? '✨ Re-harmonize vetoed picks' : '✨ Update cart with feedback'}
          </button>
        )}
      </div>

      {/* Product strip at bottom */}
      <div className="product-strip">
        {items.map((item, i) => (
          <button
            key={item.id}
            className={`strip-item ${i === currentIndex ? 'active' : ''}`}
            onClick={() => { setCurrentIndex(i); setCurrentImageIndex(0); }}
          >
            {item.product?.images?.[0]
              ? <img src={item.product.images[0]} alt="" onError={e => e.target.style.display='none'} />
              : <span>👕</span>
            }
          </button>
        ))}
      </div>

      {/* Async-first (Section 3.2) — nobody's opinion blocks the mission.
          The shopper (who has the account) started this; the people giving
          feedback shouldn't feel like they're holding anything up. */}
      <p className="collab-async-note">
        Take your time — {mode === 'mission' ? 'the wedding wardrobe' : 'the cart'} won't wait on any one reply, and every reaction updates it the moment you send it.
      </p>

      {chatOpen && (
        <ChatPanel
          mySocketId={mySocketId}
          chatMessages={chatMessages}
          chatInput={chatInput} setChatInput={setChatInput}
          onSend={handleSendChat} onClose={toggleChat}
        />
      )}

      {timelineOpen && (
        <TimelinePanel
          loading={timelineLoading}
          timeline={timeline}
          onClose={closeTimeline}
          canCheckout={Boolean(isActualOwner && mode === 'cart' && cart?.id)}
          onCheckout={() => navigate(`/cart/${cart?.id}`)}
        />
      )}

      {/* DEMO ASSIST DRAWER PANEL */}
      {user && user.email === 'demo_user@styleos.test' && !autopilot && (
        <div className="demo-assist-widget">
          <div className="demo-assist-title">✨ DEMO ASSIST</div>
          <div className="demo-assist-buttons">
            <button onClick={async () => {
              if (!currentItem) return;
              const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
              try {
                await fetch(`${BASE}/collab/${token}/react`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-guest-token': 'mom-guest-token' },
                  body: JSON.stringify({ cartItemId: currentItem.id, type: 'skip', content: 'Too plain' })
                });
                await fetch(`${BASE}/collab/${token}/react`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-guest-token': 'mom-guest-token' },
                  body: JSON.stringify({ cartItemId: currentItem.id, type: 'comment', content: 'yeh itna plain hai, let us get the blue one instead' })
                });
                loadSession();
              } catch (e) { console.error(e); }
            }}>
              👩‍🦱 Mom: ❌ + Comment
            </button>
            <button onClick={async () => {
              if (!currentItem) return;
              const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
              try {
                await fetch(`${BASE}/collab/${token}/react`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-guest-token': 'brother-guest-token' },
                  body: JSON.stringify({ cartItemId: currentItem.id, type: 'love' })
                });
                loadSession();
              } catch (e) { console.error(e); }
            }}>
              👦 Brother: ❤️ Love
            </button>
            <button onClick={async () => {
              const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
              try {
                await fetch(`${BASE}/collab/${token}/payer-lock`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-guest-token': 'dad-guest-token' },
                  body: JSON.stringify({ budgetLock: 8000, itemPriceCap: 1200, detailLevel: 'full' })
                });
                loadSession();
              } catch (e) { console.error(e); }
            }}>
              👨 Dad: Payer Lock (₹8k)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
