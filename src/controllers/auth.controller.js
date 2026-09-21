const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendVerificationEmail, sendForgotPasswordEmail } = require('../utils/email');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getExpirationTime = () => {
  return new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
};

const registerOwner = async (req, res) => {
  const { name, email, password, business_name, phone } = req.body;

  // Basic validation
  if (!name || !email || !password || !business_name) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN'); // Start Transaction

    // 1. Check if email exists
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Generate Verification Code
    const verificationCode = generateVerificationCode();
    const verificationExpires = getExpirationTime();

    // 3. Insert into users
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role, verification_code, verification_code_expires, is_verified) 
       VALUES ($1, $2, $3, $4, 'OWNER', $5, $6, false) RETURNING id, name, email, role`,
      [name, email, password_hash, phone, verificationCode, verificationExpires]
    );
    const newUser = userResult.rows[0];

    // 4. Insert into owners
    await client.query(
      `INSERT INTO owners (user_id, business_name) 
       VALUES ($1, $2)`,
      [newUser.id, business_name]
    );

    // --- NOTIFICATION TRIGGER ---
    // Notify the Admin about the new user registration
    const adminRes = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      const title = 'New Turf Owner Registered';
      const message = `${name} just joined the platform as a owner.`;
      await client.query(
        "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
        [adminId, title, message, 'USER_REGISTRATION']
      );
    }

    await client.query('COMMIT'); // Commit Transaction

    // Send Verification Email asynchronously
    sendVerificationEmail(email, verificationCode).catch(err => console.error('Background Email Error:', err));

    return res.status(201).json({
      success: true,
      message: 'Owner registered successfully. Please check your email for the verification code.',
      email: newUser.email
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Owner Registration Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

const loginOwner = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'OWNER']);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials or not an owner' });
    }

    const user = userResult.rows[0];

    // Check if verified
    if (!user.is_verified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email before logging in.', 
        is_verified: false,
        email: user.email 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove sensitive data
    delete user.password_hash;
    delete user.verification_code;
    delete user.verification_code_expires;

    return res.status(200).json({
      success: true,
      token,
      data: user
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'ADMIN']);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials or not an admin' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete user.password_hash;

    return res.status(200).json({
      success: true,
      token,
      data: user
    });
  } catch (err) {
    console.error('Admin Login Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const registerCustomer = async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const client = await db.pool.connect();

  try {
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const verificationCode = generateVerificationCode();
    const verificationExpires = getExpirationTime();

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role, verification_code, verification_code_expires, is_verified) 
       VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, $6, false) RETURNING id, name, email, role`,
      [name, email, password_hash, phone, verificationCode, verificationExpires]
    );
    const newUser = userResult.rows[0];

    // --- NOTIFICATION TRIGGER ---
    const adminRes = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      const title = 'New Customer Registration';
      const message = `${name} just joined the platform.`;
      await client.query(
        "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
        [adminId, title, message, 'USER_REGISTRATION']
      );
    }

    // Send Verification Email asynchronously
    sendVerificationEmail(email, verificationCode).catch(err => console.error('Background Email Error:', err));

    return res.status(201).json({
      success: true,
      message: 'Customer registered successfully. Please check your email for the verification code.',
      email: newUser.email
    });
  } catch (err) {
    console.error('Customer Registration Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

const loginCustomer = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'CUSTOMER']);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials or not a customer' });
    }

    const user = userResult.rows[0];

    // Check if verified
    if (!user.is_verified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email before logging in.', 
        is_verified: false,
        email: user.email 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete user.password_hash;
    delete user.verification_code;
    delete user.verification_code_expires;

    return res.status(200).json({
      success: true,
      token,
      data: user
    });
  } catch (err) {
    console.error('Customer Login Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const verifyEmail = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and verification code are required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    if (user.verification_code !== code) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    if (new Date(user.verification_code_expires) < new Date()) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    // Update user to verified
    const updatedUserResult = await db.query(
      `UPDATE users 
       SET is_verified = true, verification_code = null, verification_code_expires = null 
       WHERE email = $1 RETURNING *`,
      [email]
    );

    const updatedUser = updatedUserResult.rows[0];

    // Generate JWT now that they are verified
    const token = jwt.sign(
      { userId: updatedUser.id, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete updatedUser.password_hash;

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      token,
      data: updatedUser
    });
  } catch (err) {
    console.error('Verify Email Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const resendVerificationCode = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    const newCode = generateVerificationCode();
    const newExpires = getExpirationTime();

    await db.query(
      `UPDATE users 
       SET verification_code = $1, verification_code_expires = $2 
       WHERE email = $3`,
      [newCode, newExpires, email]
    );

    sendVerificationEmail(email, newCode).catch(err => console.error('Background Email Error:', err));

    return res.status(200).json({
      success: true,
      message: 'A new verification code has been sent to your email.'
    });
  } catch (err) {
    console.error('Resend Code Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const resetCode = generateVerificationCode();
    const resetExpires = getExpirationTime();

    await db.query(
      `UPDATE users 
       SET verification_code = $1, verification_code_expires = $2 
       WHERE email = $3`,
      [resetCode, resetExpires, email]
    );

    sendForgotPasswordEmail(email, resetCode).catch(err => console.error('Background Email Error:', err));

    return res.status(200).json({
      success: true,
      message: 'Password reset code has been sent to your email.'
    });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email, code, and new password are required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.verification_code !== code) {
      return res.status(400).json({ success: false, message: 'Invalid reset code' });
    }

    if (new Date(user.verification_code_expires) < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset code has expired. Please request a new one.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    await db.query(
      `UPDATE users 
       SET password_hash = $1, verification_code = null, verification_code_expires = null 
       WHERE email = $2`,
      [password_hash, email]
    );

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully.'
    });
  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const googleLoginCustomer = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Google ID token is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    const userResult = await db.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'CUSTOMER']);
    
    if (userResult.rows.length === 0) {
      // User doesn't exist, tell frontend to show complete profile form
      return res.status(200).json({ 
        success: true, 
        isNewUser: true, 
        data: { email, name, idToken } 
      });
    }

    const user = userResult.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete user.password_hash;
    delete user.verification_code;
    delete user.verification_code_expires;

    return res.status(200).json({
      success: true,
      token,
      data: user
    });

  } catch (err) {
    console.error('Google Login Customer Error:', err);
    return res.status(401).json({ success: false, message: 'Invalid Google token' });
  }
};

const googleSignupCustomer = async (req, res) => {
  const { idToken, phone, name, password } = req.body; // allow user to optionally pass a different name

  if (!idToken || !phone || !password) {
    return res.status(400).json({ success: false, message: 'Google ID token, phone, and password are required' });
  }

  const client = await db.pool.connect();

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const finalName = name || payload.name; // Use provided name or default to Google's

    await client.query('BEGIN');

    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    // Hash the password provided by the user
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role, is_verified) 
       VALUES ($1, $2, $3, $4, 'CUSTOMER', true) RETURNING id, name, email, role, phone, created_at, is_verified`,
      [finalName, email, password_hash, phone]
    );
    const newUser = userResult.rows[0];

    // Notification
    const adminRes = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      await client.query(
        "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
        [adminId, 'New Customer Registration (Google)', `${finalName} just joined via Google.`, 'USER_REGISTRATION']
      );
    }

    await client.query('COMMIT');

    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Signed up with Google successfully',
      token,
      data: newUser
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Google Signup Customer Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error or invalid token' });
  } finally {
    client.release();
  }
};

const googleLoginOwner = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Google ID token is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    const userResult = await db.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'OWNER']);
    
    if (userResult.rows.length === 0) {
      // User doesn't exist, tell frontend to show complete profile form
      return res.status(200).json({ 
        success: true, 
        isNewUser: true, 
        data: { email, name, idToken } 
      });
    }

    const user = userResult.rows[0];

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete user.password_hash;
    delete user.verification_code;
    delete user.verification_code_expires;

    return res.status(200).json({
      success: true,
      token,
      data: user
    });

  } catch (err) {
    console.error('Google Login Owner Error:', err);
    return res.status(401).json({ success: false, message: 'Invalid Google token' });
  }
};

const googleSignupOwner = async (req, res) => {
  const { idToken, phone, name, business_name, password } = req.body;

  if (!idToken || !phone || !business_name || !password) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const client = await db.pool.connect();

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const finalName = name || payload.name; // user can edit their Google name

    await client.query('BEGIN');

    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    // Hash the password provided by the user
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 1. Insert into users
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role, is_verified) 
       VALUES ($1, $2, $3, $4, 'OWNER', true) RETURNING id, name, email, role, phone, created_at, is_verified`,
      [finalName, email, password_hash, phone]
    );
    const newUser = userResult.rows[0];

    // 2. Insert into owners
    await client.query(
      `INSERT INTO owners (user_id, business_name) 
       VALUES ($1, $2)`,
      [newUser.id, business_name]
    );

    // Notification
    const adminRes = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      await client.query(
        "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
        [adminId, 'New Turf Owner Registered (Google)', `${finalName} just joined via Google.`, 'USER_REGISTRATION']
      );
    }

    await client.query('COMMIT');

    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Owner signed up with Google successfully',
      token,
      data: newUser
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Google Signup Owner Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error or invalid token' });
  } finally {
    client.release();
  }
};

module.exports = { 
  registerOwner, 
  loginOwner, 
  loginAdmin, 
  registerCustomer, 
  loginCustomer,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  googleLoginCustomer,
  googleSignupCustomer,
  googleLoginOwner,
  googleSignupOwner
};
