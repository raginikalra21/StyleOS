import React, { useEffect } from 'react';
import { ProductListContainer, FilterContainer } from '../containers/index.js';
import { fetchProducts } from '../actions/products.js';
import { Breadcrumb } from '../components/index.js';
import { useDispatch, useSelector } from 'react-redux';

export default function Home() {
  const dispatch = useDispatch();
  const products  = useSelector(state => state.productStore);
  const searchQuery = useSelector(state => state.searchStore.query);
  // 'Kids' isn't a single DB gender value (data has Boys/Girls separately),
  // so it's resolved client-side by the filterer instead of sent to the API.
  const genderFilter = useSelector(state => state.filtersStore.gender);

  // Re-fetch whenever search or the nav category filter changes, so a
  // gender click pulls a real, complete set from the DB instead of
  // client-filtering whatever arbitrary slice happened to load first.
  useEffect(() => {
    const params = { limit: 120 };
    if (searchQuery && searchQuery.trim() !== '') params.q = searchQuery;
    if (genderFilter === 'Kids') params.gender = 'Boys,Girls';
    else if (genderFilter) params.gender = genderFilter;
    dispatch(fetchProducts(params));
  }, [searchQuery, genderFilter]);

  return (
    <div>
      <Breadcrumb />
      <FilterContainer />
      <ProductListContainer products={products} />
    </div>
  );
}
