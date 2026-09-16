const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

// We can choose to make this require auth or not. For now, we'll keep it public so customers can browse without logging in.
// If you want to force login, add: authenticateUser, authorizeRole(['CUSTOMER'])
router.get('/turfs', customerController.getActiveTurfs);
router.get('/turfs/:id/slots', customerController.getTurfSlots);
router.get('/turfs/:id/feedbacks', customerController.getTurfFeedbacks);

router.get('/profile', authenticateUser, authorizeRole(['CUSTOMER']), customerController.getProfile);
router.put('/profile', authenticateUser, authorizeRole(['CUSTOMER']), customerController.updateProfile);
router.get('/bookings', authenticateUser, authorizeRole(['CUSTOMER']), customerController.getCustomerBookings);
router.post('/bookings', authenticateUser, authorizeRole(['CUSTOMER']), customerController.createBooking);
router.post('/bookings/verify-payment', authenticateUser, authorizeRole(['CUSTOMER']), customerController.verifyPayment);
router.patch('/bookings/:id/cancel', authenticateUser, authorizeRole(['CUSTOMER']), customerController.cancelBooking);
router.put('/bookings/:id/reschedule', authenticateUser, authorizeRole(['CUSTOMER']), customerController.rescheduleBooking);

module.exports = router;
