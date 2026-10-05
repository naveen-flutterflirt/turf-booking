const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

// Customer Route: Validate coupon during checkout
// Using authenticateUser to ensure only logged-in users can apply coupons (and so we have req.user.id)
router.post('/validate', authenticateUser, couponController.validateCoupon);

// Customer Route: Get available coupons to display on UI
router.get('/available', authenticateUser, couponController.getAvailableCoupons);

// Admin Routes
router.post('/', authenticateUser, authorizeRole(['ADMIN', 'OWNER']), couponController.createCoupon);
router.get('/', authenticateUser, authorizeRole(['ADMIN']), couponController.getAllCoupons);

module.exports = router;
