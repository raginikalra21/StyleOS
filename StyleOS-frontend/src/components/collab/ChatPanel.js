import React from 'react';

// Tier 2 — lightweight scoped chat. Ephemeral (session-only, kept in the
// backend's in-memory ring buffer), separate from the durable per-item
// comment reactions used for the convergence engine. Split out of
// CollabCartPage.js alongside LiveActionRail — same reason.
export default function ChatPanel({ mySocketId, chatMessages, chatInput, setChatInput, onSend, onClose }) {
  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span>💬 Chat</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="chat-panel-messages">
        {chatMessages.length === 0 && <p className="chat-empty">Say something to the group...</p>}
        {chatMessages.map((m, i) => {
          const isMine = m.socketId === mySocketId;
          const rowClass = isMine ? 'chat-message mine' : 'chat-message';
          return (
            <div key={i} className={rowClass}>
              <span className="chat-message-name">{m.name}</span>
              <span className="chat-message-text">{m.text}</span>
            </div>
          );
        })}
      </div>
      <div className="chat-panel-input">
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSend()}
          placeholder="Message the group..."
        />
        <button onClick={onSend}>Send</button>
      </div>
    </div>
  );
}
