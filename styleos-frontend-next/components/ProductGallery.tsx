"use client";
import { useState } from "react";
import styles from "./ProductGallery.module.css";

export default function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const shown = images.length > 0 ? images : [null];

  return (
    <div className={styles.wrap}>
      <div className={styles.mainImage}>
        {shown[active] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown[active] as string} alt={title} />
        ) : (
          <div className={styles.placeholder}>👕</div>
        )}
      </div>
      {images.length > 1 && (
        <div className={styles.thumbRow}>
          {images.map((img, i) => (
            <button
              key={img + i}
              className={`${styles.thumb} ${i === active ? styles.thumbActive : ''}`}
              onClick={() => setActive(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`${title} view ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
