export function searcher(products, query) {
  if (!query || query.trim() === '') return products;

  const q = query.trim().toLowerCase();
  const terms = q.split(' ').filter(Boolean);

  return products.filter(product => {
    const searchable = [
      product.productName || '',
      product.brandName || '',
      product.articleType || '',
      product.occasion || '',
      ...(product.colour || product.color || []),
    ].join(' ').toLowerCase();

    return terms.every(term => searchable.includes(term));
  });
}
