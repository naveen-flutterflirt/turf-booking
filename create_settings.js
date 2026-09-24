const db = require('./src/config/db');

const run = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        latest_android_version VARCHAR(50) NOT NULL,
        latest_ios_version VARCHAR(50) NOT NULL,
        force_update BOOLEAN DEFAULT FALSE,
        update_message TEXT,
        play_store_url TEXT,
        app_store_url TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const res = await db.query('SELECT COUNT(*) FROM app_settings');
    if (parseInt(res.rows[0].count) === 0) {
      await db.query(`
        INSERT INTO app_settings (latest_android_version, latest_ios_version, force_update, update_message, play_store_url, app_store_url)
        VALUES ('1.0.0', '1.0.0', false, 'A new version is available! Please update your app.', 'https://play.google.com/store/apps/details?id=com.your.app', 'https://apps.apple.com/us/app/your-app/id123456789')
      `);
      console.log('Inserted default settings');
    }
    console.log('App settings table is ready');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
};
run();
