const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const {
	authenticateUser
} = require('../middlewares/auth.middleware');
const {
	authorizeRole
} = require('../middlewares/role.middleware');
// Protect all admin routes
router.use(authenticateUser);
router.use(authorizeRole(['ADMIN']));
// Turf routes (specific static routes before generic /:id routes)
router.get('/turfs', adminController.getAllTurfs);
router.get('/turfs/notify-nearby', adminController.getNotificationCampaigns);
router.post('/turfs/notify-nearby', adminController.notifyNearbyUsers);
router.delete('/turfs/notify-nearby/:id', adminController.deleteNotificationCampaign);
router.get('/turfs/:id/nearby-customers', adminController.getNearbyCustomers);
router.patch('/turfs/:id/approve', adminController.approveTurf);
router.patch('/turfs/:id/reject', adminController.rejectTurf);
router.patch('/turfs/:id/feature', adminController.toggleFeaturedTurf);
router.delete('/turfs/:id', adminController.deleteTurf);
router.get('/owners', adminController.getAllOwners);
router.delete('/owners/:id', adminController.deleteOwner);
router.get('/sports-stats', adminController.getSportsStats);
router.get('/customers', adminController.getAllCustomers);
router.delete('/customers/:id', adminController.deleteCustomer);
router.post('/customers/:id/notify', adminController.notifySingleUser);
router.get('/bookings', adminController.getAllBookings);
router.get('/payments', adminController.getAllPayments);
router.get('/queries', adminController.getAllQueries);
router.patch('/queries/:id/reply', adminController.replyToQuery);
router.get('/feedbacks', adminController.getAllFeedbacks);
router.delete('/feedbacks/:id', adminController.deleteFeedback);
router.post('/promos', adminController.addPromo);
router.get('/promos', adminController.getAllPromos);
router.patch('/promos/:id/status', adminController.updatePromoStatus);
router.delete('/promos/:id', adminController.deletePromo);
module.exports = router;
