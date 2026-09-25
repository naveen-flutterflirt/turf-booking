const communityRepo = require('../repositories/community.repository');
const {
	getIO
} = require('../config/socket');
const {
	notificationQueue
} = require('../utils/notificationQueue');
const createBroadcast = async (req, res) => {
	try {
		const {
			message,
			sport_id,
			play_date,
			start_time,
			end_time,
			players_needed
		} = req.body;
		if (!message) return res.status(400).json({
			success: false,
			message: 'Message is required'
		});
		const result = await communityRepo.createBroadcast(req.user.id, {
			message,
			sport_id,
			play_date,
			start_time,
			end_time,
			players_needed
		});
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
const getFeed = async (req, res) => {
	try {
		const result = await communityRepo.getFeed();
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
const getMyBroadcasts = async (req, res) => {
	try {
		const result = await communityRepo.getMyBroadcasts(req.user.id);
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
const requestToJoin = async (req, res) => {
	try {
		const {
			broadcastId
		} = req.body;
		if (!broadcastId) return res.status(400).json({
			success: false,
			message: 'broadcastId is required'
		});
		const result = await communityRepo.insertJoinRequest(broadcastId, req.user.id);
		const broadcastResult = await communityRepo.getBroadcastHost(broadcastId);
		if (broadcastResult.rows.length > 0) {
			const {
				host_id,
				fcm_token
			} = broadcastResult.rows[0];
			getIO().to(`user_${host_id}`).emit('new_join_request', {
				broadcastId,
				userId: req.user.id
			});
			if (fcm_token) {
				await notificationQueue.add('join-request-notification', {
					tokens: [fcm_token],
					payload: {
						title: 'New Join Request!',
						body: 'Someone requested to join your broadcast.',
						data: {
							type: 'join_request',
							broadcastId: String(broadcastId)
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
		if (error.code === '23505') return res.status(409).json({
			success: false,
			message: 'You have already requested to join this broadcast'
		});
		res.status(500).json({
			success: false,
			message: 'Internal Server Error'
		});
	}
};
const getRequests = async (req, res) => {
	try {
		const result = await communityRepo.getPendingRequests(req.user.id);
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
const acceptRequest = async (req, res) => {
	try {
		const {
			requestId
		} = req.body;
		if (!requestId) return res.status(400).json({
			success: false,
			message: 'requestId is required'
		});
		const updateReq = await communityRepo.acceptJoinRequest(requestId, req.user.id);
		if (updateReq.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Request not found or unauthorized'
		});
		const {
			broadcast_id,
			user_id
		} = updateReq.rows[0];
		let roomResult = await communityRepo.findChatRoomByBroadcast(broadcast_id);
		let roomId;
		if (roomResult.rows.length === 0) {
			const createRoom = await communityRepo.createChatRoom(broadcast_id);
			roomId = createRoom.rows[0].id;
			await communityRepo.addChatParticipant(roomId, req.user.id);
		} else {
			roomId = roomResult.rows[0].id;
		}
		await communityRepo.addChatParticipant(roomId, user_id);
		const io = getIO();
		io.to(`user_${user_id}`).emit('request_accepted', {
			broadcastId: broadcast_id,
			roomId
		});
		const userResult = await require('../repositories/user.repository').findUserWithToken(user_id);
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
const getChatHistory = async (req, res) => {
	try {
		const {
			roomId
		} = req.params;
		const participantCheck = await communityRepo.checkParticipant(roomId, req.user.id);
		if (participantCheck.rows.length === 0) return res.status(403).json({
			success: false,
			message: 'Access denied to this chat room'
		});
		const result = await communityRepo.getChatMessages(roomId);
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
const getMyChats = async (req, res) => {
	try {
		const result = await communityRepo.getMyChats(req.user.id);
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
const getRoomByBroadcastId = async (req, res) => {
	try {
		const result = await communityRepo.getRoomByBroadcastAndUser(req.params.broadcastId, req.user.id);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Room not found or you are not a participant'
		});
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
module.exports = {
	createBroadcast,
	getFeed,
	getMyBroadcasts,
	requestToJoin,
	getRequests,
	acceptRequest,
	getChatHistory,
	getMyChats,
	getRoomByBroadcastId
};
