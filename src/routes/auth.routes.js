const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

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
