import React from 'react';
import logo from '../../assets/images/logo.png';
import './Navbar.css';
import { ReactComponent as Search } from "../../assets/images/search.svg";
import { ReactComponent as Profile } from "../../assets/images/profile.svg";
import { ReactComponent as Wishlist } from "../../assets/images/heart.svg";
import { ReactComponent as Bag } from "../../assets/images/bag.svg";
import { useDispatch, useSelector } from 'react-redux';
import { useState } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { openModal } from '../../actions/modals';
import { search, toggleSearchState } from '../../actions/search';
import { addGenderFilter, addDiscountFilter, clearAllFilters } from '../../actions/filters';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { currentSearchQuery, isSearchActive } = useSelector(state => ({
        currentSearchQuery: state.searchStore.query,
        isSearchActive: state.searchStore.isSearchActive,
    }));
    const [query, setQuery] = useState(currentSearchQuery);
    const dispatch = useDispatch();

    // Catalog is fashion-only (no home goods), so HOME & LIVING just clears
    // filters rather than pretending to have inventory that doesn't exist.
    const navLinks = [
        { label: "MEN", onClick: () => dispatch(addGenderFilter('Men')) },
        { label: "WOMEN", onClick: () => dispatch(addGenderFilter('Women')) },
        { label: "KIDS", onClick: () => dispatch(addGenderFilter('Kids')) },
        { label: "HOME & LIVING", onClick: () => dispatch(clearAllFilters()) },
        { label: "OFFERS", onClick: () => dispatch(addDiscountFilter(30)) },
    ];

    function searchQueryHandler(q) {
        dispatch(search((q || '').trim()));
    }

    const bagItemCount = useSelector(state => state.bagStore.length);

    return (
        <div className="navbar flex-row">
            <Link to="/">
                <img src={logo} alt="logo" className={isSearchActive ? "logo mobile-hide" : "logo"} />
            </Link>

            <div className="nav-links-container flex-row">
                {navLinks.map((navLink, index) => (
                    <div
                        className="nav-link"
                        key={index}
                        onClick={() => { navLink.onClick(); navigate('/'); }}
                    >
                        {navLink.label}
                    </div>
                ))}
            </div>

            <div className={isSearchActive ? "search-container flex-row center" : "mobile-hide search-container flex-row center"}>
                <span className="back-from-search" onClick={() => dispatch(toggleSearchState(false))}>
                    <i className="fas fa-arrow-left"></i>
                </span>
                <Search className="search-icon" onClick={() => searchQueryHandler(query)} />
                <input
                    type="text"
                    className="search-box"
                    placeholder="Search for products, brands..."
                    value={query !== null ? query : ""}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") searchQueryHandler(query); }}
                />
                <span
                    className={(query === null || query === "") ? "hide" : "clear-query-button"}
                    onClick={() => { setQuery(null); searchQueryHandler(null); }}
                >
                    <i className="far fa-times-circle"></i>
                </span>
            </div>

            <div className={isSearchActive ? "mobile-hide action-container flex-row" : "action-container flex-row"}>
                <div className="action-item mobile-search-button" onClick={() => dispatch(toggleSearchState(true))}>
                    <Search className="action-icon" />
                </div>

                {/* StyleOS — the one entry point into every mission (Wedding, College, any occasion) */}
                <Link to="/mission" className="styleos-btn" title="StyleOS">
                    ✨ StyleOS
                </Link>

                {/* Demo Center */}
                <Link to="/demo" className="styleos-btn demo-btn" title="Demo Center" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', boxShadow: '0 0 10px rgba(168,85,247,0.4)', border: 'none', marginLeft: '10px' }}>
                    ✨ Demo Center
                </Link>

                {/* Collab Carts */}
                {user && (
                    <Link to="/collab-carts" className="action-item" title="Collab Carts">
                        <span style={{ fontSize: '1.3rem' }}>👗</span>
                        <p className="action-text">Collab</p>
                    </Link>
                )}

                {/* Saved wardrobes — previously only reachable by typing the
                    URL directly, no nav entry point at all. */}
                {user && (
                    <Link to="/wardrobe" className="action-item" title="My Wardrobe">
                        <span style={{ fontSize: '1.3rem' }}>🧺</span>
                        <p className="action-text">Wardrobe</p>
                    </Link>
                )}

                {/* Profile / Auth */}
                <div className="action-item" onClick={() => user ? logout() : navigate('/login')}>
                    <Profile className="action-icon" />
                    <p className="action-text">{user ? user.name?.split(' ')[0] : 'Login'}</p>
                </div>

                <div className="action-item" onClick={() => dispatch(openModal('wishlist'))}>
                    <Wishlist className="action-icon" />
                    <p className="action-text">Wishlist</p>
                </div>

                <div className="action-item" onClick={() => dispatch(openModal('bag'))}>
                    <Bag className="action-icon" />
                    {bagItemCount !== 0 && <p className="bag-item-count">{bagItemCount}</p>}
                    <p className="action-text">Bag</p>
                </div>
            </div>
        </div>
    );
}
