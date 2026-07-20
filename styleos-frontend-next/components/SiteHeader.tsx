import Link from "next/link";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>StyleOS</Link>
      <nav className={styles.nav}>
        <Link href="/search">Shop</Link>
        <Link href="/agent">Ask Kiya</Link>
      </nav>
    </header>
  );
}
