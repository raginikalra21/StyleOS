import {
    FETCH_PRODUCTS,
    SET_LOADING,
} from '../actions/products';

const defaultProductState = [];

export default function products(state = defaultProductState, action) {
    switch (action.type) {
        case FETCH_PRODUCTS:
            return action.products || [];
        case SET_LOADING:
            return state; // loading handled in component level, keep products unchanged
        default:
            return state;
    }
}