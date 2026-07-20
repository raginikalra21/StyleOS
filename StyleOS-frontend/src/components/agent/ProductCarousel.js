import React from 'react';
import AgentProductCard from './AgentProductCard';

export default function ProductCarousel({ items, onTapItem, plan }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="product-carousel">
      {items.map(item => (
        <div className="carousel-item" key={item.id}>
          <AgentProductCard item={item} onTap={onTapItem} plan={plan} />
        </div>
      ))}
    </div>
  );
}
