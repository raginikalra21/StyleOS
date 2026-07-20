import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { demo as demoApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './DemoPage.css';

export default function DemoPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [loading, setLoading] = useState(null); // 'kiya' | 'collab' | 'clash' | 'wedding' | null
  const [timelineStep, setTimelineStep] = useState(0);

  const handleSeed = async (type) => {
    setLoading(type);
    try {
      const res = await demoApi.seed(type);
      
      // Auto authenticate the presenter as demo_user
      loginWithToken(res.token, res.user);

      // Redirect to target demo pages
      if (type === 'kiya') {
        navigate(`/agent?cartId=${res.cartId}`);
      } else if (type === 'collab') {
        navigate(`/collab/${res.shareToken}`);
      } else if (type === 'clash') {
        navigate(`/party/${res.shareToken}`);
      } else if (type === 'wedding') {
        navigate(`/mission/wedding/${res.missionId}`);
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to seed ${type} scenario. Make sure the backend is running and DB is connected.`);
    } finally {
      setLoading(null);
    }
  };

  const handleStartAutopilot = async () => {
    setLoading('autopilot');
    try {
      const res = await demoApi.seedAll();
      
      // Auto authenticate the presenter as demo_user
      loginWithToken(res.token, res.user);

      // Save IDs to local storage
      localStorage.setItem('styleos_autopilot_state', JSON.stringify({
        cartId: res.cartId,
        shareToken: res.shareToken,
        partyToken: res.partyToken,
        weddingId: res.weddingId
      }));

      // Redirect to Step 1 (Kiya AI Agent Page)
      navigate(`/agent?cartId=${res.cartId}&autopilot=true`);
    } catch (err) {
      console.error(err);
      alert('Failed to initialize Auto-Pilot. Ensure backend is running and DB is connected.');
    } finally {
      setLoading(null);
    }
  };


  const steps = [
    {
      time: '0:00 - 0:20',
      title: 'The Hooks & Indian Context',
      desc: 'Young Indians screenshot their shopping carts and send them to family on WhatsApp. StyleOS keeps this decision loop inside the app.',
      bullets: [
        'Hook: "Young Indians don\'t checkout, they WhatsApp screenshots to Mom."',
        'Explain the paradigm shift: state goal → AI shops → family reviews → approve.',
        'Zero friction: Mom never needs an account to review or comment.'
      ]
    },
    {
      time: '0:20 - 0:45',
      title: 'Kiya AI Goal-to-Cart Stylist',
      desc: 'Instead of searching, Gen Z describes transitions. Kiya handles gender-checks, constraints, and budget-tightening in a beat-paced flow.',
      bullets: [
        'State your goal: college hostel life, Bangalore internship, cousin\'s Punjabi wedding.',
        'Show gender-gating: clarify instead of guessing.',
        'Show budget-tightening: auto-optimize items to fit a tight Rs. 15,000 budget.'
      ],
      action: { type: 'kiya', label: '1-Click Launch Kiya Cart' }
    },
    {
      time: '0:45 - 1:15',
      title: 'Squad Cart: 5 Collab Modes',
      desc: 'Share a Squad Cart link natively. Friends swipe, comment, voice-note, and vote. Payer lock sets a hard budget cap.',
      bullets: [
        'Advisor Mode: Swiping, voice notes transcribed via Whisper, live votes.',
        'Approver Mode (Payer Lock): Dad sets limits, AI re-solves items underneath.',
        'Proxy Mode: Shop for a nephew using privacy-preserving size profiles.'
      ],
      action: { type: 'collab', label: '1-Click Seed Collab Session' }
    },
    {
      time: '1:15 - 1:40',
      title: 'Clash Engine & Peer deadlocks',
      desc: 'Co-Attendee mode compares party carts to detect identical fits. Peer shuttle diplomacy compromises when friends disagree.',
      bullets: [
        'Clash Alert: Pop up warnings if Rahul and Deepak wear the same H&M jumper.',
        'Peer Deadlock: Detect conflicting price boundaries (min vs. max price).',
        'Shuttle Diplomacy: Split the difference with compromise alternatives.'
      ],
      action: { type: 'clash', label: '1-Click Trigger Dress Clash' }
    },
    {
      time: '1:40 - 2:00',
      title: 'Wedding Wardrobe Matrix',
      desc: 'An event × member grid. Rejections adjust palettes (e.g. "too bright") or trigger quality upgrades, resolving escalations automatically.',
      bullets: [
        'Family Grid: Coordinate outfit types and palettes across multiple wedding functions.',
        'Veto Harmonization: Mom vetoes Sister\'s outfit; palette shifts or budget stretches.',
        'Auto-escalation: After 5 rejections, present structured proposals.'
      ],
      action: { type: 'wedding', label: '1-Click Seed Wedding Matrix' }
    }
  ];

  return (
    <div className="demo-page-container">
      <div className="demo-header">
        <div className="demo-badge">PITCH COMPANION</div>
        <h1 className="demo-title">StyleOS Executive Presentation</h1>
        <p className="demo-subtitle">
          The 2-Minute Walkthrough Dashboard for Myntra Leaders. Flawlessly present all capabilities with 1-click database sandboxing.
        </p>
        <button 
          className={`autopilot-launch-btn ${loading === 'autopilot' ? 'loading' : ''}`}
          onClick={handleStartAutopilot}
          disabled={loading !== null}
        >
          {loading === 'autopilot' ? '⚡ Initializing Auto-Pilot...' : '🚀 Launch Auto-Pilot Demo (2 Min)'}
        </button>
      </div>

      {new URLSearchParams(window.location.search).get('completed') === 'true' && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid #10b981',
          color: '#34d399',
          padding: '24px',
          borderRadius: '16px',
          marginBottom: '35px',
          textAlign: 'left',
          fontFamily: "'Inter', sans-serif",
          boxShadow: '0 0 30px rgba(16, 185, 129, 0.15)',
          maxWidth: '1200px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 800 }}>🎉 Auto-Pilot Tour Completed!</h2>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#9ca3af', lineHeight: 1.5 }}>
            StyleOS successfully ran through the entire workflow automatically: from entering natural language shopping goals, navigating to the Squad Cart for co-reviewer swipes and comments, analyzing co-attendee dress clashes, and coordinating Punjabi wedding matrix vetoes under budget caps in under 2 minutes.
          </p>
        </div>
      )}

      <div className="demo-grid">
        {/* Left Side: Timeline Walkthrough */}
        <div className="demo-timeline-section">
          <div className="section-title-wrap">
            <span className="dot-glowing"></span>
            <h2>Presentation Timeline (0s - 120s)</h2>
          </div>
          
          <div className="timeline-steps">
            {steps.map((step, idx) => (
              <div 
                key={idx} 
                className={`timeline-step-card ${timelineStep === idx ? 'active' : ''}`}
                onClick={() => setTimelineStep(idx)}
              >
                <div className="timeline-badge-row">
                  <span className="time-badge">{step.time}</span>
                  <span className="step-number">STEP {idx + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                
                {timelineStep === idx && (
                  <div className="timeline-bullets-expand">
                    <div className="script-label">🗣️ PRESENTER SCRIPTS:</div>
                    <ul>
                      {step.bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                    {step.action && (
                      <button 
                        className={`seed-btn ${loading === step.action.type ? 'loading' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleSeed(step.action.type); }}
                        disabled={loading !== null}
                      >
                        {loading === step.action.type ? 'Seeding Sandbox...' : step.action.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Data Flow Visualizer & Value Deck */}
        <div className="demo-visualizer-section">
          <div className="visualizer-card">
            <h2>Interactive Data Flow Mapping</h2>
            <div className="flow-diagram">
              <div className="flow-node">
                <span className="flow-node-title">Gen Z Goal</span>
                <span className="flow-node-sub">"Hostel / Delhi / 15k"</span>
              </div>
              <div className="flow-arrow">➡️</div>
              <div className="flow-node highlight">
                <span className="flow-node-title">Kiya AI Agent</span>
                <span className="flow-node-sub">Ollama Qwen 2.5:7b</span>
              </div>
              <div className="flow-arrow">➡️</div>
              <div className="flow-node">
                <span className="flow-node-title">Squad Cart</span>
                <span className="flow-node-sub">Five Collab Modes</span>
              </div>
              <div className="flow-arrow">➡️</div>
              <div className="flow-node success">
                <span className="flow-node-title">Lookbook</span>
                <span className="flow-node-sub">Approved Wardrobe</span>
              </div>
            </div>
            <p className="flow-caption">
              System flows seamlessly from natural language input to secure, constraint-locked SQL generation and collaborative review.
            </p>
          </div>

          <div className="metrics-card">
            <h2>The Business Case for Myntra</h2>
            <div className="metrics-grid">
              <div className="metric-box">
                <span className="metric-value opportunity">$660B</span>
                <span className="metric-lbl">Gen Z's influenced spending — routed through someone else's decision, today mostly on WhatsApp</span>
                <span className="metric-src">BCG × Snap India</span>
              </div>
              <div className="metric-box">
                <span className="metric-value problem">70.2%</span>
                <span className="metric-lbl">Carts abandoned industry-wide — leaving to "ask someone" is an uncounted slice of this</span>
                <span className="metric-src">Baymard Institute</span>
              </div>
              <div className="metric-box">
                <span className="metric-value problem">30%</span>
                <span className="metric-lbl">Indian buyers explicitly consult family/friends before purchasing</span>
                <span className="metric-src">PwC Consumer Insights</span>
              </div>
              <div className="metric-box">
                <span className="metric-value problem">25–35%</span>
                <span className="metric-lbl">India fashion return rate — fit/style mismatch is the #1 driver, exactly what family sign-off targets</span>
                <span className="metric-src">BePragma</span>
              </div>
              <div className="metric-box">
                <span className="metric-value opportunity">15%</span>
                <span className="metric-lbl">WhatsApp-shared link conversion — highest of any acquisition channel measured</span>
                <span className="metric-src">Demandsage / Friendbuy</span>
              </div>
              <div className="metric-box">
                <span className="metric-value opportunity">+35%</span>
                <span className="metric-lbl">Lifetime revenue from a referred customer vs. a paid-channel one</span>
                <span className="metric-src">Demandsage / Friendbuy</span>
              </div>
            </div>
            <p className="metrics-sources">
              Reasoned from published research, not an A/B test on Myntra's own traffic — that experiment doesn't exist yet.
            </p>
          </div>

          <div className="tech-specs-card">
            <h2>Capabilities Cheat Sheet</h2>
            <div className="spec-item">
              <strong>Ggrounded Copy (Page 24):</strong> Validates that LLM rationales only mention products actually present in the cart, preventing hallucinated product claims.
            </div>
            <div className="spec-item">
              <strong>Constraint Safety:</strong> Invariant 1 (Gender) and Invariant 2 (Garment Category) are hard-locked in SQL and never relaxed. Color is relaxed only as a last resort and reported honestly.
            </div>
            <div className="spec-item">
              <strong>Convergence Engine:</strong> Implements a tabu list of rejected products and price bounds to guarantee a shrinking search space that converges without infinite loops.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
