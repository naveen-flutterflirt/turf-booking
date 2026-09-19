const db = require('../config/db');
const { notificationQueue } = require('../utils/notificationQueue');

const setupChatSockets = (io, socket) => {
  // Join a specific chat room
  socket.on('join_chat_room', async (data) => {
    const { roomId, userId } = data;
    // Basic validation
    if (!roomId) return;
    
    // In production, we should verify that `userId` is actually a participant of `roomId`
    
    // Join the socket.io room
    socket.join(`room_${roomId}`);
    console.log(`User ${userId} joined room_${roomId}`);
  });

  // Handle incoming messages
  socket.on('send_message', async (data) => {
    const { roomId, senderId, message } = data;
    
    if (!roomId || !senderId || !message) return;

    try {
      // 1. Save message to PostgreSQL database
      const insertQuery = `
        INSERT INTO chat_messages (room_id, sender_id, message)
        VALUES ($1, $2, $3)
        RETURNING id, room_id, sender_id, message, created_at;
      `;
      const result = await db.query(insertQuery, [roomId, senderId, message]);
      const savedMessage = result.rows[0];

      // 2. Broadcast message to everyone in the room (including sender if they need it for confirmation)
      io.to(`room_${roomId}`).emit('receive_message', savedMessage);
      
      // 3. BullMQ fallback for offline FCM notifications
      // Fetch all participants of the room (excluding the sender) who have an FCM token
      const participantsQuery = `
        SELECT u.fcm_token 
        FROM chat_participants cp
        JOIN users u ON cp.user_id = u.id
        WHERE cp.room_id = $1 AND cp.user_id != $2 AND u.fcm_token IS NOT NULL
      `;
      const participantResult = await db.query(participantsQuery, [roomId, senderId]);
      
      const tokens = participantResult.rows.map(row => row.fcm_token).filter(t => t);
      
      if (tokens.length > 0) {
        await notificationQueue.add('new-chat-message-notification', {
          tokens: tokens,
          payload: {
            title: 'New Message',
            body: message.length > 50 ? message.substring(0, 50) + '...' : message,
            data: { type: 'chat_message', roomId: String(roomId) }
          }
        });
      }
      
    } catch (error) {
      console.error('Error saving/sending chat message:', error);
      // Notify sender that message failed
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // Optional: User connects to their personal notification channel
  socket.on('register_user', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`User registered for personal notifications: user_${userId}`);
    }
  });
};

module.exports = {
  setupChatSockets
};
