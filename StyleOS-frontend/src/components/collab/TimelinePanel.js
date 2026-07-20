import React from 'react';

// Tier 6 — session replay, built only from what's actually persisted
// (reactions + joins). Presence/cursors/chat are live-only and
// intentionally excluded — see the backend's /collab/:token/timeline route.
// Split out of CollabCartPage.js alongside LiveActionRail — same reason.

const TIMELINE_ICONS = { joined: '👋', love: '❤️', skip: '❌', comment: '💬', voice: '🎤', vote: '🗳️' };

function describeTimelineEvent(ev) {
  switch (ev.type) {
    case 'joined': return 'joined the wardrobe';
    case 'love': return `loved${ev.itemTitle ? ` "${ev.itemTitle}"` : ' an item'}`;
    case 'skip': return `skipped${ev.itemTitle ? ` "${ev.itemTitle}"` : ' an item'}${ev.content ? ` — ${ev.content}` : ''}`;
    case 'comment': return `commented${ev.itemTitle ? ` on "${ev.itemTitle}"` : ''}: "${ev.content}"`;
    case 'voice': return `left a voice note${ev.itemTitle ? ` on "${ev.itemTitle}"` : ''}`;
    case 'vote': return `voted on${ev.itemTitle ? ` "${ev.itemTitle}"` : ' an item'}`;
    default: return ev.type;
  }
}

function TimelineRow({ ev }) {
  const icon = TIMELINE_ICONS[ev.type] || '•';
  const description = describeTimelineEvent(ev);
  const when = new Date(ev.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="timeline-item">
      <span className="timeline-dot">{icon}</span>
      <div className="timeline-item-body">
        <p className="timeline-item-line">
          <strong>{ev.name}</strong> {description}
        </p>
        <span className="timeline-item-time">{when}</span>
      </div>
    </div>
  );
}

export default function TimelinePanel({ loading, timeline, onClose, canCheckout, onCheckout }) {
  return (
    <div className="timeline-overlay" onClick={onClose}>
      <div className="timeline-panel" onClick={e => e.stopPropagation()}>
        <div className="timeline-panel-header">
          <span>🕘 Session timeline</span>
          <button onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <p className="timeline-loading">Loading...</p>
        ) : timeline.length === 0 ? (
          <p className="timeline-empty">Nothing yet — reactions and joins will show up here as they happen.</p>
        ) : (
          <div className="timeline-list">
            {timeline.map((ev, i) => <TimelineRow key={i} ev={ev} />)}
          </div>
        )}
        <p className="timeline-resume-note">This picks up right where everyone left off — nothing here is lost on refresh.</p>
        {canCheckout && (
          <button className="btn-primary timeline-checkout-btn" onClick={onCheckout}>
            Head to checkout →
          </button>
        )}
      </div>
    </div>
  );
}
