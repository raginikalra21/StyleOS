/**
 * One-time migration for deployment: uploads every image actually
 * referenced by a product row (NOT the whole local raw/ folders — see
 * check_image_footprint.js, which this reuses the exact same discovery
 * logic from) to Cloudflare R2, then rewrites each product's IMAGES column
 * to point at the new public URL instead of localhost.
 *
 * Usage:
 *   node src/scripts/migrate_images_to_r2.js --limit=20   (test batch first)
 *   node src/scripts/migrate_images_to_r2.js              (full run)
 *
 * Requires in .env: R2_ACCOUNT_ID, R2_BUCKET, R2_ENDPOINT,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_PUBLIC_BASE (the bucket's
 * Public Development URL or custom domain — set once known).
 */
require('dotenv').config();
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { query } = require('../db');
const path = require('path');
const fs = require('fs');

const rawBase = path.join(__dirname, '..', '..', '..', 'data-pipeline', 'raw');
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env — see this script's header comment.`);
  return v;
}

async function main() {
  const bucket = requireEnv('R2_BUCKET');
  // Only needed for the URL-rewrite pass, which a --limit test run skips —
  // don't block a credentials smoke test on a value that isn't known yet.
  const publicBase = LIMIT ? null : requireEnv('R2_PUBLIC_BASE').replace(/\/$/, '');

  const s3 = new S3Client({
    region: 'auto',
    endpoint: requireEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });

  // Same discovery pass as check_image_footprint.js — every unique local
  // file actually referenced by a product row, mapped to its R2 key.
  const r = await query('SELECT id, images FROM products');
  const fileToKey = new Map(); // localFilePath -> r2Key
  const urlToKey = new Map();  // original localhost URL -> r2Key (for the rewrite pass)

  for (const row of r.rows) {
    let imgs;
    try { imgs = JSON.parse(row.IMAGES || '[]'); } catch { continue; }
    for (const url of imgs) {
      const m = url.match(/\/images\/(hm|deepfashion|ethnic)\/(.+)$/);
      if (!m) continue;
      const folder = m[1] === 'ethnic' ? 'ethnic_manual_images' : m[1];
      const r2Key = `${m[1]}/${m[2]}`;
      const filePath = path.join(rawBase, folder, m[2]);
      fileToKey.set(filePath, r2Key);
      urlToKey.set(url, r2Key);
    }
  }

  let entries = [...fileToKey.entries()];
  if (LIMIT) entries = entries.slice(0, LIMIT);
  console.log(`Uploading ${entries.length} file(s) to R2 bucket "${bucket}"...`);

  // Sequential would take hours for 96k files — run a bounded worker pool
  // instead. Each worker pulls the next entry off a shared cursor until
  // the list is exhausted, so concurrency stays fixed at CONCURRENCY
  // regardless of how fast/slow individual uploads are.
  const CONCURRENCY = 40;
  let cursor = 0, uploaded = 0, skipped = 0, failed = 0, done = 0;

  async function worker() {
    while (cursor < entries.length) {
      const [filePath, r2Key] = entries[cursor++];
      try {
        // Idempotent — skip if already uploaded (lets a run be safely resumed).
        let exists = false;
        try {
          await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: r2Key }));
          exists = true;
        } catch { /* not found — proceed to upload */ }

        if (exists) {
          skipped++;
        } else {
          const body = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          await s3.send(new PutObjectCommand({
            Bucket: bucket, Key: r2Key, Body: body,
            ContentType: CONTENT_TYPES[ext] || 'application/octet-stream',
          }));
          uploaded++;
        }
      } catch (e) {
        failed++;
        console.error(`FAILED ${r2Key}: ${e.message}`);
      }
      done++;
      if (done % 1000 === 0) console.log(`  ${done}/${entries.length} (${uploaded} uploaded, ${skipped} already there, ${failed} failed)`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Upload pass done — uploaded ${uploaded}, skipped ${skipped} (already present), failed ${failed}.`);

  if (LIMIT) {
    console.log('\n--limit run only — not rewriting DB URLs. Re-run without --limit for the full migration.');
    return;
  }
  if (failed > 0) {
    console.log('\nSome uploads failed — not rewriting DB URLs. Fix and re-run (already-uploaded files are skipped automatically).');
    return;
  }

  console.log('\nRewriting product IMAGES columns to point at R2...');
  let rowsUpdated = 0;
  for (const row of r.rows) {
    let imgs;
    try { imgs = JSON.parse(row.IMAGES || '[]'); } catch { continue; }
    let changed = false;
    const rewritten = imgs.map(url => {
      const key = urlToKey.get(url);
      if (!key) return url;
      changed = true;
      return `${publicBase}/${key}`;
    });
    if (changed) {
      await query('UPDATE products SET images = :imgs WHERE id = :id', { imgs: JSON.stringify(rewritten), id: row.ID });
      rowsUpdated++;
    }
  }
  console.log(`Done — ${rowsUpdated} product rows now point at R2 (${publicBase}).`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
