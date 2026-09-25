const db = require('../config/db');

const createBroadcast = (hostId, { message, sport_id, play_date, start_time, end_time, players_needed }) =>
  db.query(
    `INSERT INTO community_broadcasts (host_id, message, sport_id, play_date, start_time, end_time, players_needed)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [hostId, message, sport_id || null, play_date || null, start_time || null, end_time || null, players_needed || null]
  );

const getFeed = () =>
  db.query(
    `SELECT cb.*, u.name as host_name, s.name as sport_name,
       (SELECT COUNT(id) FROM join_requests WHERE broadcast_id = cb.id AND status = 'PENDING') as pending_requests
     FROM community_broadcasts cb JOIN users u ON cb.host_id = u.id LEFT JOIN sports s ON cb.sport_id = s.id
     WHERE cb.status = 'ACTIVE' ORDER BY cb.created_at DESC`
  );

const getMyBroadcasts = (hostId) =>
  db.query(
    `SELECT cb.*, s.name as sport_name,
       (SELECT COUNT(id) FROM join_requests WHERE broadcast_id = cb.id AND status = 'PENDING') as pending_requests
     FROM community_broadcasts cb LEFT JOIN sports s ON cb.sport_id = s.id
     WHERE cb.host_id = $1 ORDER BY cb.created_at DESC`,
    [hostId]
  );

const insertJoinRequest = (broadcastId, userId) =>
  db.query(
    `INSERT INTO join_requests (broadcast_id, user_id, status) VALUES ($1, $2, 'PENDING') RETURNING *`,
    [broadcastId, userId]
  );

const getBroadcastHost = (broadcastId) =>
  db.query(
    `SELECT cb.host_id, u.fcm_token FROM community_broadcasts cb JOIN users u ON cb.host_id = u.id WHERE cb.id = $1`,
    [broadcastId]
  );

const getPendingRequests = (hostId) =>
  db.query(
    `SELECT jr.*, u.name as requester_name, cb.message as broadcast_message
     FROM join_requests jr JOIN users u ON jr.user_id = u.id JOIN community_broadcasts cb ON jr.broadcast_id = cb.id
     WHERE cb.host_id = $1 AND jr.status = 'PENDING' ORDER BY jr.created_at DESC`,
    [hostId]
  );

const acceptJoinRequest = (requestId, hostId) =>
  db.query(
    `UPDATE join_requests jr SET status = 'ACCEPTED' FROM community_broadcasts cb
     WHERE jr.id = $1 AND jr.broadcast_id = cb.id AND cb.host_id = $2 RETURNING jr.broadcast_id, jr.user_id`,
    [requestId, hostId]
  );

const findChatRoomByBroadcast = (broadcastId) =>
  db.query(`SELECT id FROM chat_rooms WHERE broadcast_id = $1`, [broadcastId]);

const createChatRoom = (broadcastId) =>
  db.query(`INSERT INTO chat_rooms (broadcast_id, is_active) VALUES ($1, true) RETURNING id`, [broadcastId]);

const addChatParticipant = (roomId, userId) =>
  db.query(`INSERT INTO chat_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [roomId, userId]);

const checkParticipant = (roomId, userId) =>
  db.query(`SELECT 1 FROM chat_participants WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);

const getChatMessages = (roomId) =>
  db.query(
    `SELECT cm.*, u.name as sender_name FROM chat_messages cm JOIN users u ON cm.sender_id = u.id
     WHERE cm.room_id = $1 ORDER BY cm.created_at ASC`,
    [roomId]
  );

const getMyChats = (userId) =>
  db.query(
    `SELECT cr.id as room_id, cr.is_active, cb.message as broadcast_message, cb.sport_id,
       s.name as sport_name, u.name as host_name
     FROM chat_rooms cr JOIN chat_participants cp ON cr.id = cp.room_id
     JOIN community_broadcasts cb ON cr.broadcast_id = cb.id JOIN users u ON cb.host_id = u.id
     LEFT JOIN sports s ON cb.sport_id = s.id WHERE cp.user_id = $1 ORDER BY cr.created_at DESC`,
    [userId]
  );

const getRoomByBroadcastAndUser = (broadcastId, userId) =>
  db.query(
    `SELECT cr.id as room_id FROM chat_rooms cr JOIN chat_participants cp ON cr.id = cp.room_id
     WHERE cr.broadcast_id = $1 AND cp.user_id = $2`,
    [broadcastId, userId]
  );

module.exports = {
  createBroadcast, getFeed, getMyBroadcasts, insertJoinRequest, getBroadcastHost,
  getPendingRequests, acceptJoinRequest, findChatRoomByBroadcast, createChatRoom,
  addChatParticipant, checkParticipant, getChatMessages, getMyChats, getRoomByBroadcastAndUser,
};
