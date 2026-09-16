const db = require('../../config/db');

const addPostgisAndColumns = async () => {
  const query = `
    -- Enable PostGIS extension
    CREATE EXTENSION IF NOT EXISTS postgis;

    -- Add new columns if they do not exist
    ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326);

    -- Create spatial index for fast distance queries
    CREATE INDEX IF NOT EXISTS users_location_idx ON users USING GIST (location);
  `;

  try {
    console.log('Running migration: Adding PostGIS and User columns...');
    await db.query(query);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.pool.end();
  }
};

addPostgisAndColumns();
