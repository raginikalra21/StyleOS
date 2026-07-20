import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collab as collabApi } from '../services/api';
import './CollabInvitesPage.css';

export default function CollabInvitesPage() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    collabApi.myInvites()
      .then(data => setInvites(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="invites-page">
      <div className="invites-loading">Loading your collab carts...</div>
    </div>
  );

  return (
    <div className="invites-page">
      <h1>Collab Carts</h1>
      <p className="invites-sub">Wardrobes shared with you for review</p>

      {invites.length === 0 ? (
        <div className="invites-empty">
          <span>👗</span>
          <p>No collab carts yet.</p>
          <p>When someone shares their wardrobe with you, it will appear here.</p>
        </div>
      ) : (
        <div className="invites-list">
          {invites.map((invite, i) => {
            const token = invite.SHARE_TOKEN || invite.shareToken;
            const name = invite.CART_NAME || invite.cartName || 'Wardrobe';
            const total = invite.TOTAL_PRICE || invite.totalPrice || 0;
            return (
              <Link to={`/collab/${token}`} key={i} className="invite-card">
                <div className="invite-icon">👗</div>
                <div className="invite-info">
                  <h3>{name}</h3>
                  <p>₹{total?.toLocaleString()}</p>
                </div>
                <div className="invite-arrow">→</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
