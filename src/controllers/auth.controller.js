const authService = require('../services/auth.service');

const registerOwner = async (req, res) => {
  const { name, email, password, business_name, phone } = req.body;
  if (!name || !email || !password || !business_name) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  try {
    const result = await authService.registerOwner({ name, email, password, business_name, phone });
    return res.status(201).json({ success: true, message: 'Owner registered successfully. Please check your email for the verification code.', email: result.email });
  } catch (err) {
    console.error('Owner Registration Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const loginOwner = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
  try {
    const { token, user } = await authService.loginOwner({ email, password });
    return res.status(200).json({ success: true, token, data: user });
  } catch (err) {
    console.error('Login Error:', err);
    if (err.status === 403) return res.status(403).json({ success: false, message: err.message, is_verified: false, email: err.email });
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
  try {
    const { token, user } = await authService.loginAdmin({ email, password });
    return res.status(200).json({ success: true, token, data: user });
  } catch (err) {
    console.error('Admin Login Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const registerCustomer = async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Missing required fields' });
  try {
    const result = await authService.registerCustomer({ name, email, password, phone });
    return res.status(201).json({ success: true, message: 'Customer registered successfully. Please check your email for the verification code.', email: result.email });
  } catch (err) {
    console.error('Customer Registration Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const loginCustomer = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
  try {
    const { token, user } = await authService.loginCustomer({ email, password });
    return res.status(200).json({ success: true, token, data: user });
  } catch (err) {
    console.error('Customer Login Error:', err);
    if (err.status === 403) return res.status(403).json({ success: false, message: err.message, is_verified: false, email: err.email });
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const verifyEmail = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ success: false, message: 'Email and verification code are required' });
  try {
    const { token, user } = await authService.verifyEmail({ email, code });
    return res.status(200).json({ success: true, message: 'Email verified successfully', token, data: user });
  } catch (err) {
    console.error('Verify Email Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const resendVerificationCode = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
  try {
    await authService.resendVerificationCode({ email });
    return res.status(200).json({ success: true, message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    console.error('Resend Code Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
  try {
    await authService.forgotPassword({ email });
    return res.status(200).json({ success: true, message: 'Password reset code has been sent to your email.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ success: false, message: 'Email, code, and new password are required' });
  try {
    await authService.resetPassword({ email, code, newPassword });
    return res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const googleLoginCustomer = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ success: false, message: 'Google ID token is required' });
  try {
    const result = await authService.googleLoginCustomer({ idToken });
    if (result.isNewUser) return res.status(200).json({ success: true, isNewUser: true, data: result.data });
    return res.status(200).json({ success: true, token: result.token, data: result.user });
  } catch (err) {
    console.error('Google Login Customer Error:', err);
    return res.status(401).json({ success: false, message: 'Invalid Google token' });
  }
};

const googleSignupCustomer = async (req, res) => {
  const { idToken, phone, name, password } = req.body;
  if (!idToken || !phone || !password) return res.status(400).json({ success: false, message: 'Google ID token, phone, and password are required' });
  try {
    const { token, user } = await authService.googleSignupCustomer({ idToken, phone, name, password });
    return res.status(201).json({ success: true, message: 'Signed up with Google successfully', token, data: user });
  } catch (err) {
    console.error('Google Signup Customer Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error or invalid token' });
  }
};

const googleLoginOwner = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ success: false, message: 'Google ID token is required' });
  try {
    const result = await authService.googleLoginOwner({ idToken });
    if (result.isNewUser) return res.status(200).json({ success: true, isNewUser: true, data: result.data });
    return res.status(200).json({ success: true, token: result.token, data: result.user });
  } catch (err) {
    console.error('Google Login Owner Error:', err);
    return res.status(401).json({ success: false, message: 'Invalid Google token' });
  }
};

const googleSignupOwner = async (req, res) => {
  const { idToken, phone, name, business_name, password } = req.body;
  if (!idToken || !phone || !business_name || !password) return res.status(400).json({ success: false, message: 'Missing required fields' });
  try {
    const { token, user } = await authService.googleSignupOwner({ idToken, phone, name, business_name, password });
    return res.status(201).json({ success: true, message: 'Owner signed up with Google successfully', token, data: user });
  } catch (err) {
    console.error('Google Signup Owner Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error or invalid token' });
  }
};

module.exports = {
  registerOwner, loginOwner, loginAdmin, registerCustomer, loginCustomer,
  verifyEmail, resendVerificationCode, forgotPassword, resetPassword,
  googleLoginCustomer, googleSignupCustomer, googleLoginOwner, googleSignupOwner
};
