import { getProducts } from "../lib/styleos";
import ProductCard from "../components/ProductCard";
import styles from "./page.module.css";

export default async function Home() {
  const [featured, sample] = await Promise.all([
    getProducts({ limit: 16, sort: "rating" }),
    getProducts({ limit: 40 }),
  ]);
  const multiImage = sample.filter((p) => p.images.length > 1);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>What are you trying to become next?</h1>
        <p>Describe a goal — StyleOS builds the cart. No browsing required.</p>
        <a href="/agent" className={styles.heroCta}>Start with Kiya →</a>
      </section>

      {multiImage.length > 0 && (
        <section className={styles.section}>
          <h2>Full gallery, every angle</h2>
          <div className={styles.grid}>
            {multiImage.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2>Top rated right now</h2>
        <div className={styles.grid}>
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
