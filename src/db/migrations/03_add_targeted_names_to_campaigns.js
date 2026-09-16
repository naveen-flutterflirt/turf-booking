const db = require('../../config/db');

const up = async () => {
  const query = `
    ALTER TABLE notification_campaigns 
    ADD COLUMN IF NOT EXISTS targeted_names TEXT;
  `;
  try {
    console.log('Running migration: 03_add_targeted_names_to_campaigns...');
    await db.query(query);
    console.log('Migration successful: targeted_names column added.');
  } catch (err) {
    console.error('Error running migration 03:', err);
  } finally {
    if (db.pool) {
      db.pool.end();
    }
  }
};

up();
