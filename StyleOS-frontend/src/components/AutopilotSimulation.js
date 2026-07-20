import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AgentPage from '../pages/AgentPage';
import CollabCartPage from '../pages/CollabCartPage';
import PartyPage from '../pages/PartyPage';
import WeddingMatrixPage from '../pages/WeddingMatrixPage';
import MyntraBagPage from '../pages/MyntraBagPage';
import './AutopilotSimulation.css';

export default function AutopilotSimulation() {
  const location = useLocation();
  const { token, id } = useParams();
  const pathname = location.pathname;

  let title = "StyleOS Autopilot Demo";
  let subtitle = "Syncing family shopping decisions in real-time.";
  let phoneLayout = null;

  if (pathname.includes('/agent')) {
    title = "Step 1: Kiya AI Wardrobe Architect";
    subtitle = "Goal-driven catalog shopping under 2 minutes.";
    phoneLayout = (
      <div className="phones-container">
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Rohan's Device (Owner)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <AgentPage />
            </div>
          </div>
        </div>
      </div>
    );
  } else if (pathname.includes('/collab/')) {
    title = "Step 2: Squad Cart & Payer Lock";
    subtitle = "Mom reviews, Dad locks budget. Wardrobe responds instantly.";
    phoneLayout = (
      <div className="phones-container">
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Rohan's Device (Owner)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <CollabCartPage overrideView="owner" />
            </div>
          </div>
        </div>
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Mom / Dad's Device (Collaborator)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <CollabCartPage overrideView="guest" />
            </div>
          </div>
        </div>
      </div>
    );
  } else if (pathname.includes('/party/')) {
    title = "Step 3: Co-Attendee Clash Engine";
    subtitle = "Auto-detect duplicate purchases to avoid graduation twining.";
    phoneLayout = (
      <div className="phones-container">
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Rahul's Device (Attendee 1)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <PartyPage overrideView="rahul" />
            </div>
          </div>
        </div>
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Deepak's Device (Attendee 2)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <PartyPage overrideView="deepak" />
            </div>
          </div>
        </div>
      </div>
    );
  } else if (pathname.includes('/mission/wedding/')) {
    title = "Step 4: Coordinated Family Wedding Matrix";
    subtitle = "Grid coordination with price deadlocks and auto-compromise.";
    phoneLayout = (
      <div className="phones-container">
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Rohan's Device (Coordinator)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <WeddingMatrixPage overrideView="owner" />
            </div>
          </div>
        </div>
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Sister Sneha's Device (Member)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <WeddingMatrixPage overrideView="guest" />
            </div>
          </div>
        </div>
      </div>
    );
  } else if (pathname.includes('/myntra-bag')) {
    title = "Step 5: Checkout & Place Order";
    subtitle = "Original Myntra Bag loaded with coordinated selections.";
    phoneLayout = (
      <div className="phones-container">
        <div className="phone-mockup-frame">
          <div className="phone-label">📱 Rohan's Device (Checkout)</div>
          <div className="phone-device">
            <div className="phone-notch" />
            <div className="phone-content-viewport">
              <MyntraBagPage />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [toast, setToast] = React.useState('');

  React.useEffect(() => {
    const handler = (e) => setToast(e.detail);
    window.addEventListener('autopilot:toast', handler);
    setToast('');
    return () => window.removeEventListener('autopilot:toast', handler);
  }, [pathname]);

  return (
    <div className="autopilot-sim-wrapper">
      <div className="autopilot-sim-header">
        <span className="sim-badge">StyleOS Live Simulation</span>
        <h2 className="sim-title">{title}</h2>
        <p className="sim-subtitle">{subtitle}</p>
        {toast && (
          <div className="sim-toast-banner">
            <span className="sim-toast-pulse" />
            <span className="sim-toast-text">{toast}</span>
          </div>
        )}
      </div>
      {phoneLayout}
    </div>
  );
}
