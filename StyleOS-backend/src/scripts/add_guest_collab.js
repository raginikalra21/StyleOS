/**
 * Adds guest-identity support to collab_members and reactions so a family
 * member can join a Squad Cart / Council with just a name — no StyleOS
 * account, no password. Section 3.2 "zero-friction join" / "invert the
 * initiator": the shopper (who has an account) starts the mission; the
 * people they need input from should never hit a login wall.
 */
require('dotenv').config();
const { query, closePool } = require('../db');

async function safeRun(sql, label) {
  try {
    await query(sql);
    console.log('OK:', label);
  } catch (err) {
    if (err.message && /ORA-01451|ORA-01430|ORA-00957/.test(err.message)) {
      console.log('SKIP (already applied):', label);
    } else {
      console.error('FAILED:', label, err.message);
    }
  }
}

async function main() {
  await safeRun(`ALTER TABLE collab_members MODIFY (user_id NULL)`, 'collab_members.user_id nullable');
  await safeRun(`ALTER TABLE collab_members ADD (guest_name VARCHAR2(120))`, 'collab_members.guest_name');
  await safeRun(`ALTER TABLE collab_members ADD (guest_token VARCHAR2(64))`, 'collab_members.guest_token');

  await safeRun(`ALTER TABLE reactions MODIFY (user_id NULL)`, 'reactions.user_id nullable');
  await safeRun(`ALTER TABLE reactions ADD (guest_name VARCHAR2(120))`, 'reactions.guest_name');

  // Rejection reason chips (Convergence engine input) need to reach
  // slot_rejections too, which currently assumes rejected_by is a real user id.
  await safeRun(`ALTER TABLE slot_rejections MODIFY (rejected_by NULL)`, 'slot_rejections.rejected_by nullable');
  await safeRun(`ALTER TABLE slot_rejections ADD (rejected_by_name VARCHAR2(120))`, 'slot_rejections.rejected_by_name');

  console.log('Guest collab migration complete.');
  await closePool();
}

main().catch(err => { console.error(err); process.exit(1); });
