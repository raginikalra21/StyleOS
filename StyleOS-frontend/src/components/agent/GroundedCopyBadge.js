import React from 'react';

export default function GroundedCopyBadge({ grounded }) {
  if (!grounded) return null;
  return (
    <span className="grounded-copy-badge" title="Verified: only mentions items actually in your cart">
      ✓ Grounded
    </span>
  );
}
