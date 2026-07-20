import React, { useEffect, useState } from 'react';
import { agent as agentApi } from '../../services/api';

export default function ProductSheet({ item, onClose, onSwap, onRemove, swapping }) {
  const [alternatives, setAlternatives] = useState([]);
  const [loadingAlts, setLoadingAlts] = useState(true);
  const [selectedSize, setSelectedSize] = useState('M');

  useEffect(() => {
    if (!item) return;
    setLoadingAlts(true);
    setSelectedSize(item.size || item.ITEM_SIZE || 'M');
    agentApi.alternatives(item.id)
      .then(({ alternatives }) => setAlternatives(alternatives || []))
      .catch(() => setAlternatives([]))
      .finally(() => setLoadingAlts(false));
    // Intentionally keyed on item.id only — the item object's identity
    // changes on every cartItems refresh, but we only need to refetch
    // alternatives when the sheet is actually showing a different item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;
  const p = item.product || {};
  const discountPct = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const images = p.images?.length ? p.images : [null];

  return (
    <div className="product-sheet-backdrop" onClick={onClose}>
      <div className="product-sheet" onClick={e => e.stopPropagation()}>
        <div className="product-sheet-handle" />
        <button className="product-sheet-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="product-sheet-gallery">
          {images.map((img, i) => (
            <div className="gallery-slide" key={i}>
              {img ? <img src={img} alt={p.title} /> : <div className="apc-noimg">👕</div>}
            </div>
          ))}
        </div>

        <div className="product-sheet-body">
          <p className="ps-brand">{p.brand}</p>
          <h3 className="ps-title">{p.title}</h3>
          {p.rating ? <div className="ps-rating">⭐ {p.rating}{p.ratingCount ? ` (${p.ratingCount})` : ''}</div> : null}

          <div className="ps-price-row">
            <span className="ps-price">₹{p.price?.toLocaleString()}</span>
            {p.mrp > p.price && <span className="ps-mrp">₹{p.mrp?.toLocaleString()}</span>}
            {discountPct > 0 && <span className="ps-discount">{discountPct}% off</span>}
          </div>

          <div className="ps-meta">
            {p.fabric && <span>🧵 {p.fabric}</span>}
            {p.deliveryDays ? <span>🚚 {p.deliveryDays} day delivery</span> : null}
          </div>

          <div className="ps-size-row">
            <span className="ps-size-label">Size</span>
            {['S', 'M', 'L', 'XL', 'XXL'].map(sz => (
              <button
                key={sz}
                className={`ps-size-chip ${selectedSize === sz ? 'ps-size-selected' : ''}`}
                onClick={() => setSelectedSize(sz)}
              >
                {sz}
              </button>
            ))}
          </div>

          <p className="ps-why">
            Why Kiya picked this: {p.baseColour} {p.articleType?.toLowerCase()}, matches your constraints and fits the budget.
          </p>

          <div className="ps-actions">
            <button className="ps-remove-btn" onClick={onRemove}>Remove</button>
          </div>

          <div className="ps-swap-section">
            <p className="ps-swap-label">Swap this item</p>
            {loadingAlts ? (
              <div className="ps-swap-loading">Finding alternatives...</div>
            ) : alternatives.length === 0 ? (
              <div className="ps-swap-empty">No other options in this category right now.</div>
            ) : (
              <div className="ps-swap-list">
                {alternatives.map(alt => (
                  <button
                    key={alt.id}
                    className="ps-swap-option"
                    onClick={() => onSwap(alt.id)}
                    disabled={swapping}
                  >
                    {alt.images?.[0]
                      ? <img src={alt.images[0]} alt={alt.title} />
                      : <div className="apc-noimg">👕</div>}
                    <div className="ps-swap-option-info">
                      <p className="ps-swap-option-title">{alt.title}</p>
                      <p className="ps-swap-option-colour">{alt.baseColour}</p>
                    </div>
                    <span className={`ps-swap-delta ${alt.priceDelta > 0 ? 'delta-up' : alt.priceDelta < 0 ? 'delta-down' : 'delta-same'}`}>
                      {alt.priceDelta > 0
                        ? `+₹${alt.priceDelta.toLocaleString()}`
                        : alt.priceDelta < 0
                          ? `-₹${Math.abs(alt.priceDelta).toLocaleString()}`
                          : 'Same price'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
