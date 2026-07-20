import React from 'react';
import ProductCarousel from './ProductCarousel';

export default function OutfitGroup({ outfit, cartItemsById, onTapItem, plan, index }) {
  const items = outfit.itemIds.map(id => cartItemsById[id]).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="outfit-group" style={{ animationDelay: `${index * 80}ms` }}>
      <h3 className="outfit-group-name">{outfit.name}</h3>
      <ProductCarousel items={items} onTapItem={onTapItem} plan={plan} />
    </div>
  );
}
