const express = require('express');
const router = express.Router();
const communityController = require('../controllers/community.controller');
// We assume there's an authMiddleware we can use
const { authenticateUser } = require('../middlewares/auth.middleware');

// POST /community/join
router.post('/join', authenticateUser, communityController.requestToJoin);

// POST /community/accept
router.post('/accept', authenticateUser, communityController.acceptRequest);

module.exports = router;
