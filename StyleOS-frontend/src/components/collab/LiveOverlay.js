import React from 'react';

// Lives inside .collab-image-area: other reviewers' live cursors and
// "viewing this item" avatars (Tier 1), plus floating emoji bursts (Tier 2).
// Split out of CollabCartPage.js alongside LiveActionRail — same reason.
export default function LiveOverlay({ visibleCursors, currentViewers, bursts }) {
  return (
    <>
      {visibleCursors.map(c => (
        <div key={c.socketId} className="live-cursor-dot" style={{ left: `${c.xPct}%`, top: `${c.yPct}%` }}>
          <span className="live-cursor-label">{c.name}</span>
        </div>
      ))}

      {currentViewers.length > 0 && (
        <div className="viewing-badge-row">
          {currentViewers.slice(0, 4).map(v => {
            const initial = v.name ? v.name.charAt(0).toUpperCase() : '?';
            return (
              <div key={v.socketId} className="viewing-badge" title={`${v.name} is looking at this`}>
                {initial}
              </div>
            );
          })}
        </div>
      )}

      {bursts.map(b => (
        <span key={b.id} className="emoji-burst" style={{ left: `${b.x}%` }}>{b.emoji}</span>
      ))}
    </>
  );
}
