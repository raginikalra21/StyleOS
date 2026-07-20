const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Cart, CartItem, CollabSession, CollabMember, Reaction, Goal, Wardrobe, Mission, MissionEvent, MissionMember, MissionSlot, Party, PartyMember, User } = require('../models');
const { query } = require('../db');

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Helper to clean up previous demo data to avoid primary key/unique constraint violations
async function cleanOldDemoData(userId) {
  const carts = await Cart.findByOwner(userId);
  const cartIds = carts.map(c => c.ID || c.id);

  if (cartIds.length > 0) {
    const placeholders = cartIds.map((_, i) => `:id${i}`).join(',');
    const binds = Object.fromEntries(cartIds.map((id, i) => [`id${i}`, id]));

    await query(`DELETE FROM reactions WHERE cart_item_id IN (SELECT id FROM cart_items WHERE cart_id IN (${placeholders}))`, binds);
    await query(`DELETE FROM slot_rejections WHERE cart_id IN (${placeholders})`, binds);
    await query(`DELETE FROM collab_members WHERE session_id IN (SELECT id FROM collab_sessions WHERE cart_id IN (${placeholders}))`, binds);
    await query(`DELETE FROM collab_sessions WHERE cart_id IN (${placeholders})`, binds);
    await query(`DELETE FROM cart_items WHERE cart_id IN (${placeholders})`, binds);
    await query(`DELETE FROM goals WHERE cart_id IN (${placeholders})`, binds);
    await query(`DELETE FROM wardrobes WHERE cart_id IN (${placeholders})`, binds);
    await query(`DELETE FROM party_members WHERE cart_id IN (${placeholders})`, binds);
    await query(`DELETE FROM carts WHERE id IN (${placeholders})`, binds);
  }

  const partyRows = await query(`SELECT id FROM parties WHERE owner_id = :ownerId`, { ownerId: userId });
  const partyIds = (partyRows.rows || []).map(p => p.ID || p.id);
  if (partyIds.length > 0) {
    const placeholders = partyIds.map((_, i) => `:id${i}`).join(',');
    const binds = Object.fromEntries(partyIds.map((id, i) => [`id${i}`, id]));
    await query(`DELETE FROM party_members WHERE party_id IN (${placeholders})`, binds);
    await query(`DELETE FROM parties WHERE id IN (${placeholders})`, binds);
  }

  const missionRows = await query(`SELECT id FROM missions WHERE user_id = :userId`, { userId });
  const missionIds = (missionRows.rows || []).map(m => m.ID || m.id);
  if (missionIds.length > 0) {
    const placeholders = missionIds.map((_, i) => `:id${i}`).join(',');
    const binds = Object.fromEntries(missionIds.map((id, i) => [`id${i}`, id]));
    
    await query(`DELETE FROM reactions WHERE mission_slot_id IN (SELECT id FROM mission_slots WHERE mission_id IN (${placeholders}))`, binds);
    await query(`DELETE FROM slot_rejections WHERE mission_id IN (${placeholders})`, binds);
    await query(`DELETE FROM collab_members WHERE session_id IN (SELECT id FROM collab_sessions WHERE mission_id IN (${placeholders}))`, binds);
    await query(`DELETE FROM collab_sessions WHERE mission_id IN (${placeholders})`, binds);
    await query(`DELETE FROM mission_slots WHERE mission_id IN (${placeholders})`, binds);
    await query(`DELETE FROM mission_events WHERE mission_id IN (${placeholders})`, binds);
    await query(`DELETE FROM mission_members WHERE mission_id IN (${placeholders})`, binds);
    await query(`DELETE FROM missions WHERE id IN (${placeholders})`, binds);
  }
}

// POST /api/demo/seed
router.post('/seed', async (req, res) => {
  try {
    const { type } = req.body; // 'kiya' | 'collab' | 'clash' | 'wedding'
    if (!['kiya', 'collab', 'clash', 'wedding'].includes(type)) {
      return res.status(400).json({ error: 'Invalid seed type' });
    }

    // 1. Ensure demo user exists
    const email = 'demo_user@styleos.test';
    const password = 'DemoUser1234!';
    let user = await User.findByEmail(email);
    if (!user) {
      const passwordHash = await bcrypt.hash(password, 12);
      user = await User.create({ name: 'Demo Presenter', email, passwordHash });
    }
    const userId = user.ID || user.id;
    const token = signToken(userId);

    // Clean up old demo items to keep DB neat and avoid duplicate constraint errors
    await cleanOldDemoData(userId);

    // Fetch some standard products for seeding
    // Black t-shirt (men)
    const pTee1 = '3dad64be-18db-4330-9015-d9d82374231f';
    // Grey t-shirt (men) — was a White tee, which silently violated this
    // cart's own "Black/grey only" goal text the whole time (Invariant 3).
    const pTee2 = '6d87cc49-e82a-4126-a1aa-400d56f05b97';
    // Grey sweatshirt (men/unisex) — also doubles as the Clash Engine's
    // matching item for Rahul/Deepak, so it must be a real men's/unisex
    // piece, not the women's cut-out jumper this used to point at.
    const pSweat1 = 'ddc15055-53b1-4b22-ab1a-cceb05926a4b';
    // Black cargo pants (men)
    const pCargo = '2725b144-a182-4c5f-9d60-8edece0ae5ab';
    // Black jeans (men)
    const pJeans = '8da93ef5-65d4-4822-a670-751db24acc92';

    if (type === 'kiya') {
      // Seed Kiya AI Goal Cart
      const cart = await Cart.create({
        ownerId: userId,
        name: 'My College Wardrobe',
        goalText: 'Starting college next month. Budget 15000. Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie. Black/grey only. Delhi. Hostel.',
      });

      // Add items
      await CartItem.create({ cartId: cart.id, productId: pTee1, size: 'M', quantity: 2, addedByAgent: true });
      await CartItem.create({ cartId: cart.id, productId: pTee2, size: 'M', quantity: 1, addedByAgent: true });
      await CartItem.create({ cartId: cart.id, productId: pCargo, size: 'M', quantity: 2, addedByAgent: true });
      await CartItem.create({ cartId: cart.id, productId: pJeans, size: 'L', quantity: 2, addedByAgent: true });
      await CartItem.create({ cartId: cart.id, productId: pSweat1, size: 'L', quantity: 1, addedByAgent: true });

      await Cart.updateTotal(cart.id);

      const parsedPlan = {
        gender: 'Men',
        gender_confidence: 'explicit',
        total_budget: 15000,
        items: [
          { type: 'oversized tee', quantity: 3, priority: 1, budget: 3000, colors: ['Black', 'Grey'] },
          { type: 'cargo pants', quantity: 2, priority: 2, budget: 4000, colors: ['Black'] },
          { type: 'jeans', quantity: 2, priority: 3, budget: 4500, colors: ['Black', 'Grey'] },
          { type: 'hoodie', quantity: 1, priority: 4, budget: 3500, colors: ['Grey'] },
        ],
        context: { occasion: 'College life', city: 'Delhi', season: 'Monsoon/Fall', life_stage: 'Hostel' }
      };

      await Goal.create({ userId, rawText: cart.goalText, parsedPlan, cartId: cart.id });

      return res.json({
        type: 'kiya',
        token,
        cartId: cart.id,
        user: { id: userId, name: user.NAME || user.name, email },
      });
    }

    if (type === 'collab') {
      // Seed a Collab Cart (Advisor, Approver, and Proxy ready)
      const cart = await Cart.create({
        ownerId: userId,
        name: 'Gen Z College Wardrobe',
        goalText: 'Starting college next month. Budget 15000. Black/grey only.',
      });

      // Add items
      const i1 = await CartItem.create({ cartId: cart.id, productId: pTee1, size: 'M', quantity: 1, addedByAgent: true });
      const i2 = await CartItem.create({ cartId: cart.id, productId: pCargo, size: 'M', quantity: 1, addedByAgent: true });
      const i3 = await CartItem.create({ cartId: cart.id, productId: pSweat1, size: 'L', quantity: 1, addedByAgent: true });

      await Cart.updateTotal(cart.id);

      // Create collab session (defaults to advisor, but can show all modes)
      const shareToken = uuidv4();
      const session = await CollabSession.create({
        cartId: cart.id,
        shareToken,
        askMode: 'advisor',
      });

      // Create guest members
      const sId = session.id;
      const m1 = await CollabMember.create({ sessionId: sId, guestName: 'Mom', guestToken: 'mom-guest-token' });
      const m2 = await CollabMember.create({ sessionId: sId, guestName: 'Dad (CFO)', guestToken: 'dad-guest-token' });
      const m3 = await CollabMember.create({ sessionId: sId, guestName: 'Gagan (Brother)', guestToken: 'brother-guest-token' });

      // Advisor feedback is NOT pre-seeded here — the Step 2 autopilot
      // script (CollabCartPage.js) plays out this exact story live on i1
      // (skip -> comment -> owner swaps -> love) itself now. Pre-seeding a
      // 'skip' on the same item used to double-count against the live one.

      // Also set Dad's Payer Lock parameters in collab_sessions so Approver Mode displays it nicely
      await query(
        `UPDATE collab_sessions SET budget_lock = 12000, item_price_cap = 1500 WHERE id = :id`,
        { id: sId }
      );

      // Also set a Recipient Profile for Proxy Mode
      const profile = { size: 'M', colours: 'Black and Grey only', avoid: 'No flashy logos or printed texts', notes: ' Nephew Aarav entering hostel life.' };
      await query(
        `UPDATE collab_sessions SET recipient_name = 'Aarav (Nephew)', recipient_relation = 'Nephew', recipient_profile = :profile WHERE id = :id`,
        { id: sId, profile: JSON.stringify(profile) }
      );

      return res.json({
        type: 'collab',
        token,
        shareToken,
        cartId: cart.id,
        user: { id: userId, name: user.NAME || user.name, email },
      });
    }

    if (type === 'clash') {
      // Co-Attendee Clash Engine
      const shareToken = uuidv4();
      const party = await Party.create({
        name: 'College Graduation Party 2026',
        ownerId: userId,
        shareToken,
      });

      // Create Rahul's Cart
      const cartRahul = await Cart.create({ ownerId: userId, name: "Rahul's Outfit", goalText: 'Graduation party outfit' });
      await CartItem.create({ cartId: cartRahul.id, productId: pSweat1, size: 'M', quantity: 1, addedByAgent: true });
      await Cart.updateTotal(cartRahul.id);

      // Create Deepak's Cart
      const cartDeepak = await Cart.create({ ownerId: userId, name: "Deepak's Outfit", goalText: 'Graduation party black/grey looks' });
      await CartItem.create({ cartId: cartDeepak.id, productId: pSweat1, size: 'L', quantity: 1, addedByAgent: true });
      await Cart.updateTotal(cartDeepak.id);

      // Add party members
      const pId = party.id || party.ID;
      await PartyMember.create({ partyId: pId, guestName: 'Rahul', guestToken: 'rahul-guest-token', cartId: cartRahul.id });
      await PartyMember.create({ partyId: pId, guestName: 'Deepak', guestToken: 'deepak-guest-token', cartId: cartDeepak.id });

      return res.json({
        type: 'clash',
        token,
        shareToken,
        user: { id: userId, name: user.NAME || user.name, email },
      });
    }

    if (type === 'wedding') {
      // Wedding matrix with pre-populated events and family rejections
      const mission = await Mission.create({
        userId,
        type: 'wedding',
        title: 'Sharma Family Punjabi Wedding',
        community: 'Punjabi',
        totalBudget: 60000,
        city: 'Delhi',
      });

      const mId = mission.id;

      // Seed Events
      const eMehendi = await MissionEvent.createMany(mId, [{ name: 'Mehendi', paletteFamily: ['Green', 'Yellow', 'Mustard'] }]);
      const eSangeet = await MissionEvent.createMany(mId, [{ name: 'Sangeet', paletteFamily: ['Blue', 'Purple', 'Pink'] }]);
      const eWedding = await MissionEvent.createMany(mId, [{ name: 'Wedding', paletteFamily: ['Red', 'Maroon', 'Gold', 'Black'] }]);

      // Seed Members
      const mDad = await MissionMember.createMany(mId, [{ name: 'Dad', roleWeight: 1.5, gender: 'Men', ageBracket: 'adult' }]);
      const mMom = await MissionMember.createMany(mId, [{ name: 'Mom', roleWeight: 1.5, gender: 'Women', ageBracket: 'adult' }]);
      const mRohan = await MissionMember.createMany(mId, [{ name: 'Rohan (Groom)', roleWeight: 2.0, gender: 'Men', ageBracket: 'adult' }]);
      const mSneha = await MissionMember.createMany(mId, [{ name: 'Sneha (Sister)', roleWeight: 1.0, gender: 'Women', ageBracket: 'adult' }]);

      // Get created event and member objects
      const evMehendi = eMehendi[0];
      const evSangeet = eSangeet[0];
      const evWedding = eWedding[0];

      const memDad = mDad[0];
      const memMom = mMom[0];
      const memRohan = mRohan[0];
      const memSneha = mSneha[0];

      // MEHENDI EVENT
      // 1. Dad Mehendi (Manyavar Green Kurta — Men: 79bce894-593a-45f1-a6c7-6d9fc9ac6a49)
      const s_dad_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memDad.id, allocatedBudget: 4000 }]);
      await MissionSlot.update(s_dad_mehendi[0].id, { productId: '79bce894-593a-45f1-a6c7-6d9fc9ac6a49', status: 'filled' });

      // 2. Rohan Mehendi (Global Desi Yellow Kurta — Men: f785b761-b744-4a16-a1ae-c2ac0a1b691e)
      const s_rohan_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memRohan.id, allocatedBudget: 5000 }]);
      await MissionSlot.update(s_rohan_mehendi[0].id, { productId: 'f785b761-b744-4a16-a1ae-c2ac0a1b691e', status: 'filled' });

      // 3. Mom Mehendi (Global Desi Mustard Kurta — Women: be9d2b4f-5789-4bfb-8ead-adefe9a569c7)
      const s_mom_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memMom.id, allocatedBudget: 4000 }]);
      await MissionSlot.update(s_mom_mehendi[0].id, { productId: 'be9d2b4f-5789-4bfb-8ead-adefe9a569c7', status: 'filled' });

      // 4. Sneha Mehendi (deadlocked, starting with Manyavar Green Kurta — Women: 540974c2-719a-4c82-9c3a-ff6b4cf7f4b1)
      const s_sneha_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memSneha.id, allocatedBudget: 5000 }]);
      const slotId = s_sneha_mehendi[0].id;
      const rejectedProductId = '540974c2-719a-4c82-9c3a-ff6b4cf7f4b1';
      await MissionSlot.update(slotId, { productId: rejectedProductId, status: 'filled' });

      // SANGEET EVENT
      // 5. Dad Sangeet (Ritu Kumar Studio Purple Kurta — Men: 17a15fc0-2c9f-4a1d-aa20-df06670ae450)
      const s_dad_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memDad.id, allocatedBudget: 4000 }]);
      await MissionSlot.update(s_dad_sangeet[0].id, { productId: '17a15fc0-2c9f-4a1d-aa20-df06670ae450', status: 'filled' });

      // 6. Rohan Sangeet (Biba Pink Kurta — Men: 1db6d68a-4c7a-44d7-a167-3648a52b18dc)
      const s_rohan_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memRohan.id, allocatedBudget: 5000 }]);
      await MissionSlot.update(s_rohan_sangeet[0].id, { productId: '1db6d68a-4c7a-44d7-a167-3648a52b18dc', status: 'filled' });

      // 7. Mom Sangeet (Biba Purple Saree — Women: 7fa681d4-b865-4868-89dc-b8278302244c)
      const s_mom_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memMom.id, allocatedBudget: 8000 }]);
      await MissionSlot.update(s_mom_sangeet[0].id, { productId: '7fa681d4-b865-4868-89dc-b8278302244c', status: 'filled' });

      // 8. Sneha Sangeet (Global Desi Purple Kurta — Women: 336bafa1-2889-4bb9-925b-3b018a5a8cda)
      const s_sneha_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memSneha.id, allocatedBudget: 4000 }]);
      await MissionSlot.update(s_sneha_sangeet[0].id, { productId: '336bafa1-2889-4bb9-925b-3b018a5a8cda', status: 'filled' });

      // WEDDING EVENT
      // 9. Dad Wedding (Fabindia Red Sherwani — Men: e7e98494-f0af-4b65-a696-37f07fbf7104)
      const s_dad_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memDad.id, allocatedBudget: 15000 }]);
      await MissionSlot.update(s_dad_wedding[0].id, { productId: 'e7e98494-f0af-4b65-a696-37f07fbf7104', status: 'filled' });

      // 10. Rohan Wedding (Ritu Kumar Studio Navy Blue Sherwani — Men: b706c7ea-4f18-41ba-962f-b653f4ab5554)
      const s_rohan_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memRohan.id, allocatedBudget: 15000 }]);
      await MissionSlot.update(s_rohan_wedding[0].id, { productId: 'b706c7ea-4f18-41ba-962f-b653f4ab5554', status: 'filled' });

      // 11. Mom Wedding (Global Desi Red Lehenga Choli — Women: d1156f94-cbd1-48dd-b9ac-b586d4c7b3f7)
      const s_mom_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memMom.id, allocatedBudget: 10000 }]);
      await MissionSlot.update(s_mom_wedding[0].id, { productId: 'd1156f94-cbd1-48dd-b9ac-b586d4c7b3f7', status: 'filled' });

      // 12. Sneha Wedding (Ritu Kumar Studio Black Saree — Women: 2b2fd507-645f-40dc-b225-cfabf460a0da)
      const s_sneha_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memSneha.id, allocatedBudget: 8000 }]);
      await MissionSlot.update(s_sneha_wedding[0].id, { productId: '2b2fd507-645f-40dc-b225-cfabf460a0da', status: 'filled' });

      // Record rejections that trigger a price deadlock. The quality
      // rejection's reference price must produce a floor (price*1.1)
      // higher than the price rejection's reference cap (price*0.9) —
      // 2800*1.1=3080 vs 1800*0.9=1620 — or detectConflict() never fires.
      const slotKeyStr = `mission:${mId}:${evMehendi.id}:${memSneha.id}`;
      await query(
        `INSERT INTO slot_rejections (id, mission_id, slot_key, product_id, product_price, product_colour, rejected_by_name, reason_text, reason_class, rejected_at)
         VALUES (:id, :mid, :sk, :pid, 2800, 'Yellow', 'Sneha', 'not fancy enough, too simple for groom sister!', 'quality', SYSTIMESTAMP - 1/24)`,
        { id: uuidv4(), mid: mId, sk: slotKeyStr, pid: rejectedProductId }
      );

      const premiumProductId = '540974c2-719a-4c82-9c3a-ff6b4cf7f4b1';
      await query(
        `INSERT INTO slot_rejections (id, mission_id, slot_key, product_id, product_price, product_colour, rejected_by_name, reason_text, reason_class, rejected_at)
         VALUES (:id, :mid, :sk, :pid, 1800, 'Green', 'Mom', 'too costly, limit for Mehendi dress is ₹1,800', 'price', SYSTIMESTAMP)`,
        { id: uuidv4(), mid: mId, sk: slotKeyStr, pid: premiumProductId }
      );

      // minPrice (2800*1.1=3080) > maxPrice (1800*0.9=1620), so a deadlock
      // exists on s4 the moment anyone rejects this slot again.
      // Set s4 status to show it is resolved/deadlocked
      await MissionSlot.update(slotId, { status: 'filled' });

      // Generate a Collab Session (Family Council share link)
      const shareToken = uuidv4();
      await CollabSession.create({
        missionId: mId,
        shareToken,
        askMode: 'advisor',
      });

      return res.json({
        type: 'wedding',
        token,
        missionId: mId,
        shareToken,
        user: { id: userId, name: user.NAME || user.name, email },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Demo seed error:', err);
    res.status(500).json({ error: 'Failed to seed demo scenario: ' + err.message });
  }
});

// POST /api/demo/seed-all
router.post('/seed-all', async (req, res) => {
  try {
    const email = 'demo_user@styleos.test';
    const password = 'DemoUser1234!';
    let user = await User.findByEmail(email);
    if (!user) {
      const passwordHash = await bcrypt.hash(password, 12);
      user = await User.create({ name: 'Demo Presenter', email, passwordHash });
    }
    const userId = user.ID || user.id;
    const token = signToken(userId);

    await cleanOldDemoData(userId);

    const pTee1 = '3dad64be-18db-4330-9015-d9d82374231f';
    const pTee2 = '6d87cc49-e82a-4126-a1aa-400d56f05b97'; // Grey tee — was White, violated "Black/grey only"
    const pSweat1 = 'ddc15055-53b1-4b22-ab1a-cceb05926a4b';
    const pCargo = '2725b144-a182-4c5f-9d60-8edece0ae5ab';
    const pJeans = '8da93ef5-65d4-4822-a670-751db24acc92';

    // 1. Seed Kiya AI Cart
    const cartKiya = await Cart.create({
      ownerId: userId,
      name: 'My College Wardrobe',
      goalText: 'Starting college next month. Budget 15000. Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie. Black/grey only. Delhi. Hostel.',
    });
    await CartItem.create({ cartId: cartKiya.id, productId: pTee1, size: 'M', quantity: 2, addedByAgent: true });
    await CartItem.create({ cartId: cartKiya.id, productId: pTee2, size: 'M', quantity: 1, addedByAgent: true });
    await CartItem.create({ cartId: cartKiya.id, productId: pCargo, size: 'M', quantity: 2, addedByAgent: true });
    await CartItem.create({ cartId: cartKiya.id, productId: pJeans, size: 'L', quantity: 2, addedByAgent: true });
    await CartItem.create({ cartId: cartKiya.id, productId: pSweat1, size: 'L', quantity: 1, addedByAgent: true });
    await Cart.updateTotal(cartKiya.id);

    const parsedPlan = {
      gender: 'Men',
      gender_confidence: 'explicit',
      total_budget: 15000,
      items: [
        { type: 'oversized tee', quantity: 3, priority: 1, budget: 3000, colors: ['Black', 'Grey'] },
        { type: 'cargo pants', quantity: 2, priority: 2, budget: 4000, colors: ['Black'] },
        { type: 'jeans', quantity: 2, priority: 3, budget: 4500, colors: ['Black', 'Grey'] },
        { type: 'hoodie', quantity: 1, priority: 4, budget: 3500, colors: ['Grey'] },
      ],
      context: { occasion: 'College life', city: 'Delhi', season: 'Monsoon/Fall', life_stage: 'Hostel' }
    };
    await Goal.create({ userId, rawText: cartKiya.goalText, parsedPlan, cartId: cartKiya.id });

    // 2. Seed Collab Cart
    const cartCollab = await Cart.create({
      ownerId: userId,
      name: 'Gen Z College Wardrobe',
      goalText: 'Starting college next month. Budget 15000. Black/grey only.',
    });
    const i1 = await CartItem.create({ cartId: cartCollab.id, productId: pTee1, size: 'M', quantity: 1, addedByAgent: true });
    const i2 = await CartItem.create({ cartId: cartCollab.id, productId: pCargo, size: 'M', quantity: 1, addedByAgent: true });
    const i3 = await CartItem.create({ cartId: cartCollab.id, productId: pSweat1, size: 'L', quantity: 1, addedByAgent: true });
    await Cart.updateTotal(cartCollab.id);

    const shareTokenCollab = uuidv4();
    const sessionCollab = await CollabSession.create({
      cartId: cartCollab.id,
      shareToken: shareTokenCollab,
      askMode: 'advisor',
    });
    await CollabMember.create({ sessionId: sessionCollab.id, guestName: 'Mom', guestToken: 'mom-guest-token' });
    await CollabMember.create({ sessionId: sessionCollab.id, guestName: 'Dad (CFO)', guestToken: 'dad-guest-token' });
    await CollabMember.create({ sessionId: sessionCollab.id, guestName: 'Gagan (Brother)', guestToken: 'brother-guest-token' });
    // Advisor feedback is NOT pre-seeded here — the Step 2 autopilot script
    // (CollabCartPage.js) plays out this exact story live on i1 (skip ->
    // comment -> owner swaps -> love) itself now. Pre-seeding a 'skip' on
    // the same item used to double-count against the live one.
    await query(
      `UPDATE collab_sessions SET budget_lock = 12000, item_price_cap = 1500 WHERE id = :id`,
      { id: sessionCollab.id }
    );
    const profile = { size: 'M', colours: 'Black and Grey only', avoid: 'No flashy logos or printed texts', notes: ' Nephew Aarav entering hostel life.' };
    await query(
      `UPDATE collab_sessions SET recipient_name = 'Aarav (Nephew)', recipient_relation = 'Nephew', recipient_profile = :profile WHERE id = :id`,
      { id: sessionCollab.id, profile: JSON.stringify(profile) }
    );

    // 3. Seed Clash Party
    const shareTokenClash = uuidv4();
    const party = await Party.create({
      name: 'College Graduation Party 2026',
      ownerId: userId,
      shareToken: shareTokenClash,
    });
    const cartRahul = await Cart.create({ ownerId: userId, name: "Rahul's Outfit", goalText: 'Graduation party outfit' });
    await CartItem.create({ cartId: cartRahul.id, productId: pSweat1, size: 'M', quantity: 1, addedByAgent: true });
    await Cart.updateTotal(cartRahul.id);

    const cartDeepak = await Cart.create({ ownerId: userId, name: "Deepak's Outfit", goalText: 'Graduation party black/grey looks' });
    await CartItem.create({ cartId: cartDeepak.id, productId: pSweat1, size: 'L', quantity: 1, addedByAgent: true });
    await Cart.updateTotal(cartDeepak.id);

    const pId = party.id || party.ID;
    await PartyMember.create({ partyId: pId, guestName: 'Rahul', guestToken: 'rahul-guest-token', cartId: cartRahul.id });
    await PartyMember.create({ partyId: pId, guestName: 'Deepak', guestToken: 'deepak-guest-token', cartId: cartDeepak.id });

    // 4. Seed Wedding Mission
    const mission = await Mission.create({
      userId,
      type: 'wedding',
      title: 'Sharma Family Punjabi Wedding',
      community: 'Punjabi',
      totalBudget: 60000,
      city: 'Delhi',
    });
    const mId = mission.id;
    const eMehendi = await MissionEvent.createMany(mId, [{ name: 'Mehendi', paletteFamily: ['Green', 'Yellow', 'Mustard'] }]);
    const eSangeet = await MissionEvent.createMany(mId, [{ name: 'Sangeet', paletteFamily: ['Blue', 'Purple', 'Pink'] }]);
    const eWedding = await MissionEvent.createMany(mId, [{ name: 'Wedding', paletteFamily: ['Red', 'Maroon', 'Gold', 'Black'] }]);
    const mDad = await MissionMember.createMany(mId, [{ name: 'Dad', roleWeight: 1.5, gender: 'Men', ageBracket: 'adult' }]);
    const mMom = await MissionMember.createMany(mId, [{ name: 'Mom', roleWeight: 1.5, gender: 'Women', ageBracket: 'adult' }]);
    const mRohan = await MissionMember.createMany(mId, [{ name: 'Rohan (Groom)', roleWeight: 2.0, gender: 'Men', ageBracket: 'adult' }]);
    const mSneha = await MissionMember.createMany(mId, [{ name: 'Sneha (Sister)', roleWeight: 1.0, gender: 'Women', ageBracket: 'adult' }]);

    const evMehendi = eMehendi[0];
    const evSangeet = eSangeet[0];
    const evWedding = eWedding[0];
    const memDad = mDad[0];
    const memMom = mMom[0];
    const memRohan = mRohan[0];
    const memSneha = mSneha[0];

    // MEHENDI EVENT
    // 1. Dad Mehendi (Manyavar Green Kurta — Men: 79bce894-593a-45f1-a6c7-6d9fc9ac6a49)
    const s_dad_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memDad.id, allocatedBudget: 4000 }]);
    await MissionSlot.update(s_dad_mehendi[0].id, { productId: '79bce894-593a-45f1-a6c7-6d9fc9ac6a49', status: 'filled' });

    // 2. Rohan Mehendi (Global Desi Yellow Kurta — Men: f785b761-b744-4a16-a1ae-c2ac0a1b691e)
    const s_rohan_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memRohan.id, allocatedBudget: 5000 }]);
    await MissionSlot.update(s_rohan_mehendi[0].id, { productId: 'f785b761-b744-4a16-a1ae-c2ac0a1b691e', status: 'filled' });

    // 3. Mom Mehendi (Global Desi Mustard Kurta — Women: be9d2b4f-5789-4bfb-8ead-adefe9a569c7)
    const s_mom_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memMom.id, allocatedBudget: 4000 }]);
    await MissionSlot.update(s_mom_mehendi[0].id, { productId: 'be9d2b4f-5789-4bfb-8ead-adefe9a569c7', status: 'filled' });

    // 4. Sneha Mehendi (deadlocked, starting with Manyavar Green Kurta — Women: 540974c2-719a-4c82-9c3a-ff6b4cf7f4b1)
    const s_sneha_mehendi = await MissionSlot.createMany([{ missionId: mId, eventId: evMehendi.id, memberId: memSneha.id, allocatedBudget: 5000 }]);
    const slotId = s_sneha_mehendi[0].id;
    const rejectedProductId = '540974c2-719a-4c82-9c3a-ff6b4cf7f4b1';
    await MissionSlot.update(slotId, { productId: rejectedProductId, status: 'filled' });

    // SANGEET EVENT
    // 5. Dad Sangeet (Ritu Kumar Studio Purple Kurta — Men: 17a15fc0-2c9f-4a1d-aa20-df06670ae450)
    const s_dad_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memDad.id, allocatedBudget: 4000 }]);
    await MissionSlot.update(s_dad_sangeet[0].id, { productId: '17a15fc0-2c9f-4a1d-aa20-df06670ae450', status: 'filled' });

    // 6. Rohan Sangeet (Biba Pink Kurta — Men: 1db6d68a-4c7a-44d7-a167-3648a52b18dc)
    const s_rohan_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memRohan.id, allocatedBudget: 5000 }]);
    await MissionSlot.update(s_rohan_sangeet[0].id, { productId: '1db6d68a-4c7a-44d7-a167-3648a52b18dc', status: 'filled' });

    // 7. Mom Sangeet (Biba Purple Saree — Women: 7fa681d4-b865-4868-89dc-b8278302244c)
    const s_mom_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memMom.id, allocatedBudget: 8000 }]);
    await MissionSlot.update(s_mom_sangeet[0].id, { productId: '7fa681d4-b865-4868-89dc-b8278302244c', status: 'filled' });

    // 8. Sneha Sangeet (Global Desi Purple Kurta — Women: 336bafa1-2889-4bb9-925b-3b018a5a8cda)
    const s_sneha_sangeet = await MissionSlot.createMany([{ missionId: mId, eventId: evSangeet.id, memberId: memSneha.id, allocatedBudget: 4000 }]);
    await MissionSlot.update(s_sneha_sangeet[0].id, { productId: '336bafa1-2889-4bb9-925b-3b018a5a8cda', status: 'filled' });

    // WEDDING EVENT
    // 9. Dad Wedding (Fabindia Red Sherwani — Men: e7e98494-f0af-4b65-a696-37f07fbf7104)
    const s_dad_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memDad.id, allocatedBudget: 15000 }]);
    await MissionSlot.update(s_dad_wedding[0].id, { productId: 'e7e98494-f0af-4b65-a696-37f07fbf7104', status: 'filled' });

    // 10. Rohan Wedding (Ritu Kumar Studio Navy Blue Sherwani — Men: b706c7ea-4f18-41ba-962f-b653f4ab5554)
    const s_rohan_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memRohan.id, allocatedBudget: 15000 }]);
    await MissionSlot.update(s_rohan_wedding[0].id, { productId: 'b706c7ea-4f18-41ba-962f-b653f4ab5554', status: 'filled' });

    // 11. Mom Wedding (Global Desi Red Lehenga Choli — Women: d1156f94-cbd1-48dd-b9ac-b586d4c7b3f7)
    const s_mom_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memMom.id, allocatedBudget: 10000 }]);
    await MissionSlot.update(s_mom_wedding[0].id, { productId: 'd1156f94-cbd1-48dd-b9ac-b586d4c7b3f7', status: 'filled' });

    // 12. Sneha Wedding (Ritu Kumar Studio Black Saree — Women: 2b2fd507-645f-40dc-b225-cfabf460a0da)
    const s_sneha_wedding = await MissionSlot.createMany([{ missionId: mId, eventId: evWedding.id, memberId: memSneha.id, allocatedBudget: 8000 }]);
    await MissionSlot.update(s_sneha_wedding[0].id, { productId: '2b2fd507-645f-40dc-b225-cfabf460a0da', status: 'filled' });

    const slotKeyStr = `mission:${mId}:${evMehendi.id}:${memSneha.id}`;
    await query(
      `INSERT INTO slot_rejections (id, mission_id, slot_key, product_id, product_price, product_colour, rejected_by_name, reason_text, reason_class, rejected_at)
       VALUES (:id, :mid, :sk, :pid, 2800, 'Yellow', 'Sneha', 'not fancy enough, too simple for groom sister!', 'quality', SYSTIMESTAMP - 1/24)`,
      { id: uuidv4(), mid: mId, sk: slotKeyStr, pid: rejectedProductId }
    );
    const premiumProductId = '540974c2-719a-4c82-9c3a-ff6b4cf7f4b1';
    await query(
      `INSERT INTO slot_rejections (id, mission_id, slot_key, product_id, product_price, product_colour, rejected_by_name, reason_text, reason_class, rejected_at)
       VALUES (:id, :mid, :sk, :pid, 1800, 'Green', 'Mom', 'too costly, limit for Mehendi dress is ₹1,800', 'price', SYSTIMESTAMP)`,
      { id: uuidv4(), mid: mId, sk: slotKeyStr, pid: premiumProductId }
    );
    await MissionSlot.update(slotId, { status: 'filled' });

    res.json({
      token,
      user: { id: userId, name: user.NAME || user.name, email },
      cartId: cartKiya.id,
      shareToken: shareTokenCollab,
      partyToken: shareTokenClash,
      weddingId: mId,
    });
  } catch (err) {
    console.error('Demo seed-all error:', err);
    res.status(500).json({ error: 'Failed to seed all scenarios: ' + err.message });
  }
});

module.exports = router;
