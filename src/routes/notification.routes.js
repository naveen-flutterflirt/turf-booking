const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');

// All notification routes require authentication
router.use(authenticateUser);

router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/clear-all', notificationController.clearAllNotifications);
router.delete('/:id', notificationController.deleteNotification);
router.patch('/fcm-token', notificationController.updateFcmToken);

module.exports = router;
