const db = require('../../config/db');

const fixCommunityTables = async () => {
  const query = `
    -- Drop old tables if they exist (they were created with INT instead of UUID)
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_participants CASCADE;
    DROP TABLE IF EXISTS chat_rooms CASCADE;
    DROP TABLE IF EXISTS join_requests CASCADE;

    -- Create Community Broadcasts Table
    CREATE TABLE IF NOT EXISTS community_broadcasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
      play_date DATE,
      start_time TIME,
      end_time TIME,
      players_needed INT,
      status VARCHAR(50) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Recreate Join Requests Table
    CREATE TABLE IF NOT EXISTS join_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      broadcast_id UUID NOT NULL REFERENCES community_broadcasts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(broadcast_id, user_id)
    );

    -- Recreate Chat Rooms Table
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      broadcast_id UUID NOT NULL REFERENCES community_broadcasts(id) ON DELETE CASCADE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Recreate Chat Participants Table
    CREATE TABLE IF NOT EXISTS chat_participants (
      room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_id, user_id)
    );

    -- Recreate Chat Messages Table
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    console.log('Running migration: Fixing and Creating Community Tables...');
    await db.query(query);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.pool.end();
  }
};

fixCommunityTables();
