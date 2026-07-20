import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function AutopilotNarrator() {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const autopilot = urlParams.get('autopilot') === 'true';

  const [currentLine, setCurrentLine] = useState({ speaker: '', text: '', icon: '' });

  useEffect(() => {
    if (!autopilot) {
      setCurrentLine({ speaker: '', text: '', icon: '' });
      return;
    }

    const pathname = location.pathname;
    const timers = [];

    // Clear previous line on path change
    setCurrentLine({ speaker: '', text: '', icon: '' });

    if (pathname.includes('/agent')) {
      const script = [
        { time: 0, speaker: 'Narrator', icon: '🎙️', text: "Rohan is starting college next month. StyleOS coordinates his wardrobe with family directly inside Myntra." },
        { time: 3000, speaker: 'Rohan', icon: '🎓', text: "I need a college wardrobe. Let's ask Kiya to shop with a Rs. 15,000 budget, grey and black only." },
        { time: 6000, speaker: 'Kiya AI', icon: '✨', text: "Analyzing categories. Please clarify your gender first so I find the perfect fits." },
        { time: 9000, speaker: 'Rohan', icon: '🎓', text: "Selecting Men. Let's see what she finds." },
        { time: 12000, speaker: 'Kiya AI', icon: '✨', text: "I have shopped 8 matching items. Let's share this cart with my family to get reviews!" }
      ];

      script.forEach(line => {
        const tid = setTimeout(() => setCurrentLine(line), line.time);
        timers.push(tid);
      });
    } else if (pathname.includes('/collab/')) {
      const script = [
        { time: 0, speaker: 'Mom', icon: '👩‍🦱', text: "Rohan, this shirt is too plain! And why are you buying a basic sweatshirt for ₹1,370? Ask your dad." },
        { time: 3500, speaker: 'Dad (CFO)', icon: '👨', text: "I am locking the total budget to ₹8,000 maximum. And no single item should exceed ₹1,200!" },
        { time: 7000, speaker: 'Kiya AI', icon: '✨', text: "Payer Lock activated! Automatically replacing expensive items with affordable ones to fit Dad's rules." }
      ];

      script.forEach(line => {
        const tid = setTimeout(() => setCurrentLine(line), line.time);
        timers.push(tid);
      });
    } else if (pathname.includes('/party/')) {
      const script = [
        { time: 0, speaker: 'Narrator', icon: '🎙️', text: "Graduation party clash! StyleOS Clash Engine compares attendee carts and triggers a warning: Deepak also has the H&M Jumper!" }
      ];

      script.forEach(line => {
        const tid = setTimeout(() => setCurrentLine(line), line.time);
        timers.push(tid);
      });
    } else if (pathname.includes('/mission/wedding/')) {
      const script = [
        { time: 0, speaker: 'Narrator', icon: '🎙️', text: "Wedding Matrix coordination: Sister Sneha's slot is vetoed by Mom as 'too cheap/dull'." },
        { time: 3500, speaker: 'Narrator', icon: '🎙️', text: "Sister demands quality (min ₹2,500). Mom demands a low price limit (max ₹2,000). A price deadlock is detected!" },
        { time: 7000, speaker: 'Narrator', icon: '🎙️', text: "StyleOS resolves this by splitting the difference and finding a compromise kurta. Coordinated!" }
      ];

      script.forEach(line => {
        const tid = setTimeout(() => setCurrentLine(line), line.time);
        timers.push(tid);
      });
    } else if (pathname.includes('/myntra-bag')) {
      const script = [
        { time: 0, speaker: 'Narrator', icon: '🎙️', text: "Rohan goes to his Myntra Shopping Bag. All approved family selections are pre-loaded with size details, price, and discounts!" },
        { time: 3000, speaker: 'Rohan', icon: '🎓', text: "Awesome, placing the order now!" }
      ];

      script.forEach(line => {
        const tid = setTimeout(() => setCurrentLine(line), line.time);
        timers.push(tid);
      });
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [location.pathname, autopilot]);

  if (!autopilot || !currentLine.text) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '90%',
      maxWidth: '650px',
      background: 'rgba(15, 16, 22, 0.95)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 63, 108, 0.35)',
      borderRadius: '16px',
      padding: '16px 20px',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 63, 108, 0.15)',
      zIndex: 99999999,
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      animation: 'slideUp 0.3s ease'
    }}>
      <div style={{
        fontSize: '2.5rem',
        background: 'rgba(255, 63, 108, 0.1)',
        padding: '10px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255, 63, 108, 0.2)'
      }}>
        {currentLine.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '0.8rem',
          fontWeight: 800,
          color: '#ff3f6c',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '4px'
        }}>
          {currentLine.speaker}
        </div>
        <div style={{
          fontSize: '0.92rem',
          color: '#f3f4f6',
          lineHeight: '1.5',
          fontWeight: 500
        }}>
          {currentLine.text}
        </div>
      </div>
    </div>
  );
}
