import { getProducts } from "../../lib/styleos";
import ProductCard from "../../components/ProductCard";
import styles from "./page.module.css";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; gender?: string; articleType?: string; baseColour?: string }>;
}) {
  const params = await searchParams;
  const products = await getProducts({
    q: params.q,
    gender: params.gender,
    articleType: params.articleType,
    baseColour: params.baseColour,
    limit: 60,
  });

  return (
    <div className={styles.page}>
      <form className={styles.searchBar} action="/search">
        <input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="Search products, brands..."
        />
        <button type="submit">Search</button>
      </form>

      <p className={styles.count}>{products.length} results</p>

      {products.length === 0 ? (
        <p className={styles.empty}>No products matched — try a different search.</p>
      ) : (
        <div className={styles.grid}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
