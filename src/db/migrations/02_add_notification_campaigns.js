const db = require('../../config/db');

const up = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS notification_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        turf_id UUID REFERENCES turfs(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        radius_km DECIMAL(5,2) NOT NULL,
        users_targeted INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    console.log('Running migration: 02_add_notification_campaigns...');
    await db.query(query);
    console.log('Migration successful: notification_campaigns table created.');
  } catch (err) {
    console.error('Error running migration 02:', err);
  } finally {
    if (db.pool) {
      db.pool.end();
    }
  }
};

up();
