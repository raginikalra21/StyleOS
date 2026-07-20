const router = require('express').Router();
const auth = require('../middleware/auth');
const { Mission, MissionEvent, MissionMember, MissionSlot, User } = require('../models');
const { planMission } = require('../services/llm');
const { allowedArticleTypes, eventShares, defaultPalette, genderBucket, adjustPaletteForReason, classifyObjection } = require('../services/mission_config');
const { query } = require('../db');
const { ownsMission } = require('../middleware/ownership');
const convergence = require('../services/convergence');

function safeJson(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// POST /api/mission/wedding/create
router.post('/wedding/create', auth, async (req, res) => {
  try {
    const { community, events, members, totalBudget, city, title } = req.body;
    if (!events?.length || !members?.length || !totalBudget) {
      return res.status(400).json({ error: 'events, members and totalBudget are required' });
    }

    const mission = await Mission.create({
      userId: req.user.id, type: 'wedding',
      title: title || `${community || 'Family'} Wedding`,
      community: community || null, totalBudget, city: city || null,
    });

    const createdEvents = await MissionEvent.createMany(mission.id, events.map(e => ({
      name: e.name, paletteFamily: e.paletteFamily || defaultPalette(e.name),
    })));
    const createdMembers = await MissionMember.createMany(mission.id, members);

    const shares = eventShares(createdEvents.map(e => e.name));
    const totalWeight = createdMembers.reduce((s, m) => s + (m.roleWeight || 1), 0) || 1;

    const slotsToCreate = [];
    for (const ev of createdEvents) {
      const eventBudget = totalBudget * (shares[ev.name] ?? 0);
      for (const mem of createdMembers) {
        slotsToCreate.push({
          missionId: mission.id, eventId: ev.id, memberId: mem.id,
          allocatedBudget: Math.round(eventBudget * ((mem.roleWeight || 1) / totalWeight)),
        });
      }
    }
    const slots = await MissionSlot.createMany(slotsToCreate);

    res.status(201).json({
      mission: { id: mission.id, community, totalBudget, city, title },
      events: createdEvents, members: createdMembers, slots,
    });
  } catch (err) {
    console.error('Wedding create error:', err);
    res.status(500).json({ error: 'Failed to create wedding mission: ' + err.message });
  }
});

// GET /api/mission/wedding/:id
router.get('/wedding/:id', auth, async (req, res) => {
  try {
    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!ownsMission(mission, req.user.id)) return res.status(403).json({ error: 'Not authorized for this mission' });

    const events = await MissionEvent.findByMission(req.params.id);
    const members = await MissionMember.findByMission(req.params.id);
    const slots = await MissionSlot.findByMission(req.params.id);
    const spent = slots.reduce((s, sl) => s + (sl.product?.price || 0), 0);

    const rejections = await query(
      `SELECT * FROM slot_rejections WHERE mission_id = :1 ORDER BY rejected_at ASC`,
      [req.params.id]
    );

    res.json({ mission, events, members, slots, spent, rejections: rejections.rows || [] });
  } catch (err) {
    console.error('Failed to fetch mission:', err);
    res.status(500).json({ error: 'Failed to fetch mission' });
  }
});

// Fabrics that read as "premium" across most ethnic categories — used only
// as a soft ORDER BY tiebreak for quality/prestige objections, never as a
// hard filter (a thin catalog slice could otherwise produce a false
// shortfall, same honesty principle as Page 22's scoring approach).
const PREMIUM_FABRICS = ['Silk', 'Net', 'Velvet', 'Georgette', 'Satin', 'Brocade'];

/**
 * Finds the best product for a slot. Returns { product, note } or null.
 *
 * `upgrade` (Page 55): a quality/prestige objection biases toward a
 * stretched budget, higher rating, and premium fabric instead of just
 * shifting the palette.
 *
 * `learnedConstraints` / `escalationLevel` (Part 3, Section 3.1): the
 * convergence engine's accumulated state for this slot. Rejected products
 * are ALWAYS excluded (tabu — Section 3.1.1), never just the immediately-
 * previous one. Learned price bounds are HARD filters, not preferences —
 * that's what makes each rejection provably shrink the search space
 * instead of just re-rolling the same pool. escalationLevel widens the
 * search ladder itself as rejections accumulate (Section 3.1.3); level 5
 * means "do not search, this needs a human decision" — the caller is
 * responsible for checking that before calling resolveSlot at all.
 */
async function resolveSlot({ community, eventName, palette, member, allocatedBudget, excludeIds = [], upgrade = false, learnedConstraints = null, escalationLevel = 1 }) {
  const bucket = genderBucket(member.gender);
  const types = allowedArticleTypes(community, eventName, member.gender);
  const genderFilter = member.ageBracket === 'child'
    ? (bucket === 'Women' ? ['Girls', 'Women'] : ['Boys', 'Men'])
    : [member.gender, 'Unisex'];

  const tabuIds = learnedConstraints?.tabuProductIds || [];
  const allExcludeIds = [...new Set([...excludeIds, ...tabuIds])];
  const learnedAvoidColours = (learnedConstraints?.avoidColours || []).filter(c => !palette?.includes(c));

  let attempts;
  if (escalationLevel >= 4) {
    // Attempt 4 (Section 3.1.3): widen budget further within remaining
    // mission budget — the palette is already gone by this point.
    attempts = [
      { types, colours: null, budgetMult: 1.5, note: 'Stretched the budget further to find something that works for everyone' },
      { types: ['Kurtas'], colours: null, budgetMult: 1.6, note: 'Widened to a formal Kurta at a higher budget' },
    ];
  } else if (escalationLevel === 3) {
    // Attempt 3: widen SOFT constraints (palette) while holding budget —
    // hard constraints (gender, category, tabu, learned price bounds) stay.
    attempts = [
      { types, colours: null, budgetMult: 1.2, note: 'Widened the color range to find something that fits everyone\'s feedback' },
      { types: ['Kurtas'], colours: null, budgetMult: 1.3, note: `Not many ${types[0]} left in range — went with a formal Kurta` },
    ];
  } else {
    attempts = upgrade ? [
      { types, colours: palette, budgetMult: 1.3, note: 'Moved to a higher-rated option within the remaining budget' },
      { types, colours: null, budgetMult: 1.3, note: 'Moved to a higher-rated pick — color drifted from the palette to fit' },
      { types: ['Kurtas'], colours: null, budgetMult: 1.4, note: 'Went with a higher-rated formal Kurta instead' },
    ] : [
      { types, colours: palette, budgetMult: 1.0, note: null },
      { types, colours: palette, budgetMult: 1.2, note: 'Stretched the budget a little for this one' },
      { types, colours: null, budgetMult: 1.2, note: 'Closest style match — color drifted from the palette' },
      { types: ['Kurtas'], colours: null, budgetMult: 1.3, note: `Not many ${types[0]} in stock — went with a formal Kurta instead` },
    ];
  }

  for (const attempt of attempts) {
    const typeList = attempt.types;
    let budgetCap = Math.round((allocatedBudget || 3000) * attempt.budgetMult);
    // A learned "too expensive" cap is a HARD ceiling — it can only ever
    // narrow the search, never be overridden by widening elsewhere.
    if (learnedConstraints?.maxPrice != null) budgetCap = Math.min(budgetCap, learnedConstraints.maxPrice);

    const binds = { budget: budgetCap };
    let sql = `SELECT * FROM products WHERE in_stock = 1 AND price <= :budget`;

    if (learnedConstraints?.minPrice != null) {
      sql += ` AND price >= :minPrice`;
      binds.minPrice = learnedConstraints.minPrice;
    }

    const typePlaceholders = typeList.map((t, i) => { binds[`t${i}`] = t; return `:t${i}`; });
    sql += ` AND article_type IN (${typePlaceholders.join(', ')})`;

    const genderPlaceholders = genderFilter.map((g, i) => { binds[`g${i}`] = g; return `:g${i}`; });
    sql += ` AND gender IN (${genderPlaceholders.join(', ')})`;

    if (attempt.colours?.length) {
      const colourConds = attempt.colours.map((c, i) => { binds[`c${i}`] = c; return `base_colour = :c${i}`; });
      sql += ` AND (${colourConds.join(' OR ')})`;
    }
    if (learnedAvoidColours.length) {
      const avoidPlaceholders = learnedAvoidColours.map((c, i) => { binds[`av${i}`] = c; return `:av${i}`; });
      sql += ` AND base_colour NOT IN (${avoidPlaceholders.join(', ')})`;
    }

    if (allExcludeIds.length) {
      const exPlaceholders = allExcludeIds.map((id, i) => { binds[`ex${i}`] = id; return `:ex${i}`; });
      sql += ` AND id NOT IN (${exPlaceholders.join(', ')})`;
    }

    if (upgrade || learnedConstraints?.preferPremium) {
      const fabricPlaceholders = PREMIUM_FABRICS.map((f, i) => { binds[`pf${i}`] = f; return `:pf${i}`; });
      sql += ` ORDER BY (CASE WHEN fabric IN (${fabricPlaceholders.join(', ')}) THEN 1 ELSE 0 END) DESC, rating DESC, price DESC`;
    } else {
      sql += ` ORDER BY rating DESC`;
    }
    sql += ` FETCH FIRST 1 ROWS ONLY`;
    const r = await query(sql, binds);
    if (r.rows?.[0]) return { product: r.rows[0], note: attempt.note };
  }
  return null;
}

function slotKeyFor(missionId, eventId, memberId) {
  return `mission:${missionId}:${eventId}:${memberId}`;
}

// POST /api/mission/wedding/:id/orchestrate
router.post('/wedding/:id/orchestrate', auth, async (req, res) => {
  try {
    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!ownsMission(mission, req.user.id)) return res.status(403).json({ error: 'Not authorized for this mission' });

    const events = await MissionEvent.findByMission(req.params.id);
    const members = await MissionMember.findByMission(req.params.id);
    let slots = await MissionSlot.findByMission(req.params.id);

    const eventById = Object.fromEntries(events.map(e => [e.id, e]));
    const memberById = Object.fromEntries(members.map(m => [m.id, m]));
    const community = mission.COMMUNITY || mission.community;

    // resolveSlot's deterministic "highest-rated match" query returns the
    // SAME product for any two slots with matching criteria (same event,
    // gender, palette, budget bucket) unless told otherwise — without
    // tracking what's already been picked, every member with a similar
    // profile got handed the identical outfit. Seed from slots already
    // filled by an earlier run so a retry doesn't start reusing them either.
    const usedProductIds = slots.filter(s => s.status === 'filled' && s.productId).map(s => s.productId);

    res.json({ started: true, slotCount: slots.length });

    // Fire-and-forget: stream fills live over the socket, paced so the
    // matrix visibly fills one cell at a time rather than all at once.
    // Each slot is isolated in its own try/catch — one bad slot (a query
    // error, a missing product field) must not silently kill the rest of
    // the loop and strand every other cell at "pending" forever, which is
    // exactly what an unhandled throw here used to do.
    for (const slot of slots) {
      const ev = eventById[slot.eventId];
      const mem = memberById[slot.memberId];
      if (!ev || !mem) continue;
      // Re-running orchestrate (a retry after a stall/error) shouldn't
      // re-shop cells that already settled successfully — only pick up
      // where it actually left off.
      if (slot.status === 'filled') continue;

      try {
        if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:slot_shopping', {
          slotId: slot.id, eventId: ev.id, memberId: mem.id,
          message: `Finding ${mem.name} a ${allowedArticleTypes(community, ev.name, mem.gender)[0].toLowerCase()} for ${ev.name}...`,
        });

        const result = await resolveSlot({
          community, eventName: ev.name, palette: ev.paletteFamily,
          member: mem, allocatedBudget: slot.allocatedBudget,
          excludeIds: usedProductIds,
        });

        if (result) {
          usedProductIds.push(result.product.ID);
          await MissionSlot.update(slot.id, { productId: result.product.ID, status: 'filled', relaxationNote: result.note });
          if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:slot_filled', {
            slotId: slot.id, eventId: ev.id, memberId: mem.id,
            product: {
              id: result.product.ID, title: result.product.TITLE, brand: result.product.BRAND,
              price: result.product.PRICE, baseColour: result.product.BASE_COLOUR,
              articleType: result.product.ARTICLE_TYPE, images: safeJson(result.product.IMAGES),
            },
            note: result.note,
          });
        } else {
          await MissionSlot.update(slot.id, { status: 'rejected', relaxationNote: 'no match found in catalog' });
          if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:slot_failed', {
            slotId: slot.id, eventId: ev.id, memberId: mem.id,
            message: `Couldn't find the right fit for ${mem.name} even after trying a few alternatives.`,
          });
        }
      } catch (slotErr) {
        console.error(`Orchestrate slot error (event=${ev.name}, member=${mem.name}):`, slotErr);
        try { await MissionSlot.update(slot.id, { status: 'rejected', relaxationNote: 'error resolving this slot' }); } catch {}
        if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:slot_failed', {
          slotId: slot.id, eventId: ev.id, memberId: mem.id,
          message: `Ran into an issue finding something for ${mem.name} — moving on.`,
        });
      }

      await sleep(500);
    }

    const finalSlots = await MissionSlot.findByMission(mission.id);
    const spent = finalSlots.reduce((s, sl) => s + (sl.product?.price || 0), 0);
    if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:orchestrate_done', {
      spent, budget: mission.TOTAL_BUDGET || mission.totalBudget,
    });
  } catch (err) {
    console.error('Orchestrate error:', err);
    if (req.io) req.io.to(`mission_${req.params.id}`).emit('mission:orchestrate_error', { message: err.message });
  }
});

/**
 * Builds the "I'm stuck" escalation report (Section 3.1.3) — a real,
 * quantified explanation, not a canned message. Every count in it is a
 * live DB query against the actual catalog under the actual accumulated
 * constraints, so the numbers shown are never invented.
 */
async function buildEscalationReport({ ev, member, community, learnedConstraints, rejectionCount }) {
  const types = allowedArticleTypes(community, ev.name, member.gender);
  const genderFilter = [member.gender, 'Unisex'];

  async function countCandidates(overrides = {}) {
    const binds = {};
    let sql = `SELECT COUNT(*) AS cnt FROM products WHERE in_stock = 1`;
    const typeP = types.map((t, i) => { binds[`t${i}`] = t; return `:t${i}`; });
    sql += ` AND article_type IN (${typeP.join(', ')})`;
    const genderP = genderFilter.map((g, i) => { binds[`g${i}`] = g; return `:g${i}`; });
    sql += ` AND gender IN (${genderP.join(', ')})`;
    const maxPrice = 'maxPrice' in overrides ? overrides.maxPrice : learnedConstraints.maxPrice;
    const minPrice = 'minPrice' in overrides ? overrides.minPrice : learnedConstraints.minPrice;
    const avoidColours = 'avoidColours' in overrides ? overrides.avoidColours : learnedConstraints.avoidColours;
    if (maxPrice != null) { sql += ` AND price <= :maxP`; binds.maxP = maxPrice; }
    if (minPrice != null) { sql += ` AND price >= :minP`; binds.minP = minPrice; }
    if (avoidColours?.length) {
      const avP = avoidColours.map((c, i) => { binds[`av${i}`] = c; return `:av${i}`; });
      sql += ` AND base_colour NOT IN (${avP.join(', ')})`;
    }
    if (learnedConstraints.tabuProductIds?.length) {
      const exP = learnedConstraints.tabuProductIds.map((id, i) => { binds[`ex${i}`] = id; return `:ex${i}`; });
      sql += ` AND id NOT IN (${exP.join(', ')})`;
    }
    const r = await query(sql, binds);
    return r.rows?.[0]?.CNT || 0;
  }

  const currentCount = await countCandidates();
  const rules = [];
  if (learnedConstraints.maxPrice != null) rules.push(`Nothing above ₹${learnedConstraints.maxPrice.toLocaleString('en-IN')}`);
  if (learnedConstraints.minPrice != null) rules.push(`Nothing under ₹${learnedConstraints.minPrice.toLocaleString('en-IN')}`);
  if (learnedConstraints.avoidColours?.length) rules.push(`Nothing in ${learnedConstraints.avoidColours.join('/')}`);

  const options = [];
  if (learnedConstraints.maxPrice != null) {
    const widened = Math.round(learnedConstraints.maxPrice * 1.3);
    const opensCount = Math.max(0, (await countCandidates({ maxPrice: widened })) - currentCount);
    options.push({ action: 'raise_budget', value: widened, label: `Allow up to ₹${widened.toLocaleString('en-IN')}`, opensCount });
  }
  if (learnedConstraints.avoidColours?.length) {
    const opensCount = Math.max(0, (await countCandidates({ avoidColours: [] })) - currentCount);
    options.push({ action: 'allow_colours', label: `Allow ${learnedConstraints.avoidColours.join('/')} tones`, opensCount });
  }
  options.push({ action: 'show_current', label: `Show me the ${currentCount} again` });

  return { memberName: member.name, eventName: ev.name, rejectionCount, rules, currentCount, options };
}

/**
 * Shared by the direct reject-slot API and the mission Council's reconcile
 * flow (a voice-note veto on a slot ends up here either way).
 *
 * `rejectedBy` — the council member (or owner) who made this rejection.
 * Tracked so a deadlock message can name whose constraint conflicts with
 * whose (Section 3.1.4), not just report a bare number mismatch.
 */
async function rejectAndReharmonizeSlot({ missionId, eventId, memberId, reason, io, rejectedBy = null, rejectedByName = null }) {
  const mission = await Mission.findById(missionId);
  if (!mission) throw new Error('Mission not found');

  const events = await MissionEvent.findByMission(missionId);
  const members = await MissionMember.findByMission(missionId);
  const slots = await MissionSlot.findByMission(missionId);

  const ev = events.find(e => e.id === eventId);
  const rejectedSlot = slots.find(s => s.eventId === eventId && s.memberId === memberId);
  if (!ev || !rejectedSlot) throw new Error('Slot not found');

  const community = mission.COMMUNITY || mission.community;
  const slotKey = slotKeyFor(missionId, eventId, memberId);
  const rejectedMember = members.find(m => m.id === memberId);

  // Section 3.1.5 — loop guards, checked before anything else runs.
  const guard = await convergence.checkLoopGuards({ missionId, slotKey });
  if (guard.blocked || !convergence.checkRateGuard(`mission:${missionId}`)) {
    const reasonKey = guard.blocked ? guard.reason : 'rate_limited';
    const message = reasonKey === 'slot_exhausted'
      ? `This slot's been rejected ${guard.rejectionCount} times already — let's decide together instead of trying again.`
      : reasonKey === 'cart_exhausted'
        ? `You've rejected ${guard.rejectionCount} picks across this mission — want to start this section fresh instead?`
        : `That's a lot of changes at once — give it a moment before the next one.`;
    if (io) io.to(`mission_${mission.id}`).emit('mission:loop_guard', {
      slotId: rejectedSlot.id, eventId: ev.id, memberId, reason: reasonKey, message,
    });
    return { changed: 0, blocked: true, reason: reasonKey };
  }

  // Record BEFORE searching (Section 3.1.5) — crash-safe, and this is the
  // one write that must never be lost even if everything after it fails.
  if (rejectedSlot.productId) {
    await convergence.recordRejection({
      slotKey, missionId,
      productId: rejectedSlot.productId,
      productPrice: rejectedSlot.product?.price,
      productColour: rejectedSlot.product?.baseColour,
      rejectedBy, rejectedByName, reasonText: reason,
    });
  }

  const { rejections, constraints: learnedConstraints } = await convergence.getLearnedConstraintsForSlot(slotKey);

  // Section 3.1.4 — deadlock check BEFORE searching, not discovered by a
  // failed search. Two people's learned constraints on the SAME slot can
  // become mutually unsatisfiable; that's detected here, explicitly.
  const conflict = convergence.detectConflict(learnedConstraints);
  if (conflict) {
    // minPriceSetBy/maxPriceSetBy are USER ids when a logged-in account made
    // the rejection — a different id space from mission_members (who the
    // outfit is FOR). Guest reviewers have no user id, only a name captured
    // at rejection time (Section 3.2 zero-friction join), so prefer the
    // stored name and only fall back to an account lookup when needed.
    const [minSetByUser, maxSetByUser] = await Promise.all([
      (!conflict.minPriceSetByName && conflict.minPriceSetBy) ? User.findById(conflict.minPriceSetBy) : null,
      (!conflict.maxPriceSetByName && conflict.maxPriceSetBy) ? User.findById(conflict.maxPriceSetBy) : null,
    ]);
    const payload = {
      slotId: rejectedSlot.id, eventId: ev.id, memberId,
      eventName: ev.name, memberName: rejectedMember?.name,
      conflict: {
        ...conflict,
        minPriceSetByName: conflict.minPriceSetByName || minSetByUser?.NAME || minSetByUser?.name || 'Someone',
        maxPriceSetByName: conflict.maxPriceSetByName || maxSetByUser?.NAME || maxSetByUser?.name || 'Someone',
      },
    };
    if (io) io.to(`mission_${mission.id}`).emit('mission:deadlock', payload);
    return { changed: 0, deadlock: true, conflict: payload.conflict };
  }

  const escalationLevel = convergence.getEscalationLevel(rejections.length);

  // Section 3.1.3, attempt 5 — STOP. Do not search again; report instead.
  if (escalationLevel >= 5) {
    const report = await buildEscalationReport({
      ev, member: rejectedMember, community, learnedConstraints, rejectionCount: rejections.length,
    });
    if (io) io.to(`mission_${mission.id}`).emit('mission:escalation', {
      slotId: rejectedSlot.id, eventId: ev.id, memberId, report,
    });
    return { changed: 0, escalated: true, report };
  }

  if (io) io.to(`mission_${mission.id}`).emit('mission:reharmonize_start', {
    eventId: ev.id, reason: reason || null,
    message: reason ? `Rethinking the ${ev.name} lineup — "${reason}"` : `Rethinking the ${ev.name} lineup...`,
  });

  if (io) io.to(`mission_${mission.id}`).emit('mission:slot_shopping', {
      slotId: rejectedSlot.id, eventId: ev.id, memberId, reharmonize: true,
      message: reason ? `Re-solving for: "${reason}"...` : 'Finding a better match...',
    });

    // Interpret the reason into a concrete new palette — "too bright" must
    // actually shift the column's color, not just swap in a different SKU
    // in the same shade the family just rejected.
    const rejectedColour = rejectedSlot.product?.baseColour;
    const shiftedPalette = adjustPaletteForReason(reason, ev.paletteFamily, rejectedColour);

    // Page 55 — "this isn't nice enough" carries no color word at all, but
    // it's a completely valid objection. Classify it separately from the
    // color-shift interpretation: a quality/prestige complaint re-solves
    // toward a stretched budget and a higher-rated pick, not just a
    // different shade.
    const { isQuality } = classifyObjection(reason);

    // Track every product already worn by anyone else in this mission —
    // resolveSlot's deterministic top-rated-match query otherwise hands
    // the same product to two members with similar profiles (same fix as
    // the orchestrate loop above). Seeded from every slot's CURRENT pick,
    // so a re-solved slot can't collide with a sibling that isn't being
    // touched this round either.
    const usedProductIds = slots.filter(s => s.productId).map(s => s.productId);

    // Re-solve the rejected slot — tabu (all past rejections for this
    // slot, not just the immediate one) and learned constraints are now
    // hard filters, so this search is provably smaller than the last one.
    const primary = await resolveSlot({
      community, eventName: ev.name, palette: shiftedPalette,
      member: rejectedMember, allocatedBudget: rejectedSlot.allocatedBudget,
      upgrade: isQuality, learnedConstraints, escalationLevel,
      excludeIds: usedProductIds,
    });

    const changed = [];   // genuinely different products — the honest count
    const settled = [];   // every cell that needs a visual settle event
    if (primary) {
      usedProductIds.push(primary.product.ID);
      await MissionSlot.update(rejectedSlot.id, { productId: primary.product.ID, status: 'filled', relaxationNote: primary.note });
      changed.push({ slotId: rejectedSlot.id, eventId: ev.id, memberId, product: primary.product, note: primary.note });
      settled.push({ slotId: rejectedSlot.id, eventId: ev.id, memberId, product: primary.product, note: primary.note, kept: false });
    }

    // Re-harmonize the rest of the event column onto the same shifted palette.
    // Every cell in the column visibly goes back into "thinking" — even the
    // ones that end up keeping their pick — so the column reads as one
    // family decision being reconsidered together, not a silent recompute.
    const columnSlots = slots.filter(s => s.eventId === eventId && s.memberId !== memberId);
    for (const slot of columnSlots) {
      const mem = members.find(m => m.id === slot.memberId);
      if (!mem) continue;

      if (io) io.to(`mission_${mission.id}`).emit('mission:slot_shopping', {
        slotId: slot.id, eventId: ev.id, memberId: mem.id, reharmonize: true,
        message: `Checking ${mem.name} still works with this...`,
      });
      await sleep(350);

      const result = await resolveSlot({
        community, eventName: ev.name, palette: shiftedPalette,
        member: mem, allocatedBudget: slot.allocatedBudget,
        excludeIds: usedProductIds,
      });
      if (result && result.product.ID !== slot.productId) {
        usedProductIds.push(result.product.ID);
        await MissionSlot.update(slot.id, { productId: result.product.ID, status: 'filled', relaxationNote: result.note });
        changed.push({ slotId: slot.id, eventId: ev.id, memberId: mem.id, product: result.product, note: result.note });
        settled.push({ slotId: slot.id, eventId: ev.id, memberId: mem.id, product: result.product, note: result.note, kept: false });
      } else {
        // Kept its pick — still settle the cell back so it doesn't hang mid-search.
        settled.push({ slotId: slot.id, eventId: ev.id, memberId: mem.id, product: slot.product, note: slot.note, kept: true });
      }
    }

  for (const c of settled) {
    if (io) io.to(`mission_${mission.id}`).emit('mission:slot_filled', {
      slotId: c.slotId, eventId: c.eventId, memberId: c.memberId, reharmonize: true, kept: c.kept,
      product: {
        id: c.product.ID || c.product.id, title: c.product.TITLE || c.product.title,
        brand: c.product.BRAND || c.product.brand, price: c.product.PRICE || c.product.price,
        baseColour: c.product.BASE_COLOUR || c.product.baseColour,
        articleType: c.product.ARTICLE_TYPE || c.product.articleType,
        images: safeJson(c.product.IMAGES) || c.product.images || [],
      },
      note: c.note,
    });
    await sleep(300);
  }

  const finalSlots = await MissionSlot.findByMission(mission.id);
  const spent = finalSlots.reduce((s, sl) => s + (sl.product?.price || 0), 0);
  if (io) io.to(`mission_${mission.id}`).emit('mission:orchestrate_done', {
    spent, budget: mission.TOTAL_BUDGET || mission.totalBudget,
  });

  return { changed: changed.length };
}

// POST /api/mission/wedding/:id/reject-slot
router.post('/wedding/:id/reject-slot', auth, async (req, res) => {
  try {
    const { eventId, memberId, reason, rejectedByName } = req.body;
    // Only the mission owner reaches this route directly (WeddingMatrixPage);
    // family members veto through the token-gated /collab/:token/reconcile
    // flow, which calls rejectAndReharmonizeSlot internally without going
    // through this endpoint — so this check can't break that path.
    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!ownsMission(mission, req.user.id)) return res.status(403).json({ error: 'Not authorized for this mission' });

    // rejectedByName is an optional override — used by the owner-side demo
    // walkthrough where one logged-in account plays multiple family members
    // across simulated devices, so the deadlock card can name the actual
    // person being role-played instead of always showing the account name.
    const result = await rejectAndReharmonizeSlot({
      missionId: req.params.id, eventId, memberId, reason, io: req.io,
      rejectedBy: req.user.id, rejectedByName: rejectedByName || req.user.name,
    });
    res.json(result);
  } catch (err) {
    console.error('Reject-slot error:', err);
    res.status(500).json({ error: 'Reject-slot failed: ' + err.message });
  }
});

// POST /api/mission/wedding/:id/resolve-deadlock
// Section 3.1.4's "winning moment" — the owner picks how to break a
// mutually-unsatisfiable constraint conflict on one slot. Not a chat
// message: each option is a real action that changes the search bounds
// (and, for the split, actually moves budget from another event).
router.post('/wedding/:id/resolve-deadlock', auth, async (req, res) => {
  try {
    const { eventId, memberId, resolution } = req.body; // 'go_with_min' | 'go_with_max' | 'split'
    if (!['go_with_min', 'go_with_max', 'split'].includes(resolution)) {
      return res.status(400).json({ error: 'resolution must be go_with_min, go_with_max, or split' });
    }

    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!ownsMission(mission, req.user.id)) return res.status(403).json({ error: 'Not authorized for this mission' });

    const events = await MissionEvent.findByMission(req.params.id);
    const members = await MissionMember.findByMission(req.params.id);
    const slots = await MissionSlot.findByMission(req.params.id);
    const ev = events.find(e => e.id === eventId);
    const slot = slots.find(s => s.eventId === eventId && s.memberId === memberId);
    const member = members.find(m => m.id === memberId);
    if (!ev || !slot || !member) return res.status(404).json({ error: 'Slot not found' });

    const community = mission.COMMUNITY || mission.community;
    const slotKey = slotKeyFor(req.params.id, eventId, memberId);
    const { constraints: learnedConstraints } = await convergence.getLearnedConstraintsForSlot(slotKey);
    const rawConflict = convergence.detectConflict(learnedConstraints);
    if (!rawConflict) return res.status(400).json({ error: 'No active deadlock on this slot' });

    // Same name resolution as the deadlock event itself (Section 3.1.4) —
    // prefer the name captured at rejection time (covers guest reviewers,
    // who have no account to look up), fall back to the account only if
    // an older row predates that capture.
    const [minSetByUser, maxSetByUser] = await Promise.all([
      (!rawConflict.minPriceSetByName && rawConflict.minPriceSetBy) ? User.findById(rawConflict.minPriceSetBy) : null,
      (!rawConflict.maxPriceSetByName && rawConflict.maxPriceSetBy) ? User.findById(rawConflict.maxPriceSetBy) : null,
    ]);
    const conflict = {
      ...rawConflict,
      minPriceSetByName: rawConflict.minPriceSetByName || minSetByUser?.NAME || minSetByUser?.name || 'Someone',
      maxPriceSetByName: rawConflict.maxPriceSetByName || maxSetByUser?.NAME || maxSetByUser?.name || 'Someone',
    };

    const overrideConstraints = { ...learnedConstraints };
    let newAllocatedBudget = slot.allocatedBudget;
    let message;

    if (resolution === 'go_with_min') {
      overrideConstraints.maxPrice = null;
      newAllocatedBudget = Math.max(slot.allocatedBudget, conflict.minPrice);
      message = `Going with ${conflict.minPriceSetByName}'s preference for ${member.name}'s ${ev.name} outfit — allowing up to ₹${newAllocatedBudget.toLocaleString('en-IN')}.`;
    } else if (resolution === 'go_with_max') {
      overrideConstraints.minPrice = null;
      newAllocatedBudget = slot.allocatedBudget;
      message = `Going with ${conflict.maxPriceSetByName}'s preference for ${member.name}'s ${ev.name} outfit — capping at ₹${conflict.maxPrice.toLocaleString('en-IN')}.`;
    } else {
      const target = Math.round((conflict.minPrice + conflict.maxPrice) / 2);
      overrideConstraints.minPrice = null;
      overrideConstraints.maxPrice = target;
      newAllocatedBudget = target;
      message = `Meeting in the middle at ₹${target.toLocaleString('en-IN')} for ${member.name}'s ${ev.name} outfit.`;

      const overage = target - slot.allocatedBudget;
      if (overage > 0) {
        // Borrow from whichever OTHER event slot has the most headroom —
        // a real budget move, not a claim. Never borrows from the same event.
        const donor = slots
          .filter(s => s.eventId !== eventId && s.allocatedBudget > overage + 500)
          .sort((a, b) => b.allocatedBudget - a.allocatedBudget)[0];
        if (donor) {
          await MissionSlot.update(donor.id, { allocatedBudget: donor.allocatedBudget - overage });
          const donorEvent = events.find(e => e.id === donor.eventId);
          message += ` Moved ₹${overage.toLocaleString('en-IN')} over from ${donorEvent?.name || 'another event'}'s budget to cover it.`;
        }
      }
    }

    await MissionSlot.update(slot.id, { allocatedBudget: newAllocatedBudget });

    const result = await resolveSlot({
      community, eventName: ev.name, palette: ev.paletteFamily, member,
      allocatedBudget: newAllocatedBudget, learnedConstraints: overrideConstraints, escalationLevel: 1,
    });

    let product = null;
    if (result) {
      await MissionSlot.update(slot.id, { productId: result.product.ID, status: 'filled', relaxationNote: message });
      product = {
        id: result.product.ID, title: result.product.TITLE, brand: result.product.BRAND,
        price: result.product.PRICE, baseColour: result.product.BASE_COLOUR,
        articleType: result.product.ARTICLE_TYPE, images: safeJson(result.product.IMAGES),
      };
      if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:slot_filled', {
        slotId: slot.id, eventId, memberId, product, note: message,
      });
    }

    const updatedMission = await Mission.findById(req.params.id);
    const finalSlots = await MissionSlot.findByMission(req.params.id);
    const spent = finalSlots.reduce((s, sl) => s + (sl.product?.price || 0), 0);
    if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:orchestrate_done', {
      spent, budget: updatedMission.TOTAL_BUDGET || updatedMission.totalBudget,
    });

    res.json({ resolved: true, message, product });
  } catch (err) {
    console.error('Resolve-deadlock error:', err);
    res.status(500).json({ error: 'Failed to resolve deadlock: ' + err.message });
  }
});

// POST /api/mission/wedding/:id/resolve-escalation
// Section 3.1.3's escalation report options are real actions, not text —
// "Allow up to ₹X" actually raises the slot's bound and searches again
// exactly once (never re-entering the rejection loop the report was
// stopping in the first place).
router.post('/wedding/:id/resolve-escalation', auth, async (req, res) => {
  try {
    const { eventId, memberId, action, value } = req.body; // 'raise_budget' | 'allow_colours' | 'show_current'
    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!ownsMission(mission, req.user.id)) return res.status(403).json({ error: 'Not authorized for this mission' });

    const events = await MissionEvent.findByMission(req.params.id);
    const members = await MissionMember.findByMission(req.params.id);
    const slots = await MissionSlot.findByMission(req.params.id);
    const ev = events.find(e => e.id === eventId);
    const slot = slots.find(s => s.eventId === eventId && s.memberId === memberId);
    const member = members.find(m => m.id === memberId);
    if (!ev || !slot || !member) return res.status(404).json({ error: 'Slot not found' });

    const community = mission.COMMUNITY || mission.community;
    const slotKey = slotKeyFor(req.params.id, eventId, memberId);
    const { constraints: learnedConstraints } = await convergence.getLearnedConstraintsForSlot(slotKey);

    if (action === 'show_current') {
      return res.json({ resolved: true, message: `Here's what fits ${member.name}'s ${ev.name} outfit right now.` });
    }

    const overrideConstraints = { ...learnedConstraints };
    let newAllocatedBudget = slot.allocatedBudget;
    let message;
    if (action === 'raise_budget') {
      overrideConstraints.maxPrice = value;
      newAllocatedBudget = Math.max(slot.allocatedBudget, value);
      message = `Raised the budget for ${member.name}'s ${ev.name} outfit to ₹${value.toLocaleString('en-IN')}.`;
    } else if (action === 'allow_colours') {
      overrideConstraints.avoidColours = [];
      message = `Opened up the color range for ${member.name}'s ${ev.name} outfit.`;
    } else {
      return res.status(400).json({ error: 'Unknown escalation action' });
    }

    await MissionSlot.update(slot.id, { allocatedBudget: newAllocatedBudget });
    const result = await resolveSlot({
      community, eventName: ev.name, palette: ev.paletteFamily, member,
      allocatedBudget: newAllocatedBudget, learnedConstraints: overrideConstraints, escalationLevel: 1,
    });

    let product = null;
    if (result) {
      await MissionSlot.update(slot.id, { productId: result.product.ID, status: 'filled', relaxationNote: message });
      product = {
        id: result.product.ID, title: result.product.TITLE, brand: result.product.BRAND,
        price: result.product.PRICE, baseColour: result.product.BASE_COLOUR,
        articleType: result.product.ARTICLE_TYPE, images: safeJson(result.product.IMAGES),
      };
      if (req.io) req.io.to(`mission_${mission.id}`).emit('mission:slot_filled', {
        slotId: slot.id, eventId, memberId, product, note: message,
      });
    }

    res.json({ resolved: true, message, product });
  } catch (err) {
    console.error('Resolve-escalation error:', err);
    res.status(500).json({ error: 'Failed to resolve escalation: ' + err.message });
  }
});

router.rejectAndReharmonizeSlot = rejectAndReharmonizeSlot;
// POST /api/mission/plan-only — any festival or occasion, India-wide.
// One LLM call, a readable household plan, no cart, no execution. Proves
// missions are configs on one engine rather than a second product.
router.post('/plan-only', auth, async (req, res) => {
  try {
    const { type, details } = req.body;
    if (!type?.trim()) return res.status(400).json({ error: 'type is required' });

    const plan = await planMission(type, details || '');
    res.json({ plan });
  } catch (err) {
    console.error('Plan-only error:', err);
    res.status(500).json({ error: 'Failed to generate plan: ' + err.message });
  }
});

module.exports = router;
