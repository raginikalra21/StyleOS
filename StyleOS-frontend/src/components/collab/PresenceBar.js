import React from 'react';

// The live top bar (Collab Cart Complete Session UX Spec §3a) — a pulsing
// LIVE indicator, everyone currently present, and (owner-only) an End
// session control. Split out of CollabCartPage.js alongside the other
// collab components — same reason.
export default function PresenceBar({ presence, hasOwnerish, onEndSession }) {
  if (presence.length === 0 && !hasOwnerish) return null;

  return (
    <div className="presence-bar">
      {presence.length > 0 && (
        <span className="presence-live-dot">🔴 LIVE</span>
      )}
      <div className="presence-avatars">
        {presence.slice(0, 5).map(p => (
          <div key={p.socketId} className="presence-avatar" title={p.name}>
            {(p.name || '?')[0].toUpperCase()}
          </div>
        ))}
        {presence.length === 0 && <span className="presence-empty">Waiting for anyone to join...</span>}
      </div>
      {hasOwnerish && (
        <button className="presence-end-btn" onClick={onEndSession} title="End session">⏹ End</button>
      )}
    </div>
  );
}
