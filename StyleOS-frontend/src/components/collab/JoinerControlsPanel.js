import React from 'react';

// Joiner's live-session controls (Collab Cart Complete Session UX Spec §4b)
// — the mirror of SharingControlsPanel.js: either side can offer, either
// side can request, the owner approves (§4b's own framing). Split out of
// CollabCartPage.js alongside the other collab components — same reason.
export default function JoinerControlsPanel({
  presenterName, followingPresenter, onToggleFollow, onRequestScreen,
  iAmController, controllerName, onRequestControl, onRevokeControl,
}) {
  return (
    <div className="joiner-controls-panel">
      {presenterName ? (
        <div className="joiner-following-banner">
          <span>👁 Following {presenterName}'s screen</span>
          <button onClick={onToggleFollow}>{followingPresenter ? 'Stop following' : 'Follow along'}</button>
        </div>
      ) : (
        <button className="sharing-control-btn joiner-request-btn" onClick={onRequestScreen}>
          <span className="sharing-control-emoji">👁</span>
          <span>Request to see their screen</span>
        </button>
      )}

      {iAmController ? (
        <div className="joiner-controlling-banner">
          <span>🖐 You're in control — tap an item to swap it</span>
          <button onClick={onRevokeControl}>Done</button>
        </div>
      ) : controllerName ? (
        <p className="joiner-controlled-note">🖐 {controllerName} is in control right now</p>
      ) : (
        <button className="sharing-control-btn joiner-request-btn" onClick={onRequestControl}>
          <span className="sharing-control-emoji">🖐</span>
          <span>Ask to help control</span>
        </button>
      )}
    </div>
  );
}
