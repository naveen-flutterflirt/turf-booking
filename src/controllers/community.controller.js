const db = require('../config/db');
const {
	getIO
} = require('../config/socket');
const {
	notificationQueue
} = require('../utils/notificationQueue');
// 1. Create Broadcast
const createBroadcast = async (req, res) => {
	try {
		const hostId = req.user.id;
		const {
			message,
			sport_id,
			play_date,
			start_time,
			end_time,
			players_needed,
			skill_level
		} = req.body;
		if (!message) {
			return res.status(400).json({
				success: false,
				message: 'Message is required'
			});
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
		res.status(201).json({
			success: true,
			message: 'Broadcast created successfully',
			data: result.rows[0]
		});
	} catch (error) {
		console.error('Error in createBroadcast:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
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
		res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error('Error in getFeed:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};

// 2.5 Fetch My Broadcasts
const getMyBroadcasts = async (req, res) => {
	try {
		const hostId = req.user.id;
		const query = `
      SELECT 
        cb.*, 
        s.name as sport_name,
        (SELECT COUNT(id) FROM join_requests WHERE broadcast_id = cb.id AND status = 'PENDING') as pending_requests
      FROM community_broadcasts cb
      LEFT JOIN sports s ON cb.sport_id = s.id
      WHERE cb.host_id = $1
      ORDER BY cb.created_at DESC;
    `;
		const result = await db.query(query, [hostId]);
		res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error('Error in getMyBroadcasts:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};
// 3. Request to Join
const requestToJoin = async (req, res) => {
	try {
		const userId = req.user.id;
		const {
			broadcastId
		} = req.body;
		if (!broadcastId) {
			return res.status(400).json({
				success: false,
				message: 'broadcastId is required'
			});
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
        
        // Fetch requester's name
        const userQuery = await db.query(`SELECT name FROM users WHERE id = $1`, [userId]);
        const requesterName = userQuery.rows[0]?.name || 'Someone';

		if (broadcastResult.rows.length > 0) {
			const {
				host_id,
				fcm_token
			} = broadcastResult.rows[0];
            const requestId = result.rows[0].id;

			// Real-time socket notification
			getIO().to(`user_${host_id}`).emit('new_join_request', {
				broadcastId,
				userId,
                requesterName,
                requestId
			});

            // Save to Notification DB API
            await db.query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`, 
                [host_id, 'New Join Request!', `${requesterName} requested to join your community.`, 'new_join_request']);

			// Offline push notification fallback via BullMQ
			if (fcm_token) {
				await notificationQueue.add('join-request-notification', {
					tokens: [fcm_token],
					payload: {
						title: 'New Join Request!',
						body: `${requesterName} requested to join your community.`,
						data: {
							type: 'new_join_request',
							broadcastId: String(broadcastId),
                            requestId: String(requestId)
						}
					}
				});
			}
		}
		res.status(201).json({
			success: true,
			message: 'Request sent successfully',
			data: result.rows[0]
		});
	} catch (error) {
		console.error('Error in requestToJoin:', error);
		if (error.code === '23505') { // Postgres unique constraint violation
			return res.status(409).json({
				success: false,
				message: 'You have already requested to join this broadcast'
			});
		}
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
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
		res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error('Error in getRequests:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};
// 5. Accept Request
const acceptRequest = async (req, res) => {
	try {
		const hostId = req.user.id;
		const {
			requestId
		} = req.body;
		if (!requestId) {
			return res.status(400).json({
				success: false,
				message: 'requestId is required'
			});
		}
		// 1. Verify host owns the broadcast and update status
		const updateReq = await db.query(`UPDATE join_requests jr 
       SET status = 'ACCEPTED' 
       FROM community_broadcasts cb
       WHERE jr.id = $1 AND jr.broadcast_id = cb.id AND cb.host_id = $2
       RETURNING jr.broadcast_id, jr.user_id`,
			[requestId, hostId]);
		if (updateReq.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Request not found or unauthorized'
			});
		}
		const {
			broadcast_id,
			user_id
		} = updateReq.rows[0];
		// 2. Ensure Chat Room exists for this broadcast
		let roomResult = await db.query(`SELECT id FROM chat_rooms WHERE broadcast_id = $1`, [broadcast_id]);
		let roomId;
		if (roomResult.rows.length === 0) {
			const createRoom = await db.query(`INSERT INTO chat_rooms (broadcast_id, is_active) VALUES ($1, true) RETURNING id`,
				[broadcast_id]);
			roomId = createRoom.rows[0].id;
			// Also add the Host to the chat participants since they just created it
			await db.query(`INSERT INTO chat_participants (room_id, user_id) VALUES ($1, $2)`, [roomId, hostId]);
		} else {
			roomId = roomResult.rows[0].id;
		}
		// 3. Add user to Chat Participants
		await db.query(`INSERT INTO chat_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			[roomId, user_id]);
		// 4. Notify the accepted user via WebSockets
		const io = getIO();
		io.to(`user_${user_id}`).emit('request_accepted', {
			broadcastId: broadcast_id,
			roomId
		});
		// 5. Trigger BullMQ FCM notification and Save to DB
		const userResult = await db.query(`SELECT fcm_token FROM users WHERE id = $1`, [user_id]);
		
		await db.query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`, 
			[user_id, 'Request Accepted!', 'Your request to join the match was accepted.', 'request_accepted']);

		if (userResult.rows.length > 0 && userResult.rows[0].fcm_token) {
			await notificationQueue.add('request-accepted-notification', {
				tokens: [userResult.rows[0].fcm_token],
				payload: {
					title: 'Request Accepted!',
					body: 'Your request to join the match was accepted.',
					data: {
						type: 'request_accepted',
						broadcastId: String(broadcast_id),
						roomId: String(roomId)
					}
				}
			});
		}
		res.status(200).json({
			success: true,
			message: 'Request accepted, user added to chat',
			roomId
		});
	} catch (error) {
		console.error('Error in acceptRequest:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};
// 6. Fetch Chat History
const getChatHistory = async (req, res) => {
	try {
		const {
			roomId
		} = req.params;
		const userId = req.user.id;
		// Verify user is part of the room
		const participantCheck = await db.query(`SELECT 1 FROM chat_participants WHERE room_id = $1 AND user_id = $2`,
			[roomId, userId]);
		if (participantCheck.rows.length === 0) {
			return res.status(403).json({
				success: false,
				message: 'Access denied to this chat room'
			});
		}
		const query = `
      SELECT cm.*, u.name as sender_name 
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.room_id = $1
      ORDER BY cm.created_at ASC
    `;
		const result = await db.query(query, [roomId]);
		res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error('Error in getChatHistory:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};
// 7. Get All Chats for User
const getMyChats = async (req, res) => {
	try {
		const userId = req.user.id;
		// Fetch all rooms the user is a participant of, along with broadcast details
		const query = `
      SELECT 
        cr.id as room_id,
        cr.name as room_name,
        cr.is_active,
        cb.message as broadcast_message,
        cb.sport_id,
        s.name as sport_name,
        u.name as host_name
      FROM chat_rooms cr
      JOIN chat_participants cp ON cr.id = cp.room_id
      JOIN community_broadcasts cb ON cr.broadcast_id = cb.id
      JOIN users u ON cb.host_id = u.id
      LEFT JOIN sports s ON cb.sport_id = s.id
      WHERE cp.user_id = $1
      ORDER BY cr.created_at DESC
    `;
		const result = await db.query(query, [userId]);
		res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error('Error in getMyChats:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};
// 8. Get Room ID by Broadcast ID
const getRoomByBroadcastId = async (req, res) => {
	try {
		const {
			broadcastId
		} = req.params;
		const userId = req.user.id;
		// Check if a room exists for this broadcast
		const query = `
      SELECT cr.id as room_id
      FROM chat_rooms cr
      JOIN chat_participants cp ON cr.id = cp.room_id
      WHERE cr.broadcast_id = $1 AND cp.user_id = $2
    `;
		const result = await db.query(query, [broadcastId, userId]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Room not found or you are not a participant'
			});
		}
		res.status(200).json({
			success: true,
			roomId: result.rows[0].room_id
		});
	} catch (error) {
		console.error('Error in getRoomByBroadcastId:', error);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};

// 9. Get Chat Room Members
const getChatMembers = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id; // user making the request

    // Verify user is part of the room
    const participantCheck = await db.query(
      `SELECT 1 FROM chat_participants WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied to this chat room' });
    }

    const query = `
      SELECT cp.user_id, u.name, cp.joined_at
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.room_id = $1
      ORDER BY cp.joined_at ASC
    `;
    const result = await db.query(query, [roomId]);

    res.status(200).json({ 
      success: true, 
      count: result.rows.length, 
      data: result.rows 
    });
  } catch (error) {
    console.error('Error in getChatMembers:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 10. Update Chat Room Name (Host Only)
const updateChatRoomName = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name } = req.body;
    const hostId = req.user.id;

    if (!name) {
      return res.status(400).json({ success: false, message: 'New name is required' });
    }

    // Verify the requester is the host of the broadcast
    const hostCheck = await db.query(
      `SELECT cb.id FROM chat_rooms cr
       JOIN community_broadcasts cb ON cr.broadcast_id = cb.id
       WHERE cr.id = $1 AND cb.host_id = $2`,
      [roomId, hostId]
    );

    if (hostCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Only the host can update the group name' });
    }

    const updateQuery = `
      UPDATE chat_rooms 
      SET name = $1 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await db.query(updateQuery, [name, roomId]);

    // Notification Logic
    // Notify all participants (except host who changed it)
    const participantsQuery = `
      SELECT u.id, u.fcm_token 
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.room_id = $1 AND cp.user_id != $2
    `;
    const participantResult = await db.query(participantsQuery, [roomId, hostId]);
    
    const io = getIO();
    const tokens = [];
    
    participantResult.rows.forEach(user => {
      // Real-time socket notification
      io.to(`user_${user.id}`).emit('group_name_updated', {
        roomId,
        newName: name
      });
      if (user.fcm_token) tokens.push(user.fcm_token);
      
      // Save to Notification DB API
      db.query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`, 
        [user.id, 'Group Name Changed', `A community group name was changed to "${name}".`, 'group_name_updated']).catch(err => console.error(err));
    });

    if (tokens.length > 0) {
      await notificationQueue.add('group-name-updated', {
        tokens: tokens,
        payload: {
          title: 'Group Name Changed',
          body: `A community group name was changed to "${name}".`,
          data: { type: 'group_name_updated', roomId: String(roomId) }
        }
      });
    }

    res.status(200).json({ success: true, message: 'Group name updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error in updateChatRoomName:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 11. Remove Chat Member (Host Only)
const removeChatMember = async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    const hostId = req.user.id;

    // A host cannot remove themselves using this API
    if (userId === hostId) {
      return res.status(400).json({ success: false, message: 'Host cannot remove themselves from the group' });
    }

    // Verify the requester is the host of the broadcast
    const hostCheck = await db.query(
      `SELECT cb.id FROM chat_rooms cr
       JOIN community_broadcasts cb ON cr.broadcast_id = cb.id
       WHERE cr.id = $1 AND cb.host_id = $2`,
      [roomId, hostId]
    );

    if (hostCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Only the host can remove members' });
    }

    // Remove the user
    const deleteQuery = `
      DELETE FROM chat_participants 
      WHERE room_id = $1 AND user_id = $2 
      RETURNING *
    `;
    const result = await db.query(deleteQuery, [roomId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User is not a member of this chat room' });
    }

    // Also update the join_requests status so they can potentially request again, or leave it as ACCEPTED to block?
    // Let's set it to 'REMOVED' or just delete it so they can request again if needed.
    const broadcastId = hostCheck.rows[0].id;
    await db.query(
      `DELETE FROM join_requests WHERE broadcast_id = $1 AND user_id = $2`,
      [broadcastId, userId]
    );

    // Notify the removed user via socket
    const io = getIO();
    io.to(`user_${userId}`).emit('removed_from_chat', { roomId, broadcastId });

    // Notify via FCM push notification and Save to DB
    await db.query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`, 
      [userId, 'Removed from Community', 'You have been removed from the community group by the host.', 'removed_from_chat']);

    const userResult = await db.query(`SELECT fcm_token FROM users WHERE id = $1`, [userId]);
    if (userResult.rows.length > 0 && userResult.rows[0].fcm_token) {
      await notificationQueue.add('member-removed-notification', {
        tokens: [userResult.rows[0].fcm_token],
        payload: {
          title: 'Removed from Community',
          body: 'You have been removed from the community group by the host.',
          data: { type: 'removed_from_chat', broadcastId: String(broadcastId) }
        }
      });
    }

    res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error in removeChatMember:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 12. Delete Broadcast (Host Only)
const deleteBroadcast = async (req, res) => {
  try {
    const { broadcastId } = req.params;
    const hostId = req.user.id;

    // Fetch participants before deleting to notify them
    const participantsQuery = `
      SELECT u.id, u.fcm_token 
      FROM chat_rooms cr
      JOIN chat_participants cp ON cr.id = cp.room_id
      JOIN users u ON cp.user_id = u.id
      WHERE cr.broadcast_id = $1 AND cp.user_id != $2
    `;
    const participantResult = await db.query(participantsQuery, [broadcastId, hostId]);

    // Delete the broadcast if the user is the host
    const deleteQuery = `
      DELETE FROM community_broadcasts 
      WHERE id = $1 AND host_id = $2 
      RETURNING id
    `;
    const result = await db.query(deleteQuery, [broadcastId, hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Broadcast not found or you are not authorized to delete it' });
    }

    // Notify users
    const io = getIO();
    const tokens = [];

    participantResult.rows.forEach(user => {
      io.to(`user_${user.id}`).emit('community_deleted', { broadcastId });
      if (user.fcm_token) tokens.push(user.fcm_token);

      // Save to Notification DB API
      db.query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`, 
        [user.id, 'Community Deleted', 'A community you joined has been deleted by the host.', 'community_deleted']).catch(err => console.error(err));
    });

    if (tokens.length > 0) {
      await notificationQueue.add('community-deleted-notification', {
        tokens: tokens,
        payload: {
          title: 'Community Deleted',
          body: 'A community you joined has been deleted by the host.',
          data: { type: 'community_deleted', broadcastId: String(broadcastId) }
        }
      });
    }

    // Since we have ON DELETE CASCADE on join_requests and chat_rooms, 
    // those related records will be automatically deleted by the database.

    res.status(200).json({ success: true, message: 'Broadcast deleted successfully' });
  } catch (error) {
    console.error('Error in deleteBroadcast:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  createBroadcast,
  getFeed,
  getMyBroadcasts,
  requestToJoin,
  getRequests,
  acceptRequest,
  getChatHistory,
  getMyChats,
  getRoomByBroadcastId,
  getChatMembers,
  updateChatRoomName,
  removeChatMember,
  deleteBroadcast
};
