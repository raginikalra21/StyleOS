import React, { useState } from 'react'
import './ItemCard.css'
import {ViewSimilarButton} from '../index';
import {Link } from "react-router-dom";
import { addItemToWishlist , removeItemFromWishlist } from '../../actions/wishlist';
import { addItemToBag } from '../../actions/bag';
import { useDispatch , useSelector } from 'react-redux';
import { nFormatter , isInWishList, isInBag } from '../../helpers/general';
export default function ItemCard( {item , index} ) {

    const dispatch = useDispatch();
    const wishlist = useSelector(state => state.wishlistStore);
    const bag = useSelector(state => state.bagStore);
    let isWishlisted = isInWishList( wishlist , item );
    let isBagged = isInBag( bag , item );
    const [pickingSize, setPickingSize] = useState(false);
    const sizes = item.sizes && item.sizes.length > 0 ? item.sizes : ['S', 'M', 'L', 'XL'];

    const handleQuickAdd = (size) => {
        dispatch(addItemToBag(item, size));
        setPickingSize(false);
    };
    return (
        <div className="item-card" key={index}>
            <div className="item-image">
                <Link to={`/product/${item.id}`}>
                    <img
                      src={Array.isArray(item.images) ? item.images[0] : item.images}
                      alt={item.productName}
                      loading="lazy"
                      onError={e => { e.target.src = 'https://via.placeholder.com/300x400?text=' + encodeURIComponent(item.articleType || 'Product'); }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </Link>
                <div className="rating-detail" > 
                    {item.rating} <i class="fas fa-star star"></i> | {nFormatter(item.numberOfReviews)}
                </div>
                <div>
                    <ViewSimilarButton item={item} externalClassName="view-similar-mobile-button" />
                </div>
            </div>
            <Link to={`/${item.id}`}>
                <div className="item-info">
                    <p className="brand-name" >{item.brandName}</p>
                    <p className="product-name" >{item.productName}</p>
                    <p className="price-details" >
                        <span className="price" >Rs. {item.price || item.originalPrice}</span> 
                        &nbsp;
                        <span className="actual-price" >Rs. {item.originalPrice}</span> 
                        &nbsp;
                        <span className="discount" >({item.discountPercent}% <span className="off" >OFF</span>)</span> 
                    </p>
                </div>
            </Link>
            <div className="item-action">
                <ViewSimilarButton item={item} externalClassName="item-card-similar-button"/>
                <button 
                    className="wishlist-button add-to-wishlist center" 
                    onClick={()=> dispatch(addItemToWishlist(item))}
                    style={{display: isWishlisted ? 'none' : 'block'}}
                >
                    <i class="far fa-heart heart-add"></i>
                    &nbsp;
                    WISHLIST
                </button>
                <button 
                    className="wishlist-button remove-from-wishlist center" 
                    onClick={()=> dispatch(removeItemFromWishlist(item))}
                    style={{display: !isWishlisted ? 'none' : 'block'}}
                >
                    <i 
                        class="fas fa-heart heart-remove"
                        style={{color: 'red'}}
                    ></i>
                    &nbsp;
                    WISHLISTED
                </button>
                {isBagged ? (
                    <button className="quick-add-button center added" disabled>
                        <i class="fas fa-check"></i>&nbsp;IN BAG
                    </button>
                ) : (
                    <button
                        className="quick-add-button center"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setPickingSize(true); }}
                    >
                        <i class="fas fa-shopping-bag"></i>&nbsp;ADD TO BAG
                    </button>
                )}
            </div>
            <div className="item-list-mobile-action" >
                <button
                    onClick={()=> dispatch(addItemToWishlist(item))}
                    style={{display: isWishlisted ? 'none' : 'block'}}
                >
                    <i class="far fa-heart heart-add"></i>
                </button>
                <button
                    onClick={()=> dispatch(removeItemFromWishlist(item))}
                    style={{display: !isWishlisted ? 'none' : 'block'}}
                >
                    <i class="fas fa-heart heart-remove"></i>
                </button>
                <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setPickingSize(true); }}
                    style={{display: isBagged ? 'none' : 'block'}}
                >
                    <i class="fas fa-shopping-bag"></i>
                </button>
            </div>
            {pickingSize && (
                <div className="quick-size-sheet-backdrop" onClick={e => { e.preventDefault(); e.stopPropagation(); setPickingSize(false); }}>
                    <div className="quick-size-sheet" onClick={e => e.stopPropagation()}>
                        <p className="quick-size-sheet-title">Select size — {item.productName}</p>
                        <div className="quick-size-row">
                            {sizes.map(size => (
                                <button key={size} className="quick-size-chip" onClick={() => handleQuickAdd(size)}>
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
