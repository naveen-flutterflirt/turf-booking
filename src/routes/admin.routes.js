const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

// Protect all admin routes
router.use(authenticateUser);
router.use(authorizeRole(['ADMIN']));

router.get('/turfs', adminController.getAllTurfs);
router.patch('/turfs/:id/approve', adminController.approveTurf);
router.patch('/turfs/:id/reject', adminController.rejectTurf);
router.delete('/turfs/:id', adminController.deleteTurf);

router.post('/turfs/notify-nearby', adminController.notifyNearbyUsers);
router.get('/turfs/notify-nearby', adminController.getNotificationCampaigns);
router.delete('/turfs/notify-nearby/:id', adminController.deleteNotificationCampaign);

router.get('/owners', adminController.getAllOwners);
router.delete('/owners/:id', adminController.deleteOwner);

router.get('/sports-stats', adminController.getSportsStats);

router.get('/customers', adminController.getAllCustomers);
router.delete('/customers/:id', adminController.deleteCustomer);

router.get('/bookings', adminController.getAllBookings);
router.get('/payments', adminController.getAllPayments);

router.get('/queries', adminController.getAllQueries);
router.patch('/queries/:id/reply', adminController.replyToQuery);

router.get('/feedbacks', adminController.getAllFeedbacks);
router.delete('/feedbacks/:id', adminController.deleteFeedback);

module.exports = router;
