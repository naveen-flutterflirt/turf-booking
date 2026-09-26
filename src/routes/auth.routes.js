const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const rateLimit = require('express-rate-limit');

// Strict Rate Limiting for Auth APIs: Max 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many authentication attempts, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authLimiter);

router.post('/owner/signup', authController.registerOwner);
router.post('/owner/login', authController.loginOwner);
router.post('/admin/login', authController.loginAdmin);
router.post('/customer/signup', authController.registerCustomer);
router.post('/customer/login', authController.loginCustomer);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerificationCode);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Google Auth Routes
router.post('/customer/google', authController.googleLoginCustomer);
router.post('/customer/google-signup', authController.googleSignupCustomer);
router.post('/owner/google', authController.googleLoginOwner);
router.post('/owner/google-signup', authController.googleSignupOwner);

module.exports = router;
