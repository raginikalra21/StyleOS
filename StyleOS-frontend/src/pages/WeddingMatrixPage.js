import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mission as missionApi, collab as collabApi } from '../services/api';
import { getSocket } from '../services/socket';
import { joinMission } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import './Mission.css';

const COLOUR_SWATCH = {
  Yellow: '#f4d03f', Green: '#58b368', Mustard: '#c9a227', Orange: '#e8863c',
  Pink: '#e685b5', Purple: '#8e6bbf', Maroon: '#7b2d3a', Gold: '#d4af37',
  Red: '#c0392b', 'Navy Blue': '#1b2a4a', Silver: '#b0b3b8', Black: '#222',
};

function slotKey(eventId, memberId) { return `${eventId}::${memberId}`; }

export default function WeddingMatrixPage({ overrideView }) {
  const { id: routeId } = useParams();
  const id = routeId || window.location.pathname.split('/')[3];
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mission, setMission] = useState(null);
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [slotMap, setSlotMap] = useState({}); // key -> slot
  const [spent, setSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [rejections, setRejections] = useState([]);
  const [rejecting, setRejecting] = useState(null); // slotKey currently showing reason input
  const [reasonText, setReasonText] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [resolvingEventId, setResolvingEventId] = useState(null);
  const [resolvingMessage, setResolvingMessage] = useState('');
  const [orchestrateError, setOrchestrateError] = useState('');
  const [stalled, setStalled] = useState(false);
  const [deadlock, setDeadlock] = useState(null); // { slotId, eventId, memberId, eventName, memberName, conflict } | null
  const [escalation, setEscalation] = useState(null); // { slotId, eventId, memberId, report } | null
  const [loopGuardMessage, setLoopGuardMessage] = useState('');
  const [resolvingDeadlock, setResolvingDeadlock] = useState(false);
  const updateToast = (msg) => {
    window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: msg }));
  };

  // --- Autopilot walkthrough script ---
  const urlParams = new URLSearchParams(window.location.search);
  const autopilot = urlParams.get('autopilot') === 'true';
  const view = overrideView || urlParams.get('view') || 'owner';

  const scrollCellIntoView = (eventId, memberId) => {
    setTimeout(() => {
      const cellEl = document.getElementById(`cell-${eventId}-${memberId}`);
      if (cellEl) {
        cellEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 100);
  };

  const scrollToViewportBottom = () => {
    const viewports = document.querySelectorAll('.phone-content-viewport');
    viewports.forEach(viewport => {
      setTimeout(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }, 100);
    });
  };

  useEffect(() => {
    if (deadlock) {
      scrollToViewportBottom();
    }
  }, [deadlock]);

  const rejectionStarted = useRef(false);
  const deadlockResolved = useRef(false);
  const orchestrateStarted = useRef(false);


  useEffect(() => {
    if (!autopilot || view !== 'guest' || rejectionStarted.current) return;

    const runAutopilot = async () => {
      if (events.length === 0 || members.length === 0) return;
      rejectionStarted.current = true;

      const ev = events.find(e => e.name === 'Mehendi');
      const mem = members.find(m => m.name === 'Sneha (Sister)');
      if (!ev || !mem) return;

      await new Promise(r => setTimeout(r, 10000));
      updateToast("👩‍🦱 Simulating Sister Sneha rejecting Mehendi Kurta (₹1,296)...");
      try {
        await missionApi.rejectSlot(id, ev.id, mem.id, 'too plain, looks cheap', 'Sneha (Sister)');
      } catch (e) { console.error(e); }
    };

    runAutopilot();
  }, [autopilot, view, events.length, members.length]);

  useEffect(() => {
    if (!autopilot || !deadlock || deadlockResolved.current) return;
    deadlockResolved.current = true;

    const resolveAutopilotDeadlock = async () => {
      await new Promise(r => setTimeout(r, 4000));
      updateToast("🤖 Price Deadlock Detected! Resolving via 'Meet in the Middle' compromise...");
      await new Promise(r => setTimeout(r, 1500));
      try {
        await handleResolveDeadlock('split');
      } catch (e) { console.error(e); }

      await new Promise(r => setTimeout(r, 8000));
      updateToast("🎉 Wedding wardrobe coordinated! Heading to Checkout Bag...");
      await new Promise(r => setTimeout(r, 2000));
      window.location.href = `/myntra-bag?autopilot=true`;
    };

    resolveAutopilotDeadlock();
  }, [autopilot, deadlock]);

  useEffect(() => {
    if (autopilot && stalled) {
      updateToast("🔄 Reharmonizer connection lost. Auto-retrying...");
      const timer = setTimeout(() => {
        handleRetry();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [autopilot, stalled]);

  const lastProgressRef = useRef(Date.now());
  const stallTimerRef = useRef(null);

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const handleConnect = () => {
      joinMission(id);
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on('connect', handleConnect);

    const markProgress = () => { lastProgressRef.current = Date.now(); setStalled(false); };

    socket.on('mission:reharmonize_start', (data) => {
      markProgress();
      setResolvingEventId(data.eventId);
      setResolvingMessage(data.message);
    });

    socket.on('mission:slot_shopping', (data) => {
      markProgress();
      if (data.memberId) {
        setSelectedMemberId(data.memberId);
      }
      setSlotMap(prev => ({
        ...prev,
        [slotKey(data.eventId, data.memberId)]: {
          ...(prev[slotKey(data.eventId, data.memberId)] || {}),
          status: 'shopping', statusMessage: data.message, _reharmonize: !!data.reharmonize,
        },
      }));
      scrollCellIntoView(data.eventId, data.memberId);
    });

    socket.on('mission:slot_filled', (data) => {
      markProgress();
      if (data.memberId) {
        setSelectedMemberId(data.memberId);
      }
      load(); // Refresh comments and notes from DB
      const isRealUpdate = !data.kept;
      setSlotMap(prev => ({
        ...prev,
        [slotKey(data.eventId, data.memberId)]: {
          ...(prev[slotKey(data.eventId, data.memberId)] || {}),
          status: 'filled', product: data.product, note: data.note,
          _pulse: isRealUpdate, _reharmonize: false,
        },
      }));
      scrollCellIntoView(data.eventId, data.memberId);
      if (isRealUpdate) {
        setTimeout(() => {
          setSlotMap(prev => {
            const k = slotKey(data.eventId, data.memberId);
            if (!prev[k]) return prev;
            return { ...prev, [k]: { ...prev[k], _pulse: false } };
          });
        }, 900);
      }
    });

    socket.on('mission:slot_failed', (data) => {
      markProgress();
      setSlotMap(prev => ({
        ...prev,
        [slotKey(data.eventId, data.memberId)]: {
          ...(prev[slotKey(data.eventId, data.memberId)] || {}), status: 'failed', statusMessage: data.message,
        },
      }));
    });

    socket.on('mission:orchestrate_done', (data) => {
      markProgress();
      setSpent(data.spent || 0);
      // Hold the column highlight a beat after the last cell settles so the
      // re-harmonize reads as one deliberate motion, not a snap.
      setTimeout(() => { setResolvingEventId(null); setResolvingMessage(''); }, 500);
    });

    // Previously unhandled entirely — a backend orchestration error just
    // vanished into the void, leaving every cell stuck at "···" forever
    // with no feedback and no way to recover except abandoning the page.
    socket.on('mission:orchestrate_error', (data) => {
      setOrchestrateError(data?.message || 'Something went wrong building the matrix.');
    });

    // Section 3.1.4 — the deadlock screen. Two people's learned constraints
    // on the same slot became mutually unsatisfiable; stop searching and
    // hand the decision back explicitly rather than looping.
    socket.on('mission:deadlock', (data) => {
      markProgress();
      setSlotMap(prev => ({
        ...prev,
        [slotKey(data.eventId, data.memberId)]: { ...(prev[slotKey(data.eventId, data.memberId)] || {}), status: 'filled' },
      }));
      setDeadlock(data);
    });

    // Section 3.1.3 attempt 5 — stopped searching, reporting instead.
    socket.on('mission:escalation', (data) => {
      markProgress();
      setEscalation(data);
    });

    // Section 3.1.5 — a global loop guard tripped (slot/cart rejection cap
    // or rate limit). Quieter than deadlock/escalation — just a message.
    socket.on('mission:loop_guard', (data) => {
      markProgress();
      setLoopGuardMessage(data.message);
      setTimeout(() => setLoopGuardMessage(''), 6000);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('mission:reharmonize_start');
      socket.off('mission:slot_shopping');
      socket.off('mission:slot_filled');
      socket.off('mission:slot_failed');
      socket.off('mission:orchestrate_done');
      socket.off('mission:orchestrate_error');
      socket.off('mission:deadlock');
      socket.off('mission:escalation');
      socket.off('mission:loop_guard');
    };
  }, [id]);

  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      const target = view === 'guest'
        ? members.find(m => m.name.includes('Sneha')) || members[0]
        : members[0];
      setSelectedMemberId(target.id);
    }
  }, [members, selectedMemberId, view]);

  async function load() {
    try {
      const data = await missionApi.get(id);
      setMission(data.mission);
      setEvents(data.events);
      setMembers(data.members);
      setSpent(data.spent || 0);
      setRejections(data.rejections || []);

      const map = {};
      for (const s of data.slots) {
        map[slotKey(s.eventId, s.memberId)] = s;
      }
      setSlotMap(map);
      setLoading(false);

      // Previously only triggered when EVERY slot was still pending, so a
      // page reload mid-orchestration (some slots already filled, others
      // stuck) would never resume the stragglers — they'd sit at "···"
      // forever. Any unresolved slot is enough to (re-)kick it off.
      const hasUnresolved = data.slots.some(s => s.status === 'pending' || s.status === 'rejected');
      if (hasUnresolved && !orchestrateStarted.current) {
        orchestrateStarted.current = true;
        startOrchestrate();
      }
    } catch (err) {
      setLoading(false);
    }
  }

  function startOrchestrate() {
    setOrchestrateError('');
    setStalled(false);
    lastProgressRef.current = Date.now();
    missionApi.orchestrate(id).catch((err) => {
      setOrchestrateError(err.message || 'Could not start building the matrix.');
    });
  }

  const handleRetry = () => {
    orchestrateStarted.current = true;
    startOrchestrate();
  };

  // Stall watchdog — if 20s pass with zero progress events while cells are
  // still unresolved, surface a retry option instead of leaving the user
  // staring at spinning "···" cells with no idea whether it's still working.
  useEffect(() => {
    stallTimerRef.current = setInterval(() => {
      const totalSlots = events.length * members.length;
      const unresolvedCount = Object.values(slotMap).filter(s => s.status === 'pending' || s.status === 'shopping').length
        + Math.max(0, totalSlots - Object.keys(slotMap).length);
      if (totalSlots > 0 && unresolvedCount > 0 && Date.now() - lastProgressRef.current > 20000) {
        setStalled(true);
      }
    }, 3000);
    return () => clearInterval(stallTimerRef.current);
  }, [events.length, members.length, slotMap]);

  const handleReject = async (eventId, memberId) => {
    const key = slotKey(eventId, memberId);
    const reason = reasonText.trim();
    setRejecting(null);
    setReasonText('');
    setSlotMap(prev => ({ ...prev, [key]: { ...prev[key], status: 'shopping', statusMessage: 'Re-solving...' } }));
    try {
      await missionApi.rejectSlot(id, eventId, memberId, reason);
      load();
    } catch (err) {}
  };

  const handleResolveDeadlock = async (resolution) => {
    if (!deadlock || resolvingDeadlock) return;
    setResolvingDeadlock(true);
    try {
      await missionApi.resolveDeadlock(id, deadlock.eventId, deadlock.memberId, resolution);
      setDeadlock(null);
    } catch (err) {
      console.error(err);
    } finally {
      setResolvingDeadlock(false);
    }
  };

  const handleResolveEscalation = async (option) => {
    if (!escalation || resolvingDeadlock) return;
    setResolvingDeadlock(true);
    try {
      await missionApi.resolveEscalation(id, escalation.eventId, escalation.memberId, option.action, option.value);
      setEscalation(null);
    } catch (err) {
      console.error(err);
    } finally {
      setResolvingDeadlock(false);
    }
  };

  const handleShareCouncil = async () => {
    setSharing(true);
    try {
      const { shareUrl: url } = await collabApi.createForMission(id);
      setShareUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  const budget = mission?.TOTAL_BUDGET || mission?.totalBudget || 0;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const totalSlots = events.length * members.length;
  const settledCount = Object.values(slotMap).filter(s => s.status === 'filled' || s.status === 'failed').length;
  const allSlotsSettled = totalSlots > 0 && settledCount === totalSlots;
  const selectedMember = members.find(m => m.id === selectedMemberId);

  if (loading) return <div className="mission-loading">Loading the matrix...</div>;
  if (!mission) return <div className="mission-loading">Mission not found.</div>;

  return (
    <div className="matrix-page">
      <div className="matrix-header">
        <button className="matrix-back" onClick={() => navigate('/mission')}>← Back</button>
        <div>
          <h1>{mission.TITLE || mission.title}</h1>
          <p className="matrix-sub">{mission.COMMUNITY || mission.community} · {mission.CITY || mission.city}</p>
        </div>
        <div className="matrix-share">
          {shareUrl ? (
            <a
              className="matrix-share-btn"
              href={`https://wa.me/?text=${encodeURIComponent(`Come weigh in on the wedding wardrobe! 💍 ${shareUrl}`)}`}
              target="_blank" rel="noopener noreferrer"
            >
              📱 Share on WhatsApp
            </a>
          ) : (
            <button className="matrix-share-btn" onClick={handleShareCouncil} disabled={sharing}>
              {sharing ? 'Creating link...' : '👨‍👩‍👧 Invite Family Council'}
            </button>
          )}
        </div>
      </div>

      {(orchestrateError || stalled) && (
        <div className="matrix-error-banner">
          <div>
            <strong>Reharmonizer stalled.</strong>
            {orchestrateError ? ` Error: ${orchestrateError}` : ' This is taking longer than expected — let\'s try that again.'}
          </div>
          <button onClick={handleRetry}>Retry</button>
        </div>
      )}

      {loopGuardMessage && (
        <div className="matrix-loopguard-toast">
          ⚠️ <strong>Guard:</strong> {loopGuardMessage}
        </div>
      )}

      {deadlock && (
        <div className="deadlock-overlay" onClick={() => {}}>
          <div className="deadlock-card">
            <div className="deadlock-title">⚠️ You two want different things.</div>
            <div className="deadlock-body">
              <div className="deadlock-line">
                <strong>{deadlock.conflict.maxPriceSetByName}</strong> says: "too expensive"
                <span className="deadlock-arrow">→ wants under ₹{deadlock.conflict.maxPrice?.toLocaleString('en-IN')}</span>
              </div>
              <div className="deadlock-line">
                <strong>{deadlock.conflict.minPriceSetByName}</strong> says: "not nice enough"
                <span className="deadlock-arrow">→ wants above ₹{deadlock.conflict.minPrice?.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <p className="deadlock-explain">I can't satisfy both. Someone has to choose:</p>
            <div className="deadlock-actions">
              <button disabled={resolvingDeadlock} onClick={() => handleResolveDeadlock('go_with_max')}>
                Go with {deadlock.conflict.maxPriceSetByName} — ₹{deadlock.conflict.maxPrice?.toLocaleString('en-IN')} range
              </button>
              <button disabled={resolvingDeadlock} onClick={() => handleResolveDeadlock('go_with_min')}>
                Go with {deadlock.conflict.minPriceSetByName} — ₹{deadlock.conflict.minPrice?.toLocaleString('en-IN')} range
              </button>
              <button disabled={resolvingDeadlock} onClick={() => handleResolveDeadlock('split')}>
                Meet in the middle — ₹{Math.round(((deadlock.conflict.minPrice || 0) + (deadlock.conflict.maxPrice || 0)) / 2).toLocaleString('en-IN')}, borrow if needed
              </button>
            </div>
          </div>
        </div>
      )}

      {escalation && (
        <div className="deadlock-overlay">
          <div className="deadlock-card">
            <div className="deadlock-title">I'm stuck on {escalation.report.memberName}'s {escalation.report.eventName} outfit.</div>
            <p className="deadlock-explain">
              You've turned down {escalation.report.rejectionCount} options. Here's what I learned:
            </p>
            <ul className="escalation-rules">
              {escalation.report.rules.map((rule, i) => <li key={i}>✗ {rule}</li>)}
            </ul>
            <p className="deadlock-explain">
              Those rules together leave {escalation.report.currentCount} item{escalation.report.currentCount === 1 ? '' : 's'} in range.
            </p>
            <div className="deadlock-actions">
              {escalation.report.options.map((opt, i) => (
                <button key={i} disabled={resolvingDeadlock} onClick={() => handleResolveEscalation(opt)}>
                  {opt.label}{opt.opensCount ? ` — opens ${opt.opensCount} more` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {resolvingEventId && (
        <div className="reharmonize-banner">
          <span className="reharmonize-avatar">🧑‍🎨</span>
          <span>Rethinking this wardrobe...</span>
        </div>
      )}

      {allSlotsSettled && !resolvingEventId && (
        <div className="lookbook-banner" style={{ marginBottom: '16px' }}>
          <span className="lookbook-emoji">🎉</span>
          <div className="lookbook-copy">
            <div className="lookbook-headline">The Lookbook is ready.</div>
            <div className="lookbook-detail">
              {members.length} people, {events.length} ceremonies, every outfit coordinated.
            </div>
            <div className="lookbook-figure">
              <span className="lookbook-spent">₹{spent.toLocaleString()}</span>
              <span className="lookbook-of"> of ₹{budget.toLocaleString()}</span>
            </div>
            <button className="lookbook-view-btn" onClick={() => navigate(`/lookbook/mission/${id}`)}>
              View Lookbook →
            </button>
          </div>
        </div>
      )}

      <div className="portal-container">
        {/* Side panel */}
        <div className="portal-sidebar">
          <div className="portal-sidebar-title">Family Council</div>
          {members.map(mem => {
            // Calculate filled progress count for this member
            const filledCount = events.filter(ev => {
              const slot = slotMap[slotKey(ev.id, mem.id)];
              return slot?.status === 'filled';
            }).length;
            
            const avatars = {
              'Rohan (Groom)': '🤵',
              'Sneha (Sister)': '👩‍🦱',
              'Dad': '👨',
              'Mom': '👩'
            };
            const avatar = avatars[mem.name] || (mem.gender === 'Women' ? '👩' : '👨');
            
            return (
              <button
                key={mem.id}
                className={`portal-member-item ${selectedMemberId === mem.id ? 'active' : ''}`}
                onClick={() => setSelectedMemberId(mem.id)}
              >
                <span className="portal-member-avatar">{avatar}</span>
                <div className="portal-member-info">
                  <span className="portal-member-name">{mem.name.split(' ')[0]}</span>
                  <span className="portal-member-relation">{filledCount} of {events.length} filled</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Member Wardrobe content */}
        {selectedMember && (
          <div className="portal-content">
            <div className="portal-member-header">
              <h2>{selectedMember.name}'s Wardrobe</h2>
              <span className="portal-member-header-meta">
                Spent: ₹{events.reduce((acc, ev) => acc + (slotMap[slotKey(ev.id, selectedMember.id)]?.product?.price || 0), 0).toLocaleString()}
              </span>
            </div>

            <div className="portal-events-feed">
              {events.map(ev => {
                const key = slotKey(ev.id, selectedMember.id);
                const slot = slotMap[key];
                const isRejecting = rejecting === key;
                const isColumnResolving = resolvingEventId === ev.id;
                
                // Filter rejections for this specific slot
                const slotRejections = rejections.filter(r => r.SLOT_KEY === key);

                return (
                  <div
                    key={ev.id}
                    id={`cell-${ev.id}-${selectedMember.id}`}
                    className={`portal-event-card ${slot?.status === 'shopping' ? 'active-shopping' : ''}`}
                  >
                    <div className="portal-event-card-header">
                      <span className="portal-event-name">
                        <span className="portal-event-palette-dot" style={{ background: COLOUR_SWATCH[ev.paletteFamily?.[0]] || '#ccc' }} />
                        {ev.name}
                      </span>
                      <span className="portal-event-palette-tag">
                        {ev.paletteFamily?.join(', ')}
                      </span>
                    </div>

                    {(!slot || slot.status === 'pending') && (
                      <div className="portal-outfit-pending">
                        <div className="portal-outfit-pending-pulse" />
                        Pending selection...
                      </div>
                    )}

                    {slot?.status === 'shopping' && (
                      <div className="portal-outfit-pending">
                        <div className="portal-outfit-pending-spinner" />
                        {slot.statusMessage || 'Searching matching styles...'}
                      </div>
                    )}

                    {slot?.status === 'failed' && (
                      <div className="portal-outfit-pending" style={{ color: 'red', borderColor: 'red' }}>
                        No matching outfit found.
                      </div>
                    )}

                    {slot?.status === 'filled' && slot.product && !isRejecting && (
                      <div className="portal-outfit-container">
                        <div className="portal-outfit-image-wrapper">
                          {slot.product.images?.[0] && (
                            <img className="portal-outfit-image" src={slot.product.images[0]} alt={slot.product.title} onError={e => { e.target.style.display = 'none'; }} />
                          )}
                        </div>
                        <div className="portal-outfit-details">
                          <span className="portal-outfit-brand">{slot.product.brand || 'Myntra Design'}</span>
                          <span className="portal-outfit-title">{slot.product.title}</span>
                          <div className="portal-outfit-price-row">
                            <span className="portal-outfit-price">₹{slot.product.price?.toLocaleString()}</span>
                            {slot.note && (
                              <span className="portal-outfit-compromise-badge">{slot.note}</span>
                            )}
                          </div>

                          {/* Reject button (only if not already rejected, and during autopilot/regular view) */}
                          {view === 'guest' && selectedMember.name.includes('Sneha') && ev.name === 'Mehendi' && (
                            <div className="portal-outfit-action-row">
                              <button
                                className="portal-reject-btn"
                                onClick={() => { setRejecting(key); setReasonText(''); }}
                              >
                                ✕ Reject pick
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isRejecting && (
                      <div className="cell-reject-form" style={{ marginTop: '8px', padding: '0 4px' }}>
                        <input
                          autoFocus
                          placeholder="Why? e.g. 'too dull, looks very plain'"
                          value={reasonText}
                          onChange={e => setReasonText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleReject(ev.id, selectedMember.id); if (e.key === 'Escape') setRejecting(null); }}
                        />
                        <div className="cell-reject-actions" style={{ marginTop: '6px' }}>
                          <button onClick={() => handleReject(ev.id, selectedMember.id)}>✕ Reject</button>
                          <button onClick={() => setRejecting(null)}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Threaded comments left on this slot */}
                    {slotRejections.length > 0 && (
                      <div className="portal-outfit-comments-box">
                        <div className="portal-comments-title">Feedback Thread</div>
                        <div className="portal-comments-list">
                          {slotRejections.map(rej => (
                            <div key={rej.ID || rej.id} className="portal-comment-row">
                              <span className="portal-comment-user">{rej.REJECTED_BY_NAME || 'Collaborator'}</span>
                              <span className="portal-comment-text">"{rej.REASON_TEXT}"</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="matrix-budget-bar">
        <div className="budget-bar-track">
          <div className="budget-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="budget-bar-label">
          ₹{spent.toLocaleString()} of ₹{budget.toLocaleString()} spent ({pct}%)
        </div>
      </div>

      {/* DEMO ASSIST DRAWER PANEL */}
      {user && user.email === 'demo_user@styleos.test' && !autopilot && (
        <div className="demo-assist-widget">
          <div className="demo-assist-title">✨ DEMO ASSIST</div>
          <div className="demo-assist-buttons">
            <button onClick={async () => {
              const ev = events.find(e => e.name === 'Mehendi');
              const mem = members.find(m => m.name === 'Sneha (Sister)');
              if (!ev || !mem) return;
              try {
                await missionApi.rejectSlot(id, ev.id, mem.id, 'too dull, looks very plain', 'Sneha (Sister)');
              } catch (e) { console.error(e); }
            }}>
              👩‍🦱 Sister: ✕ Reject Mehendi
            </button>
            <button onClick={async () => {
              try {
                await missionApi.orchestrate(id);
              } catch (e) { console.error(e); }
            }}>
              ✨ Trigger Re-solve / Shop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

