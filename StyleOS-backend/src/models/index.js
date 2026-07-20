/**
 * Oracle DB models — raw query helpers
 * Each model exposes: findById, findOne, findAll, create, update, remove
 */
const { query } = require('../db');
const { v4: uuidv4 } = require('uuid');

// ─── Users ────────────────────────────────────────────────────────────────────
const User = {
  async create({ name, email, passwordHash }) {
    const id = uuidv4();
    await query(
      `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
       VALUES (:id, :nm, :em, :ph, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, nm: name, em: email, ph: passwordHash }
    );
    return { id, name, email };
  },
  async findByEmail(email) {
    const r = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER(:e)`, { e: email });
    return r.rows?.[0] || null;
  },
  async findById(id) {
    const r = await query(`SELECT id, name, email, avatar_url FROM users WHERE id = :id`, { id });
    return r.rows?.[0] || null;
  },
};

// ─── Products ─────────────────────────────────────────────────────────────────
const Product = {
  async findById(id) {
    const r = await query(`SELECT * FROM products WHERE id = :id`, { id });
    return r.rows?.[0] || null;
  },
  async search({ q, gender, masterCategory, subCategory, articleType, occasion,
                  baseColour, fabric, minPrice, maxPrice, inStock,
                  limit = 40, offset = 0, sortBy = 'rating' }) {
    let sql = `SELECT * FROM products WHERE 1=1`;
    const binds = {};

    if (q) {
      sql += ` AND (LOWER(title) LIKE LOWER(:q1) OR LOWER(brand) LIKE LOWER(:q2) OR LOWER(article_type) LIKE LOWER(:q3))`;
      binds.q1 = `%${q}%`;
      binds.q2 = `%${q}%`;
      binds.q3 = `%${q}%`;
    }
    if (gender) {
      const genders = gender.split(',').map(g => g.trim()).filter(Boolean);
      if (genders.length > 1) {
        const placeholders = genders.map((g, i) => { binds[`gender${i}`] = g; return `:gender${i}`; });
        sql += ` AND gender IN (${placeholders.join(', ')})`;
      } else {
        sql += ` AND gender = :gender`;
        binds.gender = genders[0];
      }
    }
    if (masterCategory) { sql += ` AND LOWER(master_category) LIKE LOWER(:mc)`; binds.mc = `%${masterCategory}%`; }
    if (subCategory) { sql += ` AND LOWER(sub_category) LIKE LOWER(:sc)`; binds.sc = `%${subCategory}%`; }
    if (articleType) { sql += ` AND LOWER(article_type) LIKE LOWER(:at)`; binds.at = `%${articleType}%`; }
    if (occasion) { sql += ` AND LOWER(occasion) LIKE LOWER(:occ)`; binds.occ = `%${occasion}%`; }
    if (baseColour) { sql += ` AND LOWER(base_colour) LIKE LOWER(:col)`; binds.col = `%${baseColour}%`; }
    if (fabric) { sql += ` AND LOWER(fabric) LIKE LOWER(:fab)`; binds.fab = `%${fabric}%`; }
    if (minPrice) { sql += ` AND price >= :minp`; binds.minp = parseInt(minPrice); }
    if (maxPrice) { sql += ` AND price <= :maxp`; binds.maxp = parseInt(maxPrice); }
    if (inStock !== undefined) { sql += ` AND in_stock = :ins`; binds.ins = inStock ? 1 : 0; }

    // rating alone has only ~14 distinct values across 10k+ rows, so ties
    // (hundreds of products) would otherwise return in arbitrary DB order —
    // rating_count as a tiebreak keeps "top rated" results stable and sane.
    const orderMap = {
      rating: 'rating DESC, rating_count DESC',
      price_asc: 'price ASC',
      price_desc: 'price DESC',
    };
    sql += ` ORDER BY ${orderMap[sortBy] || 'rating DESC, rating_count DESC'}`;
    sql += ` FETCH FIRST :lim ROWS ONLY`;
    binds.lim = parseInt(limit);

    const r = await query(sql, binds);
    return r.rows || [];
  },
};

// ─── Carts ────────────────────────────────────────────────────────────────────
const Cart = {
  async create({ ownerId, name, goalText }) {
    const id = uuidv4();
    await query(
      `INSERT INTO carts (id, owner_id, name, goal_text, total_price, status, created_at, updated_at)
       VALUES (:id, :oid, :nm, :gt, 0, 'active', SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, oid: ownerId, nm: name || 'My Cart', gt: goalText || '' }
    );
    return { id, ownerId, name, goalText, totalPrice: 0, status: 'active' };
  },
  async findById(id) {
    const r = await query(`SELECT * FROM carts WHERE id = :id`, { id });
    const row = r.rows?.[0];
    // Same fix as Mission.findById — callers read the raw uppercase columns
    // (cart.TOTAL_PRICE, cart.OWNER_ID, ...) throughout, so this stays a
    // raw-row passthrough, but also add lowercase .id/.totalPrice since some
    // callers (frontend cart.id/cart.totalPrice references) read those
    // instead and were silently getting undefined.
    return row ? { ...row, id: row.ID, totalPrice: row.TOTAL_PRICE } : null;
  },
  async findByOwner(ownerId) {
    const r = await query(`SELECT * FROM carts WHERE owner_id = :oid ORDER BY created_at DESC`, { oid: ownerId });
    return r.rows || [];
  },
  async updateTotal(id) {
    await query(
      `UPDATE carts SET total_price = (
         SELECT NVL(SUM(p.price * ci.quantity), 0)
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = :cid
       ), updated_at = SYSTIMESTAMP WHERE id = :cid`,
      { cid: id }
    );
  },
  async updateStatus(id, status) {
    await query(`UPDATE carts SET status = :s, updated_at = SYSTIMESTAMP WHERE id = :id`, { s: status, id });
  },
};

// ─── CartItems ────────────────────────────────────────────────────────────────
const CartItem = {
  async create({ cartId, productId, size, quantity, addedByUserId, addedByAgent }) {
    const id = uuidv4();
    await query(
      `INSERT INTO cart_items (id, cart_id, product_id, item_size, quantity, added_by_user_id, added_by_agent, created_at, updated_at)
       VALUES (:id, :cid, :pid, :sz, :qty, :addedUid, :ag, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, cid: cartId, pid: productId, sz: size || 'M', qty: quantity || 1,
        addedUid: addedByUserId || null, ag: addedByAgent ? 1 : 0 }
    );
    return { id, cartId, productId, size, quantity };
  },
  async findByCart(cartId) {
    const r = await query(
      `SELECT ci.*, p.title, p.brand, p.price, p.mrp, p.base_colour, p.article_type,
              p.fabric, p.occasion, p.images, p.delivery_days, p.rating, p.gender
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = :cid`,
      { cid: cartId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, cartId: row.CART_ID, productId: row.PRODUCT_ID,
      size: row.ITEM_SIZE, quantity: row.QUANTITY, addedByAgent: row.ADDED_BY_AGENT === 1,
      product: {
        id: row.PRODUCT_ID, title: row.TITLE, brand: row.BRAND, price: row.PRICE,
        mrp: row.MRP, baseColour: row.BASE_COLOUR, articleType: row.ARTICLE_TYPE,
        fabric: row.FABRIC, occasion: row.OCCASION, images: safeJson(row.IMAGES),
        deliveryDays: row.DELIVERY_DAYS, rating: row.RATING, gender: row.GENDER,
      },
    }));
  },
  async remove(id, cartId) {
    await query(`DELETE FROM cart_items WHERE id = :id AND cart_id = :cid`, { id, cid: cartId });
  },
  async update(id, fields) {
    if (fields.productId) {
      await query(`UPDATE cart_items SET product_id = :pid, updated_at = SYSTIMESTAMP WHERE id = :id`,
        { pid: fields.productId, id });
    }
  },
};

// ─── CollabSessions ───────────────────────────────────────────────────────────
// ask_mode drives which of the Five Modes a session uses — see
// collab_cart_five_modes.md. Defaults to 'advisor', the original swipe/
// react/comment flow, so every pre-existing collab link keeps behaving
// exactly as it always has.
const CollabSession = {
  async create({ cartId, missionId, shareToken, askMode, recipientName, recipientRelation, expiresAt }) {
    const id = uuidv4();
    // Bind variable is named :amode, not :mode — Oracle's SQL parser treats
    // MODE as a reserved keyword (used in LOCK TABLE ... MODE and older
    // hierarchical-query syntax), so :mode raises ORA-01745 "invalid
    // host/bind variable name" even though `mode` is a perfectly normal
    // column/JS variable name everywhere else.
    await query(
      `INSERT INTO collab_sessions (id, cart_id, mission_id, share_token, ask_mode, recipient_name, recipient_relation, expires_at, created_at, updated_at)
       VALUES (:id, :cid, :mid, :token, :amode, :rname, :rrel, :expiresAt, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, cid: cartId || null, mid: missionId || null, token: shareToken,
        amode: askMode || 'advisor', rname: recipientName || null, rrel: recipientRelation || null,
        expiresAt: expiresAt || null }
    );
    return { id, cartId, missionId, shareToken, askMode: askMode || 'advisor', expiresAt: expiresAt || null };
  },
  async findByToken(shareToken) {
    const r = await query(`SELECT * FROM collab_sessions WHERE share_token = :t`, { t: shareToken });
    return r.rows?.[0] || null;
  },
  async findByCart(cartId) {
    const r = await query(`SELECT * FROM collab_sessions WHERE cart_id = :cid`, { cid: cartId });
    return r.rows?.[0] || null;
  },
  async findByMission(missionId) {
    const r = await query(`SELECT * FROM collab_sessions WHERE mission_id = :mid`, { mid: missionId });
    return r.rows?.[0] || null;
  },
  // APPROVER — the Payer Lock. Setting this is the approver's one real
  // action; every subsequent /shop and /finalize call for this cart must
  // treat item_price_cap and budget_lock as hard ceilings, not stated goals.
  async setPayerLock(id, { budgetLock, itemPriceCap, detailLevel }) {
    await query(
      `UPDATE collab_sessions SET budget_lock = :bl, item_price_cap = :cap, lock_detail_level = :dl, updated_at = SYSTIMESTAMP WHERE id = :id`,
      { id, bl: budgetLock ?? null, cap: itemPriceCap ?? null, dl: detailLevel || 'full' }
    );
  },
  // PROXY — whatever the buyer actually knows about the recipient (sizes,
  // colour preferences, brands to avoid). Honestly partial by design: this
  // is buyer-entered, not pulled from any real account the recipient owns
  // (StyleOS has no cross-account order-history sharing today) — see the
  // recipientProfile shape documented in services/proxy_profile.js.
  async setRecipientProfile(id, profile) {
    await query(
      `UPDATE collab_sessions SET recipient_profile = :p, updated_at = SYSTIMESTAMP WHERE id = :id`,
      { id, p: JSON.stringify(profile || {}) }
    );
  },
};

// ─── CollabMembers ────────────────────────────────────────────────────────────
const CollabMember = {
  async create({ sessionId, userId, guestName, guestToken }) {
    const id = uuidv4();
    await query(
      `INSERT INTO collab_members (id, session_id, user_id, guest_name, guest_token, created_at, updated_at)
       VALUES (:id, :sid, :memberUid, :guestName, :guestToken, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, sid: sessionId, memberUid: userId || null, guestName: guestName || null, guestToken: guestToken || null }
    );
    return { id, sessionId, userId, guestName, guestToken };
  },
  async findOne({ sessionId, userId }) {
    const r = await query(
      `SELECT * FROM collab_members WHERE session_id = :sid AND user_id = :memberUid`,
      { sid: sessionId, memberUid: userId }
    );
    return r.rows?.[0] || null;
  },
  async findByGuestToken({ sessionId, guestToken }) {
    const r = await query(
      `SELECT * FROM collab_members WHERE session_id = :sid AND guest_token = :gt`,
      { sid: sessionId, gt: guestToken }
    );
    return r.rows?.[0] || null;
  },
  async findBySession(sessionId) {
    const r = await query(
      `SELECT cm.id, cm.user_id, cm.guest_name, COALESCE(u.name, cm.guest_name) as display_name, u.email
       FROM collab_members cm LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.session_id = :sid ORDER BY cm.created_at ASC`,
      { sid: sessionId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, userId: row.USER_ID, guestName: row.GUEST_NAME,
      name: row.DISPLAY_NAME, email: row.EMAIL, isGuest: !row.USER_ID,
    }));
  },
};

// ─── Reactions ────────────────────────────────────────────────────────────────
const Reaction = {
  async create({ cartItemId, missionSlotId, userId, guestName, type, content, audioUrl }) {
    const id = uuidv4();
    await query(
      `INSERT INTO reactions (id, cart_item_id, mission_slot_id, user_id, guest_name, reaction_type, content, audio_url, created_at, updated_at)
       VALUES (:id, :cid, :msid, :reactUid, :guestName, :type, :content, :aurl, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, cid: cartItemId || null, msid: missionSlotId || null, reactUid: userId || null,
        guestName: guestName || null, type, content: content || '', aurl: audioUrl || null }
    );
    const user = userId ? await User.findById(userId) : null;
    const name = (user?.NAME || user?.name) || guestName || 'Someone';
    return { id, cartItemId, missionSlotId, userId, type, content, user: { id: userId || null, name } };
  },
  async findByCartItem(cartItemId) {
    const r = await query(
      `SELECT r.id, r.cart_item_id, r.mission_slot_id, r.user_id, r.reaction_type, r.content,
              COALESCE(u.name, r.guest_name) as display_name
       FROM reactions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.cart_item_id = :cid ORDER BY r.created_at ASC`,
      { cid: cartItemId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, cartItemId: row.CART_ITEM_ID, missionSlotId: row.MISSION_SLOT_ID,
      userId: row.USER_ID, type: row.REACTION_TYPE, content: row.CONTENT,
      user: { id: row.USER_ID, name: row.DISPLAY_NAME || 'Someone' },
    }));
  },
  async findByMissionSlot(missionSlotId) {
    const r = await query(
      `SELECT r.id, r.cart_item_id, r.mission_slot_id, r.user_id, r.reaction_type, r.content,
              COALESCE(u.name, r.guest_name) as display_name
       FROM reactions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.mission_slot_id = :msid ORDER BY r.created_at ASC`,
      { msid: missionSlotId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, cartItemId: row.CART_ITEM_ID, missionSlotId: row.MISSION_SLOT_ID,
      userId: row.USER_ID, type: row.REACTION_TYPE, content: row.CONTENT,
      user: { id: row.USER_ID, name: row.DISPLAY_NAME || 'Someone' },
    }));
  },
};

// ─── Goals ────────────────────────────────────────────────────────────────────
const Goal = {
  async create({ userId, rawText, parsedPlan, cartId }) {
    const id = uuidv4();
    await query(
      `INSERT INTO goals (id, user_id, raw_text, parsed_plan, cart_id, status, created_at, updated_at)
       VALUES (:id, :goalUid, :rt, :pp, :cid, 'planning', SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, goalUid: userId, rt: rawText, pp: JSON.stringify(parsedPlan), cid: cartId || null }
    );
    return { id, userId, rawText, parsedPlan, cartId };
  },
  async findByCartId(cartId) {
    const r = await query(`SELECT * FROM goals WHERE cart_id = :cid ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`, { cid: cartId });
    const row = r.rows?.[0];
    if (!row) return null;
    let parsedPlan = null;
    try { parsedPlan = JSON.parse(row.PARSED_PLAN); } catch { /* leave null if malformed */ }
    return { id: row.ID, userId: row.USER_ID, rawText: row.RAW_TEXT, parsedPlan, cartId: row.CART_ID };
  },
};

// ─── Wardrobes ────────────────────────────────────────────────────────────────
const Wardrobe = {
  async create({ userId, cartId, name, outfitCombinations, totalItems, totalPrice }) {
    const id = uuidv4();
    await query(
      `INSERT INTO wardrobes (id, user_id, cart_id, name, outfit_combinations, total_items, total_price, created_at, updated_at)
       VALUES (:id, :wardrobeUid, :cid, :name, :oc, :ti, :tp, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, wardrobeUid: userId, cid: cartId, name: name || 'My Wardrobe',
        oc: JSON.stringify(outfitCombinations || []), ti: totalItems || 0, tp: totalPrice || 0 }
    );
    return { id };
  },
  async findByUser(userId) {
    const r = await query(`SELECT * FROM wardrobes WHERE user_id = :wardrobeUid ORDER BY created_at DESC`, { wardrobeUid: userId });
    return r.rows || [];
  },
  async findOwnedItems(userId) {
    const r = await query(
      `SELECT w.name as wardrobe_name, p.article_type, p.base_colour, p.title
       FROM wardrobes w
       JOIN cart_items ci ON ci.cart_id = w.cart_id
       JOIN products p ON p.id = ci.product_id
       WHERE w.user_id = :wardrobeUid
       ORDER BY w.created_at DESC`,
      { wardrobeUid: userId }
    );
    return r.rows || [];
  },
};

// ─── Missions (Wedding Wardrobe Matrix) ───────────────────────────────────────
const Mission = {
  async create({ userId, type, title, community, totalBudget, city }) {
    const id = uuidv4();
    await query(
      `INSERT INTO missions (id, user_id, type, title, community, total_budget, city, status, created_at, updated_at)
       VALUES (:id, :missionUid, :type, :title, :community, :budget, :city, 'active', SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, missionUid: userId, type, title: title || null, community: community || null,
        budget: totalBudget || 0, city: city || null }
    );
    return { id };
  },
  async findById(id) {
    const r = await query(`SELECT * FROM missions WHERE id = :id`, { id });
    const row = r.rows?.[0];
    // Every caller reads the raw uppercase Oracle columns (mission.COMMUNITY,
    // mission.TOTAL_BUDGET, ...) directly, so this can't be replaced with a
    // normalized object — but routes/mission.js and routes/collab.js also
    // read `mission.id` (lowercase) for socket room names and FK lookups,
    // which was silently resolving to undefined (room "mission_undefined",
    // never matching any client's joined room) since only .ID ever existed.
    return row ? { ...row, id: row.ID } : null;
  },
};

const MissionEvent = {
  async createMany(missionId, events) {
    const created = [];
    for (let i = 0; i < events.length; i++) {
      const id = uuidv4();
      await query(
        `INSERT INTO mission_events (id, mission_id, name, palette_family, sort_order, created_at)
         VALUES (:id, :mid, :name, :palette, :sortOrder, SYSTIMESTAMP)`,
        { id, mid: missionId, name: events[i].name,
          palette: JSON.stringify(events[i].paletteFamily || []), sortOrder: i }
      );
      created.push({ id, missionId, name: events[i].name, paletteFamily: events[i].paletteFamily || [], sortOrder: i });
    }
    return created;
  },
  async findByMission(missionId) {
    const r = await query(
      `SELECT * FROM mission_events WHERE mission_id = :mid ORDER BY sort_order ASC`,
      { mid: missionId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, missionId: row.MISSION_ID, name: row.NAME,
      paletteFamily: safeJson(row.PALETTE_FAMILY), sortOrder: row.SORT_ORDER,
    }));
  },
};

const MissionMember = {
  async createMany(missionId, members) {
    const created = [];
    for (const m of members) {
      const id = uuidv4();
      await query(
        `INSERT INTO mission_members (id, mission_id, name, role_weight, gender, age_bracket, created_at)
         VALUES (:id, :mid, :name, :weight, :gender, :ageBracket, SYSTIMESTAMP)`,
        { id, mid: missionId, name: m.name, weight: m.roleWeight || 1,
          gender: m.gender || 'Unisex', ageBracket: m.ageBracket || 'adult' }
      );
      created.push({ id, missionId, name: m.name, roleWeight: m.roleWeight || 1, gender: m.gender || 'Unisex', ageBracket: m.ageBracket || 'adult' });
    }
    return created;
  },
  async findByMission(missionId) {
    const r = await query(`SELECT * FROM mission_members WHERE mission_id = :mid ORDER BY created_at ASC`, { mid: missionId });
    return (r.rows || []).map(row => ({
      id: row.ID, missionId: row.MISSION_ID, name: row.NAME,
      roleWeight: row.ROLE_WEIGHT, gender: row.GENDER, ageBracket: row.AGE_BRACKET,
    }));
  },
};

const MissionSlot = {
  async createMany(slots) {
    const created = [];
    for (const s of slots) {
      const id = uuidv4();
      await query(
        `INSERT INTO mission_slots (id, mission_id, event_id, member_id, status, allocated_budget, created_at, updated_at)
         VALUES (:id, :mid, :eventId, :memberId, 'pending', :budget, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { id, mid: s.missionId, eventId: s.eventId, memberId: s.memberId, budget: s.allocatedBudget || 0 }
      );
      created.push({ id, ...s, status: 'pending', productId: null });
    }
    return created;
  },
  async findByMission(missionId) {
    const r = await query(
      `SELECT ms.*, p.title, p.brand, p.price, p.base_colour, p.article_type, p.images
       FROM mission_slots ms
       LEFT JOIN products p ON p.id = ms.product_id
       WHERE ms.mission_id = :mid`,
      { mid: missionId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, missionId: row.MISSION_ID, eventId: row.EVENT_ID, memberId: row.MEMBER_ID,
      productId: row.PRODUCT_ID, status: row.STATUS, allocatedBudget: row.ALLOCATED_BUDGET,
      relaxationNote: row.RELAXATION_NOTE,
      product: row.PRODUCT_ID ? {
        id: row.PRODUCT_ID, title: row.TITLE, brand: row.BRAND, price: row.PRICE,
        baseColour: row.BASE_COLOUR, articleType: row.ARTICLE_TYPE, images: safeJson(row.IMAGES),
      } : null,
    }));
  },
  async update(id, fields) {
    const sets = [];
    const binds = { id };
    if (fields.productId !== undefined) { sets.push('product_id = :productId'); binds.productId = fields.productId; }
    if (fields.status !== undefined) { sets.push('status = :status'); binds.status = fields.status; }
    if (fields.relaxationNote !== undefined) { sets.push('relaxation_note = :relaxNote'); binds.relaxNote = fields.relaxationNote; }
    if (fields.allocatedBudget !== undefined) { sets.push('allocated_budget = :allocBudget'); binds.allocBudget = fields.allocatedBudget; }
    if (sets.length === 0) return;
    sets.push('updated_at = SYSTIMESTAMP');
    await query(`UPDATE mission_slots SET ${sets.join(', ')} WHERE id = :id`, binds);
  },
};

// ─── Parties (CO-ATTENDEE mode — the Clash Engine) ────────────────────────────
// A party groups several attendees' INDIVIDUAL carts together so their
// items can be compared live — a different shape from CollabSession, which
// is many reviewers looking at ONE shared cart.
const Party = {
  async create({ name, ownerId, shareToken }) {
    const id = uuidv4();
    await query(
      `INSERT INTO parties (id, name, owner_id, share_token, created_at, updated_at)
       VALUES (:id, :name, :ownerId, :token, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, name: name || 'The Party', ownerId: ownerId || null, token: shareToken }
    );
    return { id, name, ownerId, shareToken };
  },
  async findByToken(shareToken) {
    const r = await query(`SELECT * FROM parties WHERE share_token = :t`, { t: shareToken });
    return r.rows?.[0] || null;
  },
};

const PartyMember = {
  async create({ partyId, userId, guestName, guestToken, cartId }) {
    const id = uuidv4();
    await query(
      `INSERT INTO party_members (id, party_id, user_id, guest_name, guest_token, cart_id, created_at)
       VALUES (:id, :pid, :userId, :guestName, :guestToken, :cartId, SYSTIMESTAMP)`,
      { id, pid: partyId, userId: userId || null, guestName: guestName || null, guestToken: guestToken || null, cartId: cartId || null }
    );
    return { id, partyId, userId, guestName, guestToken, cartId };
  },
  async findByGuestToken({ partyId, guestToken }) {
    const r = await query(
      `SELECT * FROM party_members WHERE party_id = :pid AND guest_token = :gt`,
      { pid: partyId, gt: guestToken }
    );
    return r.rows?.[0] || null;
  },
  async findByParty(partyId) {
    const r = await query(
      `SELECT pm.id, pm.user_id, pm.guest_name, pm.cart_id,
              COALESCE(u.name, pm.guest_name) as display_name
       FROM party_members pm LEFT JOIN users u ON u.id = pm.user_id
       WHERE pm.party_id = :pid ORDER BY pm.created_at ASC`,
      { pid: partyId }
    );
    return (r.rows || []).map(row => ({
      id: row.ID, userId: row.USER_ID, name: row.DISPLAY_NAME, cartId: row.CART_ID,
    }));
  },
};

// Helper
function safeJson(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

module.exports = {
  User, Product, Cart, CartItem, CollabSession, CollabMember, Reaction, Goal, Wardrobe,
  Mission, MissionEvent, MissionMember, MissionSlot, Party, PartyMember,
};
