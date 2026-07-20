require('dotenv').config();
const { query } = require('../db');
const path = require('path');
const fs = require('fs');

(async () => {
  const r = await query('SELECT images FROM products');
  const rawBase = path.join(__dirname, '..', '..', '..', 'data-pipeline', 'raw');
  console.log('rawBase:', rawBase, '| exists:', fs.existsSync(rawBase));

  let totalBytes = 0, fileCount = 0, missing = 0;
  const seen = new Set();

  for (const row of r.rows) {
    let imgs;
    try { imgs = JSON.parse(row.IMAGES || '[]'); } catch { continue; }
    for (const url of imgs) {
      const m = url.match(/\/images\/(hm|deepfashion|ethnic)\/(.+)$/);
      if (!m) continue;
      const folder = m[1] === 'ethnic' ? 'ethnic_manual_images' : m[1];
      const relPath = m[2];
      const key = folder + '/' + relPath;
      if (seen.has(key)) continue;
      seen.add(key);
      const filePath = path.join(rawBase, folder, relPath);
      try {
        const st = fs.statSync(filePath);
        totalBytes += st.size;
        fileCount++;
      } catch {
        missing++;
      }
    }
  }
  console.log('unique referenced files:', fileCount);
  console.log('missing on disk:', missing);
  console.log('total size:', (totalBytes / (1024 ** 3)).toFixed(2), 'GB');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
