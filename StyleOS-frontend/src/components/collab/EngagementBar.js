import React from 'react';

const EMOJI_BURSTS = ['❤️', '🔥', '😍', '👍', '😂'];

// Ambient emoji-burst quick bar (Tier 2), read receipts (Tier 1), and the
// co-editing swap panel a granted controller sees (Tier 4). Split out of
// CollabCartPage.js alongside LiveActionRail — same reason.
export default function EngagementBar({
  onBurst,
  currentReadBy,
  iAmController, mode,
  swapOptions, swapOptionsLoading, onOpenSwapOptions, onControlSwap, onCancelSwap,
}) {
  return (
    <>
      <div className="emoji-burst-bar">
        {EMOJI_BURSTS.map(e => (
          <button key={e} className="emoji-burst-btn" onClick={() => onBurst(e)}>{e}</button>
        ))}
      </div>

      {currentReadBy.length > 0 && (
        <p className="read-receipt-line">
          Seen by {currentReadBy.map(r => r.name).join(', ')}
        </p>
      )}

      {iAmController && mode === 'cart' && (
        <div className="control-swap-panel">
          {!swapOptions ? (
            <button className="btn-primary" onClick={onOpenSwapOptions} disabled={swapOptionsLoading}>
              {swapOptionsLoading ? 'Finding alternatives...' : '🔄 Swap this item'}
            </button>
          ) : (
            <>
              <p className="control-swap-label">Pick a replacement</p>
              <div className="control-swap-options">
                {swapOptions.options.length === 0 && <p className="control-swap-empty">No strict alternatives in stock right now.</p>}
                {swapOptions.options.map(opt => (
                  <button key={opt.id} className="control-swap-option" onClick={() => onControlSwap(opt.id)}>
                    {opt.images?.[0] && <img src={opt.images[0]} alt={opt.title} />}
                    <span>{opt.title}</span>
                    <span className="control-swap-price">₹{opt.price?.toLocaleString('en-IN')}</span>
                  </button>
                ))}
              </div>
              <button className="control-swap-cancel" onClick={onCancelSwap}>Cancel</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
