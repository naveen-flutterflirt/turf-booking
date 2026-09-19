const express = require('express');
const router = express.Router();
const communityController = require('../controllers/community.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');

// GET /community/feed - Fetch all active broadcasts
router.get('/feed', authenticateUser, communityController.getFeed);

// GET /community/requests - Fetch pending requests for host
router.get('/requests', authenticateUser, communityController.getRequests);

// GET /community/chat/:roomId - Fetch chat history
router.get('/chat/:roomId', authenticateUser, communityController.getChatHistory);

// POST /community/broadcasts - Create a new broadcast
router.post('/broadcasts', authenticateUser, communityController.createBroadcast);

// POST /community/join - Request to join a broadcast
router.post('/join', authenticateUser, communityController.requestToJoin);

// POST /community/accept - Host accepts a join request
router.post('/accept', authenticateUser, communityController.acceptRequest);

module.exports = router;
