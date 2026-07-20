import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './BagContainer.css';
import {BagItemCard , Empty} from '../../components/index';
import {emptyBag} from '../../actions/bag';
import {closeModal} from '../../actions/modals';
import {useDispatch, useSelector} from 'react-redux';
import { findTotal } from '../../helpers/general';
import { cart as cartApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function BagContainer() {
    const bag = useSelector(state => state.bagStore);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [creatingCart, setCreatingCart] = useState(false);

    // "Checkout" here means: turn the local bag into a REAL backend cart —
    // the same cart_id Kiya-built carts use — so it can generate a Squad
    // Cart and go through the exact same family-review flow, not a
    // separate, disconnected path just because it started from browsing
    // instead of a goal.
    async function checkOutHandler(){
        if (creatingCart) return;
        let checkoutCheck = true;
        bag.forEach(product => {
            if( product.size === undefined ){
                window.alert('Please select size for ' + product.productName);
                checkoutCheck = false;
            }
        })
        if (!checkoutCheck) return;

        if (!user) {
            window.alert('Please log in to check out.');
            dispatch(closeModal());
            navigate('/login');
            return;
        }

        setCreatingCart(true);
        try {
            const newCart = await cartApi.create('My Bag', '');
            const cartId = newCart.id || newCart.ID;
            for (const product of bag) {
                await cartApi.addItem(cartId, product.id, product.size, product.quantity || 1);
            }
            dispatch(emptyBag());
            dispatch(closeModal());
            navigate(`/cart/${cartId}`);
        } catch (err) {
            console.error(err);
            window.alert("Couldn't start checkout — please try again.");
        } finally {
            setCreatingCart(false);
        }
    }
    return (
        <div className="bag-container flex-row " >
            {
                bag.length === 0 ?
                <Empty />
                :
                bag.map((product,index) =>{
                    return (
                        <BagItemCard item={product} key={product.id} />
                    )
                })
            }
            <div className="bag-action" >
                <div className="total-amount center" >
                    <p>₹ { findTotal(bag) }</p>
                </div>
                <div
                    className={`checkout center ${ bag.length > 0 && !creatingCart ? "" : "inactive"} `}
                    onClick={ checkOutHandler }
                >
                    <p>
                        {creatingCart ? 'Preparing your cart...' : <>Checkout <i class="fas fa-arrow-circle-right"></i></>}
                    </p>
                </div>
            </div>
        </div>
    )
}
