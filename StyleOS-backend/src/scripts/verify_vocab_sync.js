/**
 * Vocab-sync check specific to the H&M/DeepFashion catalog migration —
 * article_type and base_colour are pivot values duplicated across
 * data-pipeline/catalog_vocab.py, services/catalog_filter.js's COLOUR_NORM,
 * and services/type_map.js's TYPE_MAP. This diffs what's actually IN the
 * database against what the backend code actually recognizes, so a
 * mismatch is caught before it becomes silent unfilterable inventory or a
 * dead filter no product ever matches.
 *
 * Usage: node src/scripts/verify_vocab_sync.js
 */
require('dotenv').config();
const { query, closePool } = require('../db');
const { COLOUR_NORM } = require('../services/catalog_filter');
const { TYPE_MAP } = require('../services/type_map');

async function main() {
  const dbArticleTypes = (await query('SELECT DISTINCT article_type FROM products')).rows
    .map(r => r.ARTICLE_TYPE).filter(Boolean).sort();
  const dbColours = (await query('SELECT DISTINCT base_colour FROM products')).rows
    .map(r => r.BASE_COLOUR).filter(Boolean).sort();

  const knownArticleTypes = new Set(Object.values(TYPE_MAP));
  const knownColours = new Set(Object.values(COLOUR_NORM));

  const orphanedArticleTypes = dbArticleTypes.filter(t => !knownArticleTypes.has(t));
  const deadArticleTypeFilters = [...knownArticleTypes].filter(t => !dbArticleTypes.includes(t));

  const orphanedColours = dbColours.filter(c => !knownColours.has(c));
  const deadColourFilters = [...knownColours].filter(c => !dbColours.includes(c));

  console.log('=== Vocab Sync Check ===\n');
  console.log(`DB article_types: ${dbArticleTypes.length}, backend-known: ${knownArticleTypes.size}`);
  console.log(`DB colours: ${dbColours.length}, backend-known: ${knownColours.size}\n`);

  if (orphanedArticleTypes.length) {
    console.log(`⚠️  DB has article_type values with ZERO backend TYPE_MAP reference (unfilterable via LLM item mapping):`);
    orphanedArticleTypes.forEach(t => console.log(`    ${t}`));
  } else {
    console.log('✅ Every DB article_type is reachable via TYPE_MAP.');
  }

  if (deadArticleTypeFilters.length) {
    console.log(`\nℹ️  TYPE_MAP values with ZERO matching DB rows (dead filters, not necessarily a bug):`);
    deadArticleTypeFilters.forEach(t => console.log(`    ${t}`));
  }

  if (orphanedColours.length) {
    console.log(`\n⚠️  DB has base_colour values with ZERO backend COLOUR_NORM reference (a user asking for this exact word can't match it):`);
    orphanedColours.forEach(c => console.log(`    ${c}`));
  } else {
    console.log('\n✅ Every DB base_colour is reachable via COLOUR_NORM.');
  }

  if (deadColourFilters.length) {
    console.log(`\nℹ️  COLOUR_NORM values with ZERO matching DB rows (dead filters, not necessarily a bug):`);
    deadColourFilters.forEach(c => console.log(`    ${c}`));
  }

  const sourceCounts = (await query('SELECT source, COUNT(*) as cnt FROM products GROUP BY source')).rows;
  console.log('\n=== Row counts by source ===');
  sourceCounts.forEach(r => console.log(`  ${r.SOURCE}: ${r.CNT}`));

  await closePool();

  const hardFail = orphanedArticleTypes.length > 0;
  if (hardFail) {
    console.log('\n❌ FAIL — orphaned article_type values found. Add them to type_map.js or fix the seed mapping.');
    process.exit(1);
  }
  console.log('\n✅ Vocab sync check passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
