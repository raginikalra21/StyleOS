import React from 'react';

// "Everyone agreed" celebration (Collab Cart Complete Session UX Spec §5) —
// a brief shared-closure beat when every currently-present person has
// loved the item on screen. Purely presentational; the parent decides when
// to show it and clears it after a few seconds.
const CONFETTI = ['🎉', '✨', '💜', '🎊', '💗'];

export default function CelebrationBurst({ show }) {
  if (!show) return null;
  return (
    <div className="celebration-burst">
      {CONFETTI.map((e, i) => (
        <span key={i} className="celebration-piece" style={{ left: `${10 + i * 18}%`, animationDelay: `${i * 0.08}s` }}>{e}</span>
      ))}
      <div className="celebration-message">Everyone agreed! 🎉</div>
    </div>
  );
}
