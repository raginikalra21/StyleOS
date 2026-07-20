import React from 'react';
import AgentProductCard from './AgentProductCard';

export default function FullHaulGrid({ items, onTapItem, plan }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="full-haul-grid">
      {items.map(item => (
        <AgentProductCard key={item.id} item={item} onTap={onTapItem} plan={plan} />
      ))}
    </div>
  );
}
