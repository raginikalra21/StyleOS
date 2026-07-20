import {
    ADD_TO_BAG,
    REMOVE_FROM_BAG,
    EMPTY_BAG,
    SET_QUANTITY,
    SET_SIZE,
} from '../actions/bag';

const defaultBagState = [];

export default function bag(state = defaultBagState, action) {
    switch (action.type) {
        case ADD_TO_BAG:
            var alreadyPresent=false;
            state.map(item => {
                if(item.id == action.item.id){
                    alreadyPresent=true;
                }
            })
            console.log(alreadyPresent);
            if(!alreadyPresent){
                return [...state, action.item];
            }
            return [...state];
        case REMOVE_FROM_BAG:
            return state.filter(item => item.id !== action.item.id);
        case EMPTY_BAG:
            // No blocking alert() here — a reducer firing a native dialog
            // mid-dispatch was interrupting the React Router navigation
            // that follows checkout, landing on a blank page until a
            // manual refresh. Navigating to the real cart page (see
            // BagContainer.js's checkOutHandler) is confirmation enough.
            return [];
        case SET_QUANTITY:
            return state.map(item => {
                if (item.id === action.item.id) {
                    return {
                        ...item,
                        quantity: action.quantity
                    }
                }
                return item;
            });
        case SET_SIZE:
            return state.map(item => {
                if (item.id === action.item.id) {
                    return {
                        ...item,
                        size: action.size
                    }
                }
                return item;
            });
        default:
            return state;
    }
}