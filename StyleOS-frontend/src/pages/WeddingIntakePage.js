import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mission as missionApi } from '../services/api';
import './Mission.css';

const COMMUNITIES = ['Punjabi', 'Bengali', 'Nikah', 'Tamil', 'Other'];
const DEFAULT_EVENTS = ['Mehendi', 'Haldi', 'Sangeet', 'Wedding', 'Reception'];
const DEFAULT_MEMBERS = [
  { name: 'Bride', gender: 'Women', roleWeight: 3, ageBracket: 'adult' },
  { name: 'Groom', gender: 'Men', roleWeight: 3, ageBracket: 'adult' },
  { name: 'Mom', gender: 'Women', roleWeight: 1.5, ageBracket: 'adult' },
  { name: 'Dad', gender: 'Men', roleWeight: 1, ageBracket: 'adult' },
  { name: 'Sister', gender: 'Women', roleWeight: 1, ageBracket: 'adult' },
];

export default function WeddingIntakePage() {
  const navigate = useNavigate();
  const [community, setCommunity] = useState('Punjabi');
  const [city, setCity] = useState('Ludhiana');
  const [totalBudget, setTotalBudget] = useState(120000);
  const [events, setEvents] = useState([...DEFAULT_EVENTS]);
  const [members, setMembers] = useState([...DEFAULT_MEMBERS]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleEvent = (name) => {
    setEvents(prev => prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]);
  };

  const updateMember = (i, field, value) => {
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };

  const addMember = () => {
    setMembers(prev => [...prev, { name: '', gender: 'Women', roleWeight: 1, ageBracket: 'adult' }]);
  };

  const removeMember = (i) => {
    setMembers(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    setError('');
    if (events.length === 0) return setError('Pick at least one ceremony.');
    if (members.some(m => !m.name.trim())) return setError('Every family member needs a name.');
    setSubmitting(true);
    try {
      const payload = {
        title: `${community} Wedding — ${city}`,
        community, city, totalBudget: Number(totalBudget),
        events: events.map(name => ({ name })),
        members: members.map(m => ({ ...m, roleWeight: Number(m.roleWeight) })),
      };
      const result = await missionApi.createWedding(payload);
      navigate(`/mission/wedding/${result.mission.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create mission');
      setSubmitting(false);
    }
  };

  return (
    <div className="mission-page">
      <div className="mission-header">
        <h1>The Wedding</h1>
      </div>

      <div className="stylist-intro">
        <span className="stylist-intro-avatar">🧑‍🎨</span>
        <span>
          Kiya here — a wedding needs more than one outfit. Multiple ceremonies, a whole family,
          one budget that has to work across all of it. Tell me who's involved and what's
          happening, and I'll build the wardrobe for everyone at once.
        </span>
      </div>

      <div className="mission-form">
        <div className="form-row">
          <label>Community</label>
          <select value={community} onChange={e => setCommunity(e.target.value)}>
            {COMMUNITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="form-row">
          <label>City</label>
          <input value={city} onChange={e => setCity(e.target.value)} />
        </div>

        <div className="form-row">
          <label>Total Budget (₹)</label>
          <input type="number" value={totalBudget} onChange={e => setTotalBudget(e.target.value)} />
        </div>

        <div className="form-row">
          <label>Ceremonies</label>
          <div className="event-chip-row">
            {DEFAULT_EVENTS.map(name => (
              <button
                key={name}
                type="button"
                className={`event-chip ${events.includes(name) ? 'event-chip-active' : ''}`}
                onClick={() => toggleEvent(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>Family</label>
          <div className="member-list">
            {members.map((m, i) => (
              <div className="member-row" key={i}>
                <input
                  placeholder="Name"
                  value={m.name}
                  onChange={e => updateMember(i, 'name', e.target.value)}
                />
                <select value={m.gender} onChange={e => updateMember(i, 'gender', e.target.value)}>
                  <option value="Women">Women</option>
                  <option value="Men">Men</option>
                  <option value="Girls">Girls</option>
                  <option value="Boys">Boys</option>
                </select>
                <input
                  type="number" step="0.5" title="Budget weight — higher gets a bigger share"
                  value={m.roleWeight}
                  onChange={e => updateMember(i, 'roleWeight', e.target.value)}
                />
                <button type="button" className="member-remove" onClick={() => removeMember(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="member-add" onClick={addMember}>+ Add family member</button>
          </div>
        </div>

        {error && <div className="mission-error">{error}</div>}

        <button className="mission-submit-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Getting everyone’s wardrobe started...' : 'Start building the wardrobe →'}
        </button>
      </div>
    </div>
  );
}
