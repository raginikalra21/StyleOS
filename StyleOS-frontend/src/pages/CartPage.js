import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { cart as cartApi, collab as collabApi, party as partyApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './CartPage.css';

const DURATION_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '6 hours', hours: 6 },
  { label: '24 hours', hours: 24 },
  { label: 'No limit', hours: 0 },
];

export default function CartPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cartData, setCartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [shareToken, setShareToken] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  // Five Modes (collab_cart_five_modes.md) — who am I asking, and why.
  const [showModePicker, setShowModePicker] = useState(false);
  const [askMode, setAskMode] = useState('advisor');
  const [recipientName, setRecipientName] = useState('');
  const [recipientRelation, setRecipientRelation] = useState('');
  // "Session stays live for" (Collab Cart Complete Session UX Spec §1) — a
  // room has a lifespan, not a permanent page.
  const [durationHours, setDurationHours] = useState(6);

  useEffect(() => {
    if (!id) return;
    cartApi.get(id)
      .then(data => {
        setCartData(data);
        const token = data.collabSession?.SHARE_TOKEN || data.collabSession?.shareToken;
        if (token) {
          // window.location.origin, not REACT_APP_API_URL — that env var
          // points at the BACKEND (port 5000, no /collab route at all,
          // only /api/collab), so stripping "/api" off it built a link to
          // "Cannot GET /collab/:token" instead of the actual frontend page.
          // The page's own origin is always correct regardless of whether
          // it's being viewed as localhost or a LAN IP.
          setShareUrl(`${window.location.origin}/collab/${token}`);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleShare = async (mode, method) => {
    setSharing(true);
    try {
      // CO-ATTENDEE is structurally different — a Party groups several
      // attendees' INDIVIDUAL carts (the Clash Engine needs to compare
      // across carts), not one shared cart with several reviewers, which
      // is what every other mode's collab_session already models.
      const { shareUrl: url, shareToken: token, whatsappUrl: wUrl } = mode === 'co_attendee'
        ? await partyApi.create(cartData?.name || cartData?.NAME)
        : await collabApi.create(id, mode, recipientName, recipientRelation, durationHours || undefined);
      setShareUrl(url);
      setShareToken(token);
      setWhatsappUrl(wUrl);
      setShowModePicker(false);
      if (method === 'whatsapp') window.open(wUrl, '_blank');
      if (method === 'copy') navigator.clipboard.writeText(url);
    } catch (e) {
      console.error(e);
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    if (!shareUrl) { setQrDataUrl(''); return; }
    QRCode.toDataURL(shareUrl, { width: 200, margin: 1 })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [shareUrl]);

  const MODE_OPTIONS = [
    { key: 'advisor', emoji: '💬', label: 'Ask their opinion', sub: 'Swipe, react, comment — the classic Squad Cart' },
    { key: 'approver', emoji: '💳', label: 'Get it approved', sub: 'One number, one tap — for whoever\'s paying' },
    { key: 'proxy', emoji: '🎁', label: "It's a gift", sub: 'Shop for someone else — they never see this cart' },
    { key: 'peer', emoji: '🤝', label: 'Split it with someone', sub: 'One budget, two people, no hierarchy' },
    { key: 'co_attendee', emoji: '👀', label: "Don't clash at the event", sub: 'Compare with everyone else going' },
  ];

  const handleApprove = async () => {
    setApproving(true);
    try {
      await cartApi.approve(id);
      setApproved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(false);
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await cartApi.removeItem(id, itemId);
      setCartData(prev => ({
        ...prev,
        items: prev.items.filter(i => i.id !== itemId),
      }));
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="cart-loading">Loading cart...</div>;
  if (!cartData) return <div className="cart-loading">Cart not found.</div>;

  const items = cartData.items || [];
  const total = cartData.TOTAL_PRICE || cartData.totalPrice || 0;

  return (
    <div className="cart-page">
      <div className="cart-header">
        <button className="back-btn" onClick={() => navigate('/agent')}>← Back</button>
        <h1>{cartData.NAME || cartData.name || 'My Wardrobe'}</h1>
        <div className="cart-total">₹{total.toLocaleString()}</div>
      </div>

      {cartData.GOAL_TEXT || cartData.goalText ? (
        <div className="cart-goal">
          🎯 {cartData.GOAL_TEXT || cartData.goalText}
        </div>
      ) : null}

      <div className="cart-items">
        {items.map(item => (
          <div key={item.id} className="cart-item">
            <div className="item-image">
              {item.product?.images?.[0]
                ? <img src={item.product.images[0]} alt={item.product.title}
                    onError={e => e.target.style.display='none'} />
                : <span className="item-placeholder">👕</span>
              }
            </div>
            <div className="item-info">
              <p className="item-brand">{item.product?.brand}</p>
              <p className="item-title">{item.product?.title}</p>
              <div className="item-meta">
                <span>{item.product?.baseColour}</span>
                <span>·</span>
                <span>Size: {item.size || item.ITEM_SIZE || 'M'}</span>
                <span>·</span>
                <span>🚚 {item.product?.deliveryDays} days</span>
              </div>
              <p className="item-price">₹{item.product?.price?.toLocaleString()}</p>
            </div>
            <button className="remove-btn" onClick={() => handleRemove(item.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="cart-actions">
        <div className="cart-summary">
          <span>{items.length} items</span>
          <span className="total-price">Total: ₹{total.toLocaleString()}</span>
        </div>

        {!shareUrl && !showModePicker && (
          <button className="btn-collab" onClick={() => setShowModePicker(true)}>
            👨‍👩‍👧 Make a Collab Cart
          </button>
        )}

        {showModePicker && !shareUrl && (
          <div className="mode-picker">
            <p className="mode-picker-label">Who am I asking, and why?</p>
            {MODE_OPTIONS.map(m => (
              <button
                key={m.key}
                className={`mode-option ${askMode === m.key ? 'mode-option-active' : ''}`}
                onClick={() => setAskMode(m.key)}
              >
                <span className="mode-emoji">{m.emoji}</span>
                <span className="mode-text">
                  <span className="mode-label">{m.label}</span>
                  <span className="mode-sub">{m.sub}</span>
                </span>
              </button>
            ))}
            {askMode === 'proxy' && (
              <div className="proxy-fields">
                <input
                  placeholder="Who is this for? (e.g. Mom)"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                />
                <input
                  placeholder="Relation (e.g. Mother, Boyfriend)"
                  value={recipientRelation}
                  onChange={e => setRecipientRelation(e.target.value)}
                />
              </div>
            )}

            <p className="mode-picker-label">Session stays live for</p>
            <div className="duration-picker">
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.hours}
                  className={`duration-option ${durationHours === d.hours ? 'duration-option-active' : ''}`}
                  onClick={() => setDurationHours(d.hours)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <p className="mode-picker-label">How should they join?</p>
            <div className="share-method-row">
              <button className="share-method-btn" onClick={() => handleShare(askMode, 'whatsapp')} disabled={sharing}>
                📱 WhatsApp
              </button>
              <button className="share-method-btn" onClick={() => handleShare(askMode, 'copy')} disabled={sharing}>
                🔗 Copy link
              </button>
              <button className="share-method-btn" onClick={() => handleShare(askMode, 'qr')} disabled={sharing}>
                📷 QR code
              </button>
            </div>
            {sharing && <p className="mode-picker-label" style={{ textAlign: 'center' }}>Starting session...</p>}
          </div>
        )}

        {shareUrl && (
          <div className="live-session-share">
            <div className="share-link-row">
              <input readOnly value={shareUrl} onClick={e => e.target.select()} />
              <button onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy</button>
            </div>
            <div className="share-method-row">
              <button className="share-method-btn" onClick={() => window.open(whatsappUrl, '_blank')}>📱 WhatsApp</button>
              {qrDataUrl && <img className="share-qr-thumb" src={qrDataUrl} alt="QR code to join" />}
            </div>
            {/* Generating the link doesn't put you IN the room — you have
                to actually open it, same as anyone else, to see presence,
                sharing controls, and live reactions land. */}
            {shareToken && (
              <button className="btn-collab" onClick={() => navigate(`/collab/${shareToken}`)}>
                🎥 Enter live session →
              </button>
            )}
          </div>
        )}

        {approved ? (
          <div className="cart-approved-banner">
            <span className="cart-approved-check">✅</span>
            <div>
              <p className="cart-approved-title">Wardrobe approved</p>
              <p className="cart-approved-sub">This cart is locked in — no browsing, no back-and-forth.</p>
            </div>
            <button className="cart-lookbook-btn" onClick={() => navigate(`/lookbook/cart/${id}`)}>
              View Lookbook →
            </button>
          </div>
        ) : (
          <button className="btn-approve" onClick={handleApprove} disabled={approving}>
            {approving ? 'Approving...' : '✅ Approve Wardrobe'}
          </button>
        )}
      </div>
    </div>
  );
}
