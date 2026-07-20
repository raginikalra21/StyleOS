import React from 'react';

// Incoming request prompts — "X wants to help control" / "X wants to see
// your screen" (Tier 4 / Collab Cart Complete Session UX Spec §3d) — plus
// the room-wide spotlight toast (Tier 3). Role-specific status ("Following
// X", "You're in control") lives in SharingControlsPanel.js (owner) and
// JoinerControlsPanel.js (joiner) instead, so it isn't shown twice.
export default function LiveBanners({
  controlRequests, onGrantControl, onDismissRequest,
  screenRequests, onGrantScreen, onDismissScreenRequest,
  spotlightToast,
}) {
  return (
    <>
      {controlRequests.map(r => (
        <div className="control-request-banner" key={r.socketId}>
          ✋ {r.name} wants to help control
          <div className="control-request-actions">
            <button className="btn-primary" onClick={() => onGrantControl(r.socketId)}>Grant</button>
            <button className="btn-secondary" onClick={() => onDismissRequest(r.socketId)}>Not now</button>
          </div>
        </div>
      ))}

      {screenRequests.map(r => (
        <div className="control-request-banner" key={r.socketId}>
          👁 {r.name} wants to see your screen
          <div className="control-request-actions">
            <button className="btn-primary" onClick={() => onGrantScreen(r.socketId)}>Show her</button>
            <button className="btn-secondary" onClick={() => onDismissScreenRequest(r.socketId)}>Not now</button>
          </div>
        </div>
      ))}

      {spotlightToast && <div className="spotlight-toast">{spotlightToast}</div>}
    </>
  );
}
