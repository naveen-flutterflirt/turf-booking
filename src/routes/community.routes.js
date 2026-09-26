const express = require('express');
const router = express.Router();
const communityController = require('../controllers/community.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');

// GET /community/feed - Fetch all active broadcasts
router.get('/feed', authenticateUser, communityController.getFeed);

// GET /community/my-broadcasts - Fetch broadcasts created by the current user
router.get('/my-broadcasts', authenticateUser, communityController.getMyBroadcasts);

// GET /community/requests - Fetch pending requests for host
router.get('/requests', authenticateUser, communityController.getRequests);

// GET /community/chat/:roomId - Fetch chat history
router.get('/chat/:roomId', authenticateUser, communityController.getChatHistory);

// GET /community/chats - Fetch all chat rooms for the user
router.get('/chats', authenticateUser, communityController.getMyChats);

// GET /community/broadcasts/:broadcastId/room - Get room ID for a specific broadcast
router.get('/broadcasts/:broadcastId/room', authenticateUser, communityController.getRoomByBroadcastId);

// POST /community/broadcasts - Create a new broadcast
router.post('/broadcasts', authenticateUser, communityController.createBroadcast);

// POST /community/join - Request to join a broadcast
router.post('/join', authenticateUser, communityController.requestToJoin);

// POST /community/accept - Host accepts a join request
router.post('/accept', authenticateUser, communityController.acceptRequest);

// GET /community/chat/:roomId/members - Get members of a chat room
router.get('/chat/:roomId/members', authenticateUser, communityController.getChatMembers);

// PATCH /community/chat/:roomId/name - Update chat room name (Host only)
router.patch('/chat/:roomId/name', authenticateUser, communityController.updateChatRoomName);

// DELETE /community/chat/:roomId/members/:userId - Remove a member (Host only)
router.delete('/chat/:roomId/members/:userId', authenticateUser, communityController.removeChatMember);

// DELETE /community/broadcasts/:broadcastId - Host deletes their broadcast
router.delete('/broadcasts/:broadcastId', authenticateUser, communityController.deleteBroadcast);

module.exports = router;
