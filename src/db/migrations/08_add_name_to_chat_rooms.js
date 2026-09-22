const db = require('../../config/db');

const addNameToChatRooms = async () => {
  const query = `
    ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT 'Broadcast Chat';
  `;

  try {
    console.log('Running migration: Adding name to chat_rooms...');
    await db.query(query);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.pool.end();
  }
};

addNameToChatRooms();
