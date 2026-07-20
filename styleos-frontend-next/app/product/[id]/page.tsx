import { notFound } from "next/navigation";
import { getProduct } from "../../../lib/styleos";
import ProductGallery from "../../../components/ProductGallery";
import styles from "./page.module.css";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className={styles.page}>
      <ProductGallery images={product.images} title={product.title} />

      <div className={styles.info}>
        <p className={styles.brand}>{product.brand}</p>
        <h1 className={styles.title}>{product.title}</h1>

        <div className={styles.ratingRow}>
          <span className={styles.ratingBadge}>{product.rating.toFixed(1)} ★</span>
          <span className={styles.ratingCount}>{product.ratingCount.toLocaleString('en-IN')} ratings</span>
        </div>

        <div className={styles.priceRow}>
          <span className={styles.price}>₹{product.price.toLocaleString('en-IN')}</span>
          {product.discountPercent > 0 && (
            <>
              <span className={styles.mrp}>₹{product.mrp.toLocaleString('en-IN')}</span>
              <span className={styles.discount}>{product.discountPercent}% off</span>
            </>
          )}
        </div>

        <div className={styles.tags}>
          <span className={styles.tag}>{product.baseColour}</span>
          <span className={styles.tag}>{product.articleType}</span>
          <span className={styles.tag}>🚚 {product.deliveryDays} days</span>
        </div>

        {product.sizes.length > 0 && (
          <div className={styles.sizes}>
            <p className={styles.sizesLabel}>Size</p>
            <div className={styles.sizeRow}>
              {product.sizes.map((s) => (
                <span key={s} className={styles.sizeChip}>{s}</span>
              ))}
            </div>
          </div>
        )}

        <p className={styles.description}>{product.description}</p>

        <button className={styles.addBtn} disabled={!product.inStock}>
          {product.inStock ? 'Add to bag' : 'Out of stock'}
        </button>
      </div>
    </div>
  );
}
