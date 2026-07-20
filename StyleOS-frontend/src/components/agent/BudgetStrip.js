import React from 'react';

export default function BudgetStrip({ itemCount, total, budget, outfitCount }) {
  const totalBudget = budget?.totalBudget;
  const pct = totalBudget ? Math.min(100, Math.round((total / totalBudget) * 100)) : 0;
  const status = budget?.status || 'under';

  return (
    <div className="budget-strip">
      <div className="budget-strip-row">
        <span><strong>{itemCount}</strong> items</span>
        <span className="dot">·</span>
        <span className={`budget-total budget-${status}`}>
          <strong>₹{(total || 0).toLocaleString()}</strong>
          {totalBudget ? ` / ₹${totalBudget.toLocaleString()}` : ''}
        </span>
        <span className="dot">·</span>
        <span><strong>{outfitCount}</strong> outfits</span>
      </div>
      {totalBudget ? (
        <div className="budget-bar-track">
          <div className={`budget-bar-fill budget-bar-${status}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
