const db = require('../../config/db');

const addDeviceTypeColumn = async () => {
  const query = `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS device_type VARCHAR(50);
  `;

  try {
    console.log('Running migration: Adding device_type column to users...');
    await db.query(query);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.pool.end();
  }
};

addDeviceTypeColumn();
