const db = require('../config/db');
const { getIO } = require('../config/socket');
const { notificationQueue } = require('../utils/notificationQueue');

// 1. Create Broadcast
const createBroadcast = async (req, res) => {
  try {
    const hostId = req.user.id;
    const { message, sport_id, play_date, start_time, end_time, players_needed } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const insertQuery = `
      INSERT INTO community_broadcasts 
        (host_id, message, sport_id, play_date, start_time, end_time, players_needed)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      hostId, 
      message, 
      sport_id || null, 
      play_date || null, 
      start_time || null, 
      end_time || null, 
      players_needed || null
    ];

    const result = await db.query(insertQuery, values);
    res.status(201).json({ success: true, message: 'Broadcast created successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error in createBroadcast:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 2. Fetch Feed
const getFeed = async (req, res) => {
  try {
    const query = `
      SELECT 
        cb.*, 
        u.name as host_name, 
        s.name as sport_name,
        (SELECT COUNT(id) FROM join_requests WHERE broadcast_id = cb.id AND status = 'PENDING') as pending_requests
      FROM community_broadcasts cb
      JOIN users u ON cb.host_id = u.id
      LEFT JOIN sports s ON cb.sport_id = s.id
      WHERE cb.status = 'ACTIVE'
      ORDER BY cb.created_at DESC;
    `;
    const result = await db.query(query);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error in getFeed:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 3. Request to Join
const requestToJoin = async (req, res) => {
  try {
    const userId = req.user.id; 
    const { broadcastId } = req.body;

    if (!broadcastId) {
      return res.status(400).json({ success: false, message: 'broadcastId is required' });
    }

    // Insert join request (UNIQUE constraint prevents duplicates)
    const insertQuery = `
      INSERT INTO join_requests (broadcast_id, user_id, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [broadcastId, userId]);

    // Fetch host and their FCM token
    const broadcastQuery = `
      SELECT cb.host_id, u.fcm_token 
      FROM community_broadcasts cb 
      JOIN users u ON cb.host_id = u.id 
      WHERE cb.id = $1
    `;
    const broadcastResult = await db.query(broadcastQuery, [broadcastId]);
    
    if (broadcastResult.rows.length > 0) {
      const { host_id, fcm_token } = broadcastResult.rows[0];
      
      // Real-time socket notification
      getIO().to(`user_${host_id}`).emit('new_join_request', { broadcastId, userId });

      // Offline push notification fallback via BullMQ
      if (fcm_token) {
        await notificationQueue.add('join-request-notification', {
          tokens: [fcm_token],
          payload: {
            title: 'New Join Request!',
            body: 'Someone requested to join your broadcast.',
            data: { type: 'join_request', broadcastId: String(broadcastId) }
          }
        });
      }
    }

    res.status(201).json({ success: true, message: 'Request sent successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error in requestToJoin:', error);
    if (error.code === '23505') { // Postgres unique constraint violation
      return res.status(409).json({ success: false, message: 'You have already requested to join this broadcast' });
    }
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 4. Fetch Requests
const getRequests = async (req, res) => {
  try {
    const hostId = req.user.id;
    
    const query = `
      SELECT 
        jr.*, 
        u.name as requester_name,
        cb.message as broadcast_message
      FROM join_requests jr
      JOIN users u ON jr.user_id = u.id
      JOIN community_broadcasts cb ON jr.broadcast_id = cb.id
      WHERE cb.host_id = $1 AND jr.status = 'PENDING'
      ORDER BY jr.created_at DESC;
    `;
    const result = await db.query(query, [hostId]);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error in getRequests:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 5. Accept Request
const acceptRequest = async (req, res) => {
  try {
    const hostId = req.user.id;
    const { requestId } = req.body;
    
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required' });
    }

    // 1. Verify host owns the broadcast and update status
    const updateReq = await db.query(
      `UPDATE join_requests jr 
       SET status = 'ACCEPTED' 
       FROM community_broadcasts cb
       WHERE jr.id = $1 AND jr.broadcast_id = cb.id AND cb.host_id = $2
       RETURNING jr.broadcast_id, jr.user_id`, 
      [requestId, hostId]
    );

    if (updateReq.rows.length === 0) {
       return res.status(404).json({ success: false, message: 'Request not found or unauthorized' });
    }

    const { broadcast_id, user_id } = updateReq.rows[0];

    // 2. Ensure Chat Room exists for this broadcast
    let roomResult = await db.query(`SELECT id FROM chat_rooms WHERE broadcast_id = $1`, [broadcast_id]);
    let roomId;

    if (roomResult.rows.length === 0) {
       const createRoom = await db.query(
         `INSERT INTO chat_rooms (broadcast_id, is_active) VALUES ($1, true) RETURNING id`, 
         [broadcast_id]
       );
       roomId = createRoom.rows[0].id;
       // Also add the Host to the chat participants since they just created it
       await db.query(`INSERT INTO chat_participants (room_id, user_id) VALUES ($1, $2)`, [roomId, hostId]);
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
    io.to(`user_${user_id}`).emit('request_accepted', { broadcastId: broadcast_id, roomId });

    // 5. Trigger BullMQ FCM notification
    const userResult = await db.query(`SELECT fcm_token FROM users WHERE id = $1`, [user_id]);
    if (userResult.rows.length > 0 && userResult.rows[0].fcm_token) {
      await notificationQueue.add('request-accepted-notification', {
        tokens: [userResult.rows[0].fcm_token],
        payload: {
          title: 'Request Accepted!',
          body: 'Your request to join the match was accepted.',
          data: { type: 'request_accepted', broadcastId: String(broadcast_id), roomId: String(roomId) }
        }
      });
    }

    res.status(200).json({ success: true, message: 'Request accepted, user added to chat', roomId });
  } catch (error) {
    console.error('Error in acceptRequest:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 6. Fetch Chat History
const getChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // Verify user is part of the room
    const participantCheck = await db.query(
      `SELECT 1 FROM chat_participants WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied to this chat room' });
    }

    const query = `
      SELECT cm.*, u.name as sender_name 
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.room_id = $1
      ORDER BY cm.created_at ASC
    `;
    const result = await db.query(query, [roomId]);

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error in getChatHistory:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  createBroadcast,
  getFeed,
  requestToJoin,
  getRequests,
  acceptRequest,
  getChatHistory
};
