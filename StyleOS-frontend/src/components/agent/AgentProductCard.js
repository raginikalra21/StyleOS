import React from 'react';
import { buildWhyTag } from '../../helpers/whyTag';

export default function AgentProductCard({ item, onTap, plan }) {
  const p = item.product || {};
  const discountPct = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const whyTag = buildWhyTag(item, plan);

  return (
    <button
      type="button"
      className={`agent-product-card ${item._pulse ? 'card-pulse' : ''} ${item._exiting ? 'card-exit' : ''}`}
      onClick={() => onTap(item)}
    >
      <div className="apc-image-wrap">
        {p.images?.[0] ? (
          <img src={p.images[0]} alt={p.title} loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <div className="apc-noimg">👕</div>
        )}
      </div>
      <div className="apc-info">
        <p className="apc-brand">{p.brand}</p>
        <p className="apc-title">{p.title}</p>
        <div className="apc-price-row">
          <span className="apc-price">₹{p.price?.toLocaleString()}</span>
          {p.mrp > p.price && <span className="apc-mrp">₹{p.mrp?.toLocaleString()}</span>}
          {discountPct > 0 && <span className="apc-discount">{discountPct}% off</span>}
        </div>
        {whyTag && <span className="apc-why-tag">{whyTag}</span>}
      </div>
    </button>
  );
}
