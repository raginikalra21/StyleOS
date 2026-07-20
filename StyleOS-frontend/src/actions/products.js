import { normalizeProduct } from '../helpers/normalizeProduct';

export const FETCH_PRODUCTS = "FETCH_PRODUCTS";
export const SET_LOADING = "SET_LOADING";

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const fetchProducts = (params = {}) => async (dispatch) => {
  dispatch({ type: SET_LOADING, loading: true });
  try {
    const qs = new URLSearchParams({
      limit: 100,
      sortBy: 'rating',
      ...params,
    }).toString();

    const res = await fetch(`${API}/products?${qs}`);
    const data = await res.json();

    const products = (data.products || []).map(normalizeProduct);

    dispatch({ type: FETCH_PRODUCTS, products });
  } catch (err) {
    console.error('fetchProducts error:', err);
    dispatch({ type: FETCH_PRODUCTS, products: [] });
  } finally {
    dispatch({ type: SET_LOADING, loading: false });
  }
};
