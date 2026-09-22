const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');
const razorpayxWebhookController = require('../controllers/razorpayxWebhook.controller');

// This route is NOT authenticated by JWT, it's public for Razorpay to hit
router.post('/razorpay', webhookController.razorpayWebhook);
router.post('/razorpayx', razorpayxWebhookController.razorpayxWebhook);

module.exports = router;
