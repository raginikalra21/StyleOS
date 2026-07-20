import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { wardrobe as wardrobeApi } from '../services/api';
import './WardrobePage.css';

export default function WardrobePage() {
  const [wardrobes, setWardrobes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wardrobeApi.list()
      .then(setWardrobes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="wardrobe-loading">Loading your wardrobes...</div>;

  return (
    <div className="wardrobe-page">
      <div className="wardrobe-header">
        <h1>My Wardrobes</h1>
        <Link to="/agent" className="new-wardrobe-btn">+ New Wardrobe</Link>
      </div>

      {wardrobes.length === 0 ? (
        <div className="wardrobe-empty">
          <span>👗</span>
          <p>No wardrobes yet.</p>
          <Link to="/agent">Start shopping with AI →</Link>
        </div>
      ) : (
        <div className="wardrobe-grid">
          {wardrobes.map((w, i) => {
            const name = w.NAME || w.name || 'My Wardrobe';
            const total = w.TOTAL_PRICE || w.totalPrice || 0;
            const items = w.TOTAL_ITEMS || w.totalItems || 0;
            return (
              <Link to={`/cart/${w.CART_ID || w.cartId}`} key={i} className="wardrobe-card">
                <div className="wardrobe-icon">👗</div>
                <h3>{name}</h3>
                <p>{items} items · ₹{total.toLocaleString()}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
