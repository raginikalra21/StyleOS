import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AuthProvider, useAuth } from './context/AuthContext';

// Existing components
import { Navbar } from './components/index.js';
import { Modal, SimilarProductsContainer } from './containers/index.js';
import { Page404 } from './components/index.js';

// Existing pages
import { HomePage, ProductPage } from './pages/index.js';

// New StyleOS pages
import AgentPage from './pages/AgentPage';
import CollabCartPage from './pages/CollabCartPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CartPage from './pages/CartPage';
import WardrobePage from './pages/WardrobePage';
import CollabInvitesPage from './pages/CollabInvitesPage';
import WeddingIntakePage from './pages/WeddingIntakePage';
import WeddingMatrixPage from './pages/WeddingMatrixPage';
import MissionPickerPage from './pages/MissionPickerPage';
import LookbookPage from './pages/LookbookPage';
import PartyPage from './pages/PartyPage';
import DemoPage from './pages/DemoPage';
import MyntraBagPage from './pages/MyntraBagPage';
import AutopilotSimulation from './components/AutopilotSimulation';




function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  return user ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

function AppInner() {
  const { modals, similarProducts } = useSelector(state => ({
    modals: state.modalsStore,
    similarProducts: state.similarProductsStore,
  }));

  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const autopilot = urlParams.get('autopilot') === 'true';

  return (
    <div className="App">
      {similarProducts.isActive && <SimilarProductsContainer />}
      {modals.isActive && <Modal />}
      {!autopilot && <Navbar />}
      {autopilot ? (
        <AutopilotSimulation />
      ) : (
        <Routes>


        {/* Existing routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/product/:productID" element={<ProductPage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* StyleOS agent */}
        <Route path="/agent" element={
          <PrivateRoute><AgentPage /></PrivateRoute>
        } />

        {/* Cart page */}
        <Route path="/cart/:id" element={
          <PrivateRoute><CartPage /></PrivateRoute>
        } />

        {/* Collab Cart — no auth needed for link (join handled inside) */}
        <Route path="/collab/:token" element={<CollabCartPage />} />

        {/* Collab invites tab */}
        <Route path="/collab-carts" element={
          <PrivateRoute><CollabInvitesPage /></PrivateRoute>
        } />

        {/* Wardrobe */}
        <Route path="/wardrobe" element={
          <PrivateRoute><WardrobePage /></PrivateRoute>
        } />

        {/* Missions — the breadth entry point */}
        <Route path="/mission" element={
          <PrivateRoute><MissionPickerPage /></PrivateRoute>
        } />

        {/* Wedding Wardrobe Matrix */}
        <Route path="/mission/wedding" element={
          <PrivateRoute><WeddingIntakePage /></PrivateRoute>
        } />
        <Route path="/mission/wedding/:id" element={
          <PrivateRoute><WeddingMatrixPage /></PrivateRoute>
        } />

        {/* The close screen — Script A's approved cart and the Matrix's
            completed mission both land here (Part 3 Section 5.6). */}
        <Route path="/lookbook/:type/:id" element={
          <PrivateRoute><LookbookPage /></PrivateRoute>
        } />

        {/* CO-ATTENDEE mode — the Clash Engine (collab_cart_five_modes.md).
            No auth needed, same zero-friction guest join as Collab. */}
        <Route path="/party/:token" element={<PartyPage />} />

        <Route path="/demo" element={<DemoPage />} />
        <Route path="/myntra-bag" element={<MyntraBagPage />} />


        <Route path="*" element={<Page404 />} />
      </Routes>
      )}
    </div>

  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </AuthProvider>
  );
}
