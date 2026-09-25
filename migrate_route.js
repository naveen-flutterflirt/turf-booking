const db = require('./src/config/db');

async function migrate() {
  try {
    await db.query(`ALTER TABLE owners ADD COLUMN razorpay_linked_account_id VARCHAR(100);`);
    console.log("Migration successful: Added razorpay_linked_account_id to owners table.");
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    process.exit();
  }
}

migrate();
