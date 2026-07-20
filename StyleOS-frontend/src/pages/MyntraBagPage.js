import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cart as cartApi, mission as missionApi } from '../services/api';
import logo from '../assets/images/logo.png';
import './MyntraBagPage.css';

export default function MyntraBagPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placed, setPlaced] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const autopilot = urlParams.get('autopilot') === 'true';

  useEffect(() => {
    async function load() {
      try {
        const state = JSON.parse(localStorage.getItem('styleos_autopilot_state') || '{}');
        const weddingId = state.weddingId;
        const cartId = state.cartId;

        if (weddingId) {
          const data = await missionApi.get(weddingId);
          const parseImages = (imgVal) => {
            if (!imgVal) return ['https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=300'];
            if (Array.isArray(imgVal)) return imgVal;
            try {
              return JSON.parse(imgVal);
            } catch (e) {
              return [imgVal];
            }
          };

          const bagItems = (data.slots || [])
            .filter(s => s.status === 'filled' && s.product)
            .map((s, idx) => ({
              id: `wedding-slot-${s.id || idx}`,
              product: {
                title: s.product?.title || s.product?.TITLE || 'Ethnic Wear',
                articleType: s.product?.articleType || s.product?.ARTICLE_TYPE || 'Kurtas',
                price: s.product?.price || s.product?.PRICE || 2999,
                images: parseImages(s.product?.images || s.product?.IMAGES)
              },
              size: 'M',
              quantity: 1
            }));
          setItems(bagItems);
        } else if (cartId) {
          const cart = await cartApi.get(cartId);
          setItems(cart.items || []);
        } else {
          // Fallback static items matching Image 3
          setItems([
            {
              id: 'static-1',
              product: {
                title: 'Calvin Klein Jeans',
                articleType: 'Men Polo Collar T-shirt',
                price: 3359,
                images: ['https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=300']
              },
              size: 'M',
              quantity: 1
            },
            {
              id: 'static-2',
              product: {
                title: 'Calvin Klein Jeans',
                articleType: 'Men Polo Collar Pockets T-shirt',
                price: 3359,
                images: ['https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=300']
              },
              size: 'L',
              quantity: 1
            }
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (autopilot) {
      window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "🛒 Loaded final bag with all coordinated family selections..." }));
    }
  }, [autopilot]);

  useEffect(() => {
    if (!autopilot || items.length === 0 || placed) return;

    const timer = setTimeout(() => {
      handlePlaceOrder();
    }, 4000);

    return () => clearTimeout(timer);
  }, [autopilot, items, placed]);

  const handlePlaceOrder = () => {
    window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "💳 Auto-paying & placing checkout order..." }));
    setPlaced(true);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('autopilot:toast', { detail: "🎉 Order placed successfully! Returning to presentation..." }));
      setTimeout(() => {
        window.location.href = '/demo?completed=true';
      }, 1000);
    }, 2000);
  };

  if (loading) return <div className="myntra-bag-loading">Loading Bag...</div>;

  const totalMRP = items.reduce((acc, it) => acc + (it.product?.price || 0) * 1.6, 0);
  const totalAmount = items.reduce((acc, it) => acc + (it.product?.price || 0), 0) + 23;
  const discountOnMRP = totalMRP - totalAmount + 23;

  return (
    <div className="myntra-bag-page">

      {placed && (
        <div className="celebration-overlay">
          <div className="celebration-card">
            <span className="celebration-emoji">🎉</span>
            <h2>Order Placed Successfully!</h2>
            <p>StyleOS coordinated your family wardrobe in under 2 minutes.</p>
          </div>
        </div>
      )}

      {/* Myntra Replica Header */}
      <header className="myntra-bag-header">
        <div className="myntra-logo-container" onClick={() => navigate('/demo')}>
          <img src={logo} alt="StyleOS" />
        </div>
        <div className="checkout-progress-steps">
          <span className="step-active">BAG</span>
          <span className="step-divider">----------</span>
          <span>ADDRESS</span>
          <span className="step-divider">----------</span>
          <span>PAYMENT</span>
        </div>
        <div className="secure-badge">
          <span className="secure-icon">🛡️</span>
          <span>100% SECURE</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="myntra-bag-main">
        <div className="myntra-bag-left">
          {/* Pincode checker */}
          <div className="pincode-card">
            <span>Check delivery time & services</span>
            <button className="btn-pincode">ENTER PIN CODE</button>
          </div>

          <div className="items-header">
            <input type="checkbox" defaultChecked />
            <span><strong>{items.length}/{items.length} ITEMS SELECTED</strong></span>
            <div className="items-header-actions">
              <span>REMOVE</span>
              <span className="divider-v">|</span>
              <span>MOVE TO WISHLIST</span>
            </div>
          </div>

          {/* Cart items list */}
          <div className="items-list">
            {items.map((item) => (
              <div key={item.id} className="bag-item-card">
                <input type="checkbox" defaultChecked className="item-checkbox" />
                <div className="item-image">
                  {item.product?.images?.[0] ? (
                    <img src={item.product.images[0]} alt={item.product.title} onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div className="item-placeholder">👕</div>
                  )}
                </div>
                <div className="item-details">
                  <h3 className="item-brand">{item.product?.brand || 'StyleOS Choice'}</h3>
                  <p className="item-title">{item.product?.title || item.product?.articleType}</p>
                  <p className="item-seller">Sold by: M/S PLATINUM FASHIONS</p>
                  
                  <div className="item-size-qty">
                    <span className="size-selector">Size: <strong>{item.size || 'M'}</strong> ▾</span>
                    <span className="qty-selector">Qty: <strong>{item.quantity || 1}</strong> ▾</span>
                  </div>

                  <div className="item-pricing">
                    <span className="price-current">₹{item.product?.price?.toLocaleString('en-IN')}</span>
                    <span className="price-original">₹{Math.round((item.product?.price || 0) * 1.6).toLocaleString('en-IN')}</span>
                    <span className="price-discount">({Math.round((1 - 1/1.6) * 100)}% OFF)</span>
                  </div>

                  <p className="return-policy">🔄 <strong>14 days</strong> return available</p>
                </div>
                <button className="btn-remove-item">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="myntra-bag-right">
          {/* Coupons Card */}
          <div className="coupons-card">
            <div className="coupon-label">🏷️ Apply Coupons</div>
            <button className="btn-coupon-apply">APPLY</button>
          </div>

          {/* Price Details */}
          <div className="price-details-card">
            <h4 className="price-header">PRICE DETAILS ({items.length} Items)</h4>
            <div className="price-row">
              <span>Total MRP</span>
              <span>₹{Math.round(totalMRP).toLocaleString('en-IN')}</span>
            </div>
            <div className="price-row text-success">
              <span>Discount on MRP</span>
              <span>-₹{Math.round(discountOnMRP).toLocaleString('en-IN')}</span>
            </div>
            <div className="price-row">
              <span>Coupon Discount</span>
              <span className="text-pink">Apply Coupon</span>
            </div>
            <div className="price-row">
              <span>Platform Fee</span>
              <span>₹23</span>
            </div>
            <div className="price-divider" />
            <div className="price-row total-row">
              <span>Total Amount</span>
              <span>₹{Math.round(totalAmount).toLocaleString('en-IN')}</span>
            </div>

            <button className="btn-place-order" onClick={handlePlaceOrder}>
              PLACE ORDER
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
