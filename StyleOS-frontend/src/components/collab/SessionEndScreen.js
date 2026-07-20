import React from 'react';

// Shown to everyone in the room the moment the owner ends the session, or
// when a joiner opens an already-expired invite link (Collab Cart Complete
// Session UX Spec §1's "session stays live for" duration). Split out of
// CollabCartPage.js alongside the other collab components — same reason.
export default function SessionEndScreen({ byName, expired, onBack }) {
  return (
    <div className="session-end-screen">
      <span className="session-end-emoji">{expired ? '⏳' : '👋'}</span>
      <h2>{expired ? 'This session has ended' : `${byName || 'The owner'} ended this session`}</h2>
      <p>
        {expired
          ? "The link's live window has passed, but nothing here is lost — reactions and choices already made are saved."
          : "Thanks for weighing in — everything you reacted to has been saved."}
      </p>
      <button className="btn-primary" onClick={onBack}>Done</button>
    </div>
  );
}
