import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mission as missionApi } from '../services/api';
import './Mission.css';

// One flat list — Wedding and College route straight into full execution,
// everything else renders a plan on the spot. The user never sees this
// distinction; it's just how StyleOS routes internally.
const OCCASIONS = [
  { name: 'Wedding', emoji: '💍', route: '/mission/wedding' },
  { name: 'College', emoji: '🎓', route: '/agent' },
  { name: 'Diwali', emoji: '🪔' },
  { name: 'Eid', emoji: '🌙' },
  { name: 'Durga Puja', emoji: '🙏' },
  { name: 'Onam', emoji: '🌼' },
  { name: 'Navratri / Garba', emoji: '💃' },
  { name: 'Baisakhi', emoji: '🌾' },
  { name: 'Pongal', emoji: '☀️' },
  { name: 'Christmas', emoji: '🎄' },
  { name: 'First Job', emoji: '💼' },
  { name: 'New City', emoji: '🏙️' },
  { name: 'Trip', emoji: '✈️' },
];

export default function MissionPickerPage() {
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState(null);
  const [details, setDetails] = useState('');
  const [customType, setCustomType] = useState('');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectOccasion = (occasion) => {
    if (occasion.route) {
      navigate(occasion.route);
      return;
    }
    setActiveType(occasion.name);
    setPlan(null);
    setError('');
    setDetails('');
  };

  const selectCustom = () => {
    setActiveType('Custom');
    setPlan(null);
    setError('');
    setDetails('');
  };

  const handleGeneratePlan = async () => {
    const type = activeType === 'Custom' ? customType.trim() : activeType;
    if (!type) return;
    setLoading(true);
    setError('');
    try {
      const result = await missionApi.planOnly(type, details);
      setPlan(result.plan);
    } catch (err) {
      setError(err.message || "Couldn't put that together — try again?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mission-page">
      <div className="mission-header">
        <h1>What's the occasion?</h1>
        <p className="mission-tagline">Tell me what's coming up — I'll dress you, and everyone it involves, for it.</p>
      </div>

      <div className="picker-section">
        <div className="picker-grid">
          {OCCASIONS.map(o => (
            <button
              key={o.name}
              className={`picker-card ${activeType === o.name ? 'picker-card-active' : ''}`}
              onClick={() => selectOccasion(o)}
            >
              <span className="picker-emoji">{o.emoji}</span>
              <span>{o.name}</span>
            </button>
          ))}
          <button
            className={`picker-card ${activeType === 'Custom' ? 'picker-card-active' : ''}`}
            onClick={selectCustom}
          >
            <span className="picker-emoji">✨</span>
            <span>Something else</span>
          </button>
        </div>
      </div>

      {activeType && (
        <div className="plan-input-section">
          {activeType === 'Custom' && (
            <input
              className="plan-detail-input"
              placeholder="What's the occasion? e.g. 'Karva Chauth', 'housewarming'"
              value={customType}
              onChange={e => setCustomType(e.target.value)}
              autoFocus
            />
          )}
          <input
            className="plan-detail-input"
            placeholder={`Who's involved, budget, city — e.g. "family of 4, ₹20,000, Jaipur, before Nov 1"`}
            value={details}
            onChange={e => setDetails(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGeneratePlan(); }}
            autoFocus={activeType !== 'Custom'}
          />
          <button className="plan-generate-btn" onClick={handleGeneratePlan} disabled={loading}>
            {loading ? 'Putting the wardrobe together...' : `Dress everyone for ${activeType === 'Custom' ? (customType || 'it') : activeType} →`}
          </button>
        </div>
      )}

      {error && <div className="mission-error">{error}</div>}

      {plan && (
        <div className="plan-card">
          <h2>{plan.occasion}</h2>
          <p className="plan-summary">{plan.summary}</p>
          <div className="plan-meta">
            <span>₹{plan.totalBudget?.toLocaleString()} budget</span>
            <span>·</span>
            <span>{plan.timeline}</span>
          </div>
          <div className="plan-palette">
            {(plan.palette || []).map(c => <span key={c} className="plan-palette-chip">{c}</span>)}
          </div>
          <div className="plan-household">
            {(plan.household || []).map((h, i) => (
              <div className="plan-household-row" key={i}>
                <span className="plan-member-name">{h.member}</span>
                <span className="plan-member-notes">{h.notes}</span>
                <span className="plan-member-budget">₹{h.budgetShare?.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="plan-footnote">Same engine that built the wedding wardrobe and the college cart — this occasion just asked for less. Give me a real city and date and I'll get sharper.</p>
        </div>
      )}
    </div>
  );
}
