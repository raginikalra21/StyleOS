import React from 'react';

// Always-available quick access — chat (Tier 2) and session timeline
// (Tier 6). The bigger, labeled sharing/request actions live in
// SharingControlsPanel.js (owner) and JoinerControlsPanel.js (joiner)
// instead of being crammed into this icon rail.
export default function LiveActionRail({ chatUnread, onToggleChat, onOpenTimeline }) {
  return (
    <div className="live-action-rail">
      <button className="live-rail-btn chat-toggle" onClick={onToggleChat} title="Chat">
        💬{chatUnread > 0 && <span className="chat-unread-dot">{chatUnread}</span>}
      </button>
      <button className="live-rail-btn" onClick={onOpenTimeline} title="Session timeline">
        🕘 Timeline
      </button>
    </div>
  );
}
