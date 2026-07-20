import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cart as cartApi, mission as missionApi, collab as collabApi } from '../services/api';
import './Mission.css';
import './LookbookPage.css';

/**
 * Screen 5 — the close screen (Part 3 Section 5.6). Both demo paths land
 * here: Script A's approved cart and the Wedding Matrix's completed
 * mission. Same job either way — turn "we built your wardrobe" into a
 * single shareable, screenshot-worthy moment instead of ending on a table
 * or a product grid.
 */
export default function LookbookPage() {
  const { type, id } = useParams(); // type: 'cart' | 'mission'
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (type === 'mission') {
          const res = await missionApi.get(id);
          if (!cancelled) setData({ kind: 'mission', ...res });
        } else {
          const res = await cartApi.get(id);
          if (!cancelled) setData({ kind: 'cart', cart: res });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [type, id]);

  const handleShare = async () => {
    setSharing(true);
    try {
      const { shareUrl: url, whatsappUrl } = type === 'mission'
        ? await collabApi.createForMission(id)
        : await collabApi.create(id);
      setShareUrl(url);
      window.open(whatsappUrl, '_blank');
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <div className="lookbook-loading"><div className="spinner" />Putting the Lookbook together...</div>;
  if (!data) return <div className="lookbook-loading">Couldn't find that wardrobe.</div>;

  let title, subtitle, spent, budget, tiles;

  if (data.kind === 'mission') {
    const { mission, events, members, slots } = data;
    title = mission?.TITLE || mission?.title || 'The Wedding Wardrobe';
    subtitle = `${members?.length || 0} people · ${events?.length || 0} ceremonies, coordinated`;
    spent = data.spent || 0;
    budget = mission?.TOTAL_BUDGET || mission?.totalBudget || 0;
    const eventName = Object.fromEntries((events || []).map(e => [e.id, e.name]));
    const memberName = Object.fromEntries((members || []).map(m => [m.id, m.name]));
    tiles = (slots || [])
      .filter(s => s.product)
      .map(s => ({
        id: s.id,
        image: s.product?.images?.[0],
        caption: `${memberName[s.memberId] || 'Someone'} · ${eventName[s.eventId] || ''}`,
        title: s.product?.title,
        price: s.product?.price,
      }));
  } else {
    const cart = data.cart || {};
    title = cart.NAME || cart.name || 'Your Wardrobe';
    subtitle = `${(cart.items || []).length} pieces, ready to wear`;
    spent = cart.TOTAL_PRICE || cart.totalPrice || 0;
    budget = cart.goalPlan?.total_budget || spent;
    tiles = (cart.items || []).map(item => ({
      id: item.id,
      image: item.product?.images?.[0],
      caption: item.product?.baseColour,
      title: item.product?.title,
      price: item.product?.price,
    }));
  }

  const saved = budget - spent;

  return (
    <div className="lookbook-page">
      <button className="lookbook-back" onClick={() => navigate(-1)}>← Back</button>

      <div className="lookbook-hero">
        <span className="lookbook-hero-emoji">✨</span>
        <h1 className="lookbook-hero-title">{title}</h1>
        <p className="lookbook-hero-sub">{subtitle}</p>
        <div className="lookbook-hero-figure">
          <span className="lookbook-hero-spent">₹{spent.toLocaleString('en-IN')}</span>
          {budget > 0 && <span className="lookbook-hero-of"> of ₹{budget.toLocaleString('en-IN')}</span>}
        </div>
        {budget > 0 && saved > 0 && (
          <span className="lookbook-hero-saved">₹{saved.toLocaleString('en-IN')} left to spare</span>
        )}
      </div>

      <div className="lookbook-grid">
        {tiles.map((t, i) => (
          <div key={t.id} className="lookbook-tile" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="lookbook-tile-image">
              {t.image
                ? <img src={t.image} alt={t.title} onError={e => { e.target.style.display = 'none'; }} />
                : <span className="lookbook-tile-placeholder">👕</span>}
            </div>
            <p className="lookbook-tile-caption">{t.caption}</p>
            <p className="lookbook-tile-title">{t.title}</p>
            <p className="lookbook-tile-price">₹{t.price?.toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      <div className="lookbook-actions">
        <button className="btn-whatsapp" onClick={handleShare} disabled={sharing}>
          {sharing ? 'Generating link...' : '📱 Share the Lookbook'}
        </button>
        {shareUrl && (
          <div className="share-link-row">
            <input readOnly value={shareUrl} onClick={e => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy</button>
          </div>
        )}
        <p className="lookbook-close-line">Two minutes. One goal. No browsing.</p>
      </div>
    </div>
  );
}
