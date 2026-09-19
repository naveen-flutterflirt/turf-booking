const db = require('../../config/db');

const addCommunityMatchTables = async () => {
  const query = `
    -- Join Requests Table
    CREATE TABLE IF NOT EXISTS join_requests (
      id SERIAL PRIMARY KEY,
      booking_id INT NOT NULL,
      user_id INT NOT NULL,
      status VARCHAR(50) DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat Rooms Table
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id SERIAL PRIMARY KEY,
      booking_id INT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat Participants Table
    CREATE TABLE IF NOT EXISTS chat_participants (
      room_id INT NOT NULL,
      user_id INT NOT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_id, user_id)
    );

    -- Chat Messages Table
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      room_id INT NOT NULL,
      sender_id INT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    console.log('Running migration: Adding Community Match Tables...');
    await db.query(query);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.pool.end();
  }
};

addCommunityMatchTables();
