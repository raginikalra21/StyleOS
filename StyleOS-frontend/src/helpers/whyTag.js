/**
 * Product-card why-tag — must come from metadata and constraints, not
 * invented LLM text (CLAUDE.md Page 27).
 */
export function buildWhyTag(item, plan) {
  const p = item?.product || {};
  const tags = [];

  if (p.baseColour) tags.push(p.baseColour);

  const living = plan?.context?.living || plan?.context?.storage_constraints || '';
  if (/hostel/i.test(living)) tags.push('Hostel-friendly');

  if (p.fabric && /cotton/i.test(p.fabric)) tags.push('Cotton');

  if (p.mrp && p.price && p.mrp > p.price) tags.push('Discounted');

  return tags.slice(0, 2).join(' + ');
}
