const db = require('./src/config/db');

const run = async () => {
  try {
    await db.query(`
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS normal_update BOOLEAN DEFAULT FALSE;
    `);
    console.log('Added normal_update column to app_settings');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
};
run();
