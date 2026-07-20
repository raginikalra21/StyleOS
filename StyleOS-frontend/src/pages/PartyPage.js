import React, { useState, useEffect, useRef } from 'react';

import { useParams } from 'react-router-dom';
import { party as partyApi, cart as cartApi } from '../services/api';
import { getSocket } from '../services/socket';
import './PartyPage.css';

const GUEST_KEY_PREFIX = 'styleos_party_guest_';

// Clash objects carry names + product ids, not the item itself — this finds
// the actual cart item (for its image) so the callout can show real photos
// instead of describing the clash in text alone.
function findClashItem(members, memberName, productId) {
  const member = members.find(m => m.name === memberName);
  return member?.items?.find(it => it.productId === productId) || null;
}

/**
 * CO-ATTENDEE mode — the Clash Engine (collab_cart_five_modes.md). Several
 * attendees, each with their own cart, in one room. No external trend data —
 * the clash signal is just the carts already here.
 */
export default function PartyPage({ overrideView }) {
  const { token: routeToken } = useParams();
  const token = routeToken || window.location.pathname.split('/')[2];
  const [party, setParty] = useState(null);
  const [members, setMembers] = useState([]);
  const [clashes, setClashes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);
  const [guest, setGuest] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GUEST_KEY_PREFIX + token)) || null; } catch { return null; }
  });
  const [myCarts, setMyCarts] = useState([]);
  const [selectedCartId, setSelectedCartId] = useState('');

  // --- Autopilot walkthrough script ---
  const urlParams = new URLSearchParams(window.location.search);
  const autopilot = urlParams.get('autopilot') === 'true';

  const orchestrateStarted = useRef(false);

  const scrollToViewportBottom = () => {
    const viewports = document.querySelectorAll('.phone-content-viewport');
    viewports.forEach(viewport => {
      setTimeout(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }, 100);
    });
  };

  useEffect(() => {
    if (clashes.length > 0) {
      scrollToViewportBottom();
    }
  }, [clashes]);

  useEffect(() => {
    if (!autopilot || orchestrateStarted.current) return;
    orchestrateStarted.current = true;

    // Auto-join if guest session not active
    const targetName = overrideView === 'deepak' ? 'Deepak' : 'Rahul';
    const targetToken = overrideView === 'deepak' ? 'deepak-guest-token' : 'rahul-guest-token';
    const g = { guestToken: targetToken, name: targetName };
    localStorage.setItem(GUEST_KEY_PREFIX + token, JSON.stringify(g));
    setGuest(g);
    load();
  }, [autopilot, overrideView, token]);

  useEffect(() => {
    if (!autopilot) return;

    const timer = setTimeout(() => {
      try {
        const state = JSON.parse(localStorage.getItem('styleos_autopilot_state') || '{}');
        if (state.weddingId) {
          window.location.href = `/mission/wedding/${state.weddingId}?autopilot=true`;
        }
      } catch (e) {
        console.error(e);
      }
    }, 12000); // 12 seconds to view the clash warning

    return () => clearTimeout(timer);
  }, [autopilot]);


  useEffect(() => {
    load();
    cartApi.list().then(setMyCarts).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!guest) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('join:party', { shareToken: token });

    socket.on('party:member_joined', () => load());
    socket.on('party:clash', ({ clashes: c }) => setClashes(c));

    return () => {
      socket.off('party:member_joined');
      socket.off('party:clash');
    };
  }, [guest, token]);

  async function load() {
    try {
      const data = await partyApi.get(token);
      setParty(data.party);
      setMembers(data.members || []);
      setClashes(data.clashes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!joinName.trim()) return;
    setJoining(true);
    try {
      const res = await partyApi.join(token, joinName.trim(), selectedCartId || undefined);
      const g = { guestToken: res.guestToken, name: res.name };
      localStorage.setItem(GUEST_KEY_PREFIX + token, JSON.stringify(g));
      setGuest(g);
      await load();
    } catch (err) {
      console.error(err);
      alert("Couldn't join right now — try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handleAttachCart(cartId) {
    setSelectedCartId(cartId);
    if (!guest) return;
    try {
      const res = await partyApi.updateCart(token, guest.guestToken, cartId);
      setClashes(res.clashes || []);
      await load();
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="party-loading"><div className="spinner" />Loading party...</div>;
  if (!party) return <div className="party-error">This party link doesn't lead anywhere.</div>;

  if (!guest) {
    return (
      <div className="party-join-screen">
        <div className="party-join-card">
          <span className="party-join-emoji">👀</span>
          <h2>{party.NAME || party.name || 'The Party'}</h2>
          <p>See what everyone's wearing before you get there — no clashes, no surprises.</p>
          <input
            placeholder="Your name"
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            autoFocus
          />
          {myCarts.length > 0 && (
            <select value={selectedCartId} onChange={e => setSelectedCartId(e.target.value)}>
              <option value="">Attach a cart later</option>
              {myCarts.map(c => (
                <option key={c.ID || c.id} value={c.ID || c.id}>{c.NAME || c.name}</option>
              ))}
            </select>
          )}
          <button className="btn-primary" onClick={handleJoin} disabled={!joinName.trim() || joining}>
            {joining ? 'Joining...' : "I'm in →"}
          </button>
        </div>
      </div>
    );
  }



  return (
    <div className="party-page">
      {autopilot && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(22, 24, 33, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #ec4899',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '50px',
          zIndex: 999999,
          boxShadow: '0 0 20px rgba(236,72,153,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.9rem',
          fontWeight: 600
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            background: '#ec4899',
            borderRadius: '50%',
            boxShadow: '0 0 8px #ec4899'
          }} />
          <span>🤖 <strong>StyleOS Auto-Pilot:</strong> Step 3/4 — Co-Attendee Clash Engine</span>
        </div>
      )}
      <div className="party-header">
        <h2>{party.NAME || party.name || 'The Party'}</h2>
        <span>{members.length} attendee{members.length === 1 ? '' : 's'}</span>
      </div>

      {clashes.length > 0 && (
        <div className="clash-callout">
          <div className="clash-callout-header">
            <span className="clash-siren">🚨</span>
            <span className="clash-callout-title">Twinning Alert!</span>
            <span className="clash-siren">🚨</span>
          </div>
          {clashes.map((c, i) => {
            const itemA = findClashItem(members, c.memberA, c.productIdA);
            const itemB = findClashItem(members, c.memberB, c.productIdB);
            return (
              <div key={i} className="clash-vs-card">
                <div className="clash-vs-side">
                  {itemA?.product?.images?.[0] && (
                    <img src={itemA.product.images[0]} alt="" className="clash-vs-img" />
                  )}
                  <span className="clash-vs-name">{c.memberA}</span>
                </div>
                <span className="clash-vs-bolt">⚡</span>
                <div className="clash-vs-side">
                  {itemB?.product?.images?.[0] && (
                    <img src={itemB.product.images[0]} alt="" className="clash-vs-img" />
                  )}
                  <span className="clash-vs-name">{c.memberB}</span>
                </div>
              </div>
            );
          })}
          <p className="clash-callout-detail">
            Both picked a {clashes[0].baseColour} {clashes[0].articleType?.toLowerCase()}
            {clashes[0].exact ? ' — literally the exact same one' : ''}. Someone's changing outfits 👀
          </p>
        </div>
      )}
      {clashes.length === 0 && members.filter(m => m.cartId).length > 1 && (
        <div className="no-clash-banner">✅ No clashes — everyone's set.</div>
      )}

      <div className="party-roster">
        <p className="party-roster-label">Who's in</p>
        {members.map((m, i) => (
          <div key={i} className="party-member-card">
            <div className="party-member-row">
              <span className="party-member-avatar">{(m.name || '?')[0].toUpperCase()}</span>
              <span className="party-member-name">{m.name}</span>
              <span className="party-member-status">
                {(() => {
                  if (!m.cartId) return 'no cart yet';
                  const qty = (m.items || []).reduce((s, it) => s + (it.quantity || 1), 0);
                  return `${qty} item${qty === 1 ? '' : 's'}`;
                })()}
              </span>
            </div>
            {m.items && m.items.length > 0 && (
              <div className="party-member-items">
                {m.items.map((it, idx) => (
                  <div key={idx} className={`party-item-thumb${it.isClash ? ' is-clash' : ''}`}>
                    {it.isClash && <span className="party-item-clash-badge">😱</span>}
                    {it.product?.images?.[0] && <img src={it.product.images[0]} alt={it.product.title} />}
                    <span className="party-item-price">₹{it.product?.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="party-my-cart">
        <p className="party-roster-label">Your cart</p>
        {myCarts.length === 0 ? (
          <p className="party-no-carts">No carts yet — build one with Kiya first, then come back here.</p>
        ) : (
          <select value={selectedCartId} onChange={e => handleAttachCart(e.target.value)}>
            <option value="">Choose a cart to compare</option>
            {myCarts.map(c => (
              <option key={c.ID || c.id} value={c.ID || c.id}>{c.NAME || c.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
