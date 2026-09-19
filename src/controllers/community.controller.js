const db = require('../config/db');
const { getIO } = require('../config/socket');
const { notificationQueue } = require('../utils/notificationQueue');

const requestToJoin = async (req, res) => {
  try {
    // Expected to be called by authenticated users
    const userId = req.user.id; 
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required' });
    }

    // Insert join request
    const insertQuery = `
      INSERT INTO join_requests (booking_id, user_id, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [bookingId, userId]);

    // Fetch host and their FCM token
    const bookingQuery = `
      SELECT b.user_id as host_id, u.fcm_token 
      FROM bookings b 
      JOIN users u ON b.user_id = u.id 
      WHERE b.id = $1
    `;
    const bookingResult = await db.query(bookingQuery, [bookingId]);
    
    if (bookingResult.rows.length > 0) {
      const { host_id, fcm_token } = bookingResult.rows[0];
      
      // Real-time socket notification
      getIO().to(`user_${host_id}`).emit('new_join_request', { bookingId, userId });

      // Offline push notification fallback via BullMQ
      if (fcm_token) {
        await notificationQueue.add('join-request-notification', {
          tokens: [fcm_token],
          payload: {
            title: 'New Join Request!',
            body: 'Someone requested to join your match.',
            data: { type: 'join_request', bookingId: String(bookingId) }
          }
        });
      }
    }

    res.status(201).json({ success: true, message: 'Request sent successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error in requestToJoin:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    
    // Validate request
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required' });
    }

    // 1. Update status to ACCEPTED
    const updateReq = await db.query(
      `UPDATE join_requests SET status = 'ACCEPTED' WHERE id = $1 RETURNING *`, 
      [requestId]
    );

    if (updateReq.rows.length === 0) {
       return res.status(404).json({ success: false, message: 'Join request not found' });
    }

    const { booking_id, user_id } = updateReq.rows[0];

    // 2. Ensure Chat Room exists for this booking
    let roomResult = await db.query(`SELECT id FROM chat_rooms WHERE booking_id = $1`, [booking_id]);
    let roomId;

    if (roomResult.rows.length === 0) {
       const createRoom = await db.query(
         `INSERT INTO chat_rooms (booking_id, is_active) VALUES ($1, true) RETURNING id`, 
         [booking_id]
       );
       roomId = createRoom.rows[0].id;
    } else {
       roomId = roomResult.rows[0].id;
    }

    // 3. Add user to Chat Participants
    await db.query(
      `INSERT INTO chat_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roomId, user_id]
    );

    // 4. Notify the accepted user via WebSockets
    const io = getIO();
    io.to(`user_${user_id}`).emit('request_accepted', { bookingId: booking_id, roomId });

    // 5. Trigger BullMQ FCM notification in case user is offline
    const userResult = await db.query(`SELECT fcm_token FROM users WHERE id = $1`, [user_id]);
    if (userResult.rows.length > 0 && userResult.rows[0].fcm_token) {
      await notificationQueue.add('request-accepted-notification', {
        tokens: [userResult.rows[0].fcm_token],
        payload: {
          title: 'Request Accepted!',
          body: 'Your request to join the match was accepted.',
          data: { type: 'request_accepted', bookingId: String(booking_id), roomId: String(roomId) }
        }
      });
    }

    res.status(200).json({ success: true, message: 'Request accepted, user added to chat', roomId });
  } catch (error) {
    console.error('Error in acceptRequest:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  requestToJoin,
  acceptRequest
};
