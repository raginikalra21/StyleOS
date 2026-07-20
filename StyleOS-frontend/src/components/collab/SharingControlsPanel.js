import React, { useState } from 'react';

// Owner's live-session sharing controls (Collab Cart Complete Session UX
// Spec §3c) — four distinct capabilities, not one generic "share" button:
// show my screen (Tier 3 follow-me, broadcast), let someone control the
// cart (Tier 4, directed grant), spotlight one item for everyone (Tier 3),
// and push a live vote (Tier 2/Five-Modes advisor). Split out of
// CollabCartPage.js alongside the other collab components — same reason
// (keeps the page's own hook/JSX footprint down).
export default function SharingControlsPanel({
  iAmPresenter, onToggleScreen,
  presence, controllerSocketId, controllerName, onGrantControl, onRevokeControl,
  isSpotlit, onSpotlight, hasCurrentItem,
  onAskToVote, voteLoading,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const others = presence; // already excludes self by the time it reaches here

  return (
    <div className="sharing-controls-panel">
      <p className="sharing-controls-title">Shop this together</p>
      <div className="sharing-controls-grid">
        <button className={`sharing-control-btn ${iAmPresenter ? 'active' : ''}`} onClick={onToggleScreen}>
          <span className="sharing-control-emoji">👁</span>
          <span>{iAmPresenter ? 'Stop showing' : 'Show my screen'}</span>
        </button>

        {controllerSocketId ? (
          <button className="sharing-control-btn active" onClick={onRevokeControl}>
            <span className="sharing-control-emoji">🖐</span>
            <span>Take back control</span>
          </button>
        ) : (
          <button className="sharing-control-btn" onClick={() => setPickerOpen(o => !o)} disabled={others.length === 0}>
            <span className="sharing-control-emoji">🖐</span>
            <span>Let them control</span>
          </button>
        )}

        <button className={`sharing-control-btn ${isSpotlit ? 'active' : ''}`} onClick={onSpotlight} disabled={!hasCurrentItem}>
          <span className="sharing-control-emoji">✨</span>
          <span>{isSpotlit ? 'Stop spotlight' : 'Spotlight an item'}</span>
        </button>

        <button className="sharing-control-btn" onClick={onAskToVote} disabled={!hasCurrentItem || voteLoading}>
          <span className="sharing-control-emoji">📊</span>
          <span>{voteLoading ? 'Loading...' : 'Ask them to vote'}</span>
        </button>
      </div>

      {controllerSocketId && (
        <p className="sharing-controls-note">🖐 {controllerName} is in control right now</p>
      )}

      {pickerOpen && !controllerSocketId && (
        <div className="member-picker">
          <p className="member-picker-label">Who should control the cart?</p>
          {others.length === 0 ? (
            <p className="member-picker-empty">Nobody else has joined yet.</p>
          ) : (
            others.map(m => (
              <button
                key={m.socketId}
                className="member-picker-row"
                onClick={() => { onGrantControl(m.socketId); setPickerOpen(false); }}
              >
                <span className="member-picker-avatar">{(m.name || '?')[0].toUpperCase()}</span>
                <span>{m.name}</span>
                <span className="member-picker-grant">Grant →</span>
              </button>
            ))
          )}
          <button className="member-picker-cancel" onClick={() => setPickerOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
