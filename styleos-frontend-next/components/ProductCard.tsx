import Link from "next/link";
import type { StyleOSProduct } from "../lib/styleos/types";
import styles from "./ProductCard.module.css";

export default function ProductCard({ product }: { product: StyleOSProduct }) {
  return (
    <Link href={`/product/${product.id}`} className={styles.card}>
      <div className={styles.imageWrap}>
        {product.images[0] ? (
          // Real product photos come from several local static mounts
          // (H&M/DeepFashion/ethnic supplement) — plain <img> avoids
          // next/image needing every host allow-listed during a fast-moving
          // catalog swap.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt={product.title} loading="lazy" />
        ) : (
          <div className={styles.placeholder}>👕</div>
        )}
        {product.images.length > 1 && (
          <span className={styles.galleryBadge}>+{product.images.length - 1}</span>
        )}
      </div>
      <div className={styles.info}>
        <p className={styles.brand}>{product.brand}</p>
        <p className={styles.title}>{product.title}</p>
        <div className={styles.priceRow}>
          <span className={styles.price}>₹{product.price.toLocaleString('en-IN')}</span>
          {product.discountPercent > 0 && (
            <>
              <span className={styles.mrp}>₹{product.mrp.toLocaleString('en-IN')}</span>
              <span className={styles.discount}>{product.discountPercent}% off</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
