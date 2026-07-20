/**
 * Semantic product search using Ollama embeddings.
 * Falls back to SQL keyword search if embeddings unavailable.
 */
const { query } = require('../db');
const { mapArticleType } = require('./type_map');

const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBED_MODEL  = 'nomic-embed-text';

/**
 * Get embedding vector for a text string via Ollama.
 */
async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = await res.json();
  return data.embeddings[0]; // float array
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

/**
 * Build a rich text description of a product item plan for embedding.
 * This is what gets compared against product embeddings.
 */
function itemToSearchText(item) {
  const parts = [item.type || ''];
  if (item.colors?.length)    parts.push(`color: ${item.colors.join(', ')}`);
  if (item.occasion)          parts.push(`occasion: ${item.occasion}`);
  if (item.fabric_preference) parts.push(`fabric: ${item.fabric_preference}`);
  if (item.avoid?.length)     parts.push(`avoid: ${item.avoid.join(', ')}`);
  if (item.context) {
    if (item.context.life_stage)    parts.push(item.context.life_stage);
    if (item.context.city)          parts.push(item.context.city);
    if (item.context.occasion_type) parts.push(item.context.occasion_type);
    if (item.context.laundry_notes) parts.push(item.context.laundry_notes);
  }
  return parts.join('. ');
}

/**
 * Semantic search: embed the query, fetch candidate products,
 * rank by cosine similarity, return top N.
 *
 * Falls back to SQL search if no embeddings in DB or Ollama unavailable.
 */
async function semanticSearch(item, { gender, colors, budget, quantity = 1, limit = 20 } = {}) {
  try {
    // Without a resolvable category, embedding similarity alone can rank a
    // product from a completely unrelated category (e.g. a Kurti) as "close"
    // to a t-shirt description. Rather than search the whole catalog blind,
    // defer to the caller's SQL fallback which at least reasons explicitly
    // about what matched.
    const mapped = mapArticleType(item.type);
    if (!mapped) return null;
    // Gender must be resolved before semantic search runs too — the SQL
    // fallback isn't the only path that can leak cross-gender results.
    if (!gender) return null;

    const searchText = itemToSearchText(item);
    const queryEmb   = await getEmbedding(searchText);

    // Fetch candidate products with embeddings
    // Pre-filter by article type and budget to keep candidate set manageable
    let sql  = `SELECT id, title, brand, price, mrp, base_colour, article_type,
                       fabric, occasion, delivery_days, rating, images, embedding
                FROM products
                WHERE in_stock = 1 AND embedding IS NOT NULL
                  AND LOWER(article_type) LIKE LOWER(:at)`;
    const binds = { at: `%${mapped}%` };

    if (budget) { sql += ' AND price <= :budget'; binds.budget = Math.round(budget * 1.3); }
    sql += ' AND gender IN (:g1, :g2)'; binds.g1 = gender; binds.g2 = 'Unisex';

    // Embedding similarity is not reliable enough to trust for exact color —
    // it ranks "close" items, not "correct" ones. Hard-filter color here too
    // rather than letting the model's fuzzy sense of "black-ish" decide.
    if (colors && colors.length > 0) {
      const colourPlaceholders = colors.map((c, i) => { binds[`col${i}`] = c; return `:col${i}`; });
      sql += ` AND base_colour IN (${colourPlaceholders.join(', ')})`;
    }

    sql += ' FETCH FIRST 200 ROWS ONLY';
    const r = await query(sql, binds);

    if (!r.rows || r.rows.length === 0) return null; // fall back to SQL

    // Parse embeddings and rank by similarity
    const scored = r.rows
      .map(row => {
        try {
          const emb = JSON.parse(row.EMBEDDING || '[]');
          if (emb.length === 0) return null;
          return { row, score: cosineSim(queryEmb, emb) };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Normalise to consistent shape
    return scored.map(({ row, score }) => ({
      ID:           row.ID,
      TITLE:        row.TITLE,
      BRAND:        row.BRAND,
      PRICE:        row.PRICE,
      MRP:          row.MRP,
      BASE_COLOUR:  row.BASE_COLOUR,
      ARTICLE_TYPE: row.ARTICLE_TYPE,
      FABRIC:       row.FABRIC,
      OCCASION:     row.OCCASION,
      DELIVERY_DAYS:row.DELIVERY_DAYS,
      RATING:       row.RATING,
      IMAGES:       row.IMAGES,
      _score:       score,
    }));

  } catch (err) {
    console.log('Semantic search unavailable, falling back to SQL:', err.message.slice(0, 60));
    return null; // caller handles fallback
  }
}

module.exports = { semanticSearch, getEmbedding, itemToSearchText };
