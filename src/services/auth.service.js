const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../config/db');
const userRepo = require('../repositories/user.repository');
const ownerRepo = require('../repositories/owner.repository');
const { sendVerificationEmail, sendForgotPasswordEmail } = require('../utils/email');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateVerificationCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const getExpirationTime = () => new Date(Date.now() + 15 * 60 * 1000);

const registerOwner = async ({ name, email, password, business_name, phone }) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existingUser = await userRepo.checkEmailExists(client, email);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      const err = new Error('Email already in use'); err.status = 409; throw err;
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const verificationCode = generateVerificationCode();
    const verificationExpires = getExpirationTime();

    const userResult = await userRepo.insertUser(client, { name, email, password_hash, phone, role: 'OWNER', verificationCode, verificationExpires });
    const newUser = userResult.rows[0];

    await ownerRepo.insertOwner(client, newUser.id, business_name);

    const adminRes = await userRepo.findAdminUser();
    if (adminRes.rows.length > 0) {
      await userRepo.insertAdminNotification(client, {
        userId: adminRes.rows[0].id,
        title: 'New Turf Owner Registered',
        message: `${name} just joined the platform as a owner.`,
        type: 'USER_REGISTRATION'
      });
    }

    await client.query('COMMIT');
    sendVerificationEmail(email, verificationCode).catch(err => console.error('Background Email Error:', err));
    return { email: newUser.email };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const loginOwner = async ({ email, password }) => {
  const userResult = await userRepo.findByEmailAndRole(email, 'OWNER');
  if (userResult.rows.length === 0) {
    const err = new Error('Invalid credentials or not an owner'); err.status = 401; throw err;
  }
  const user = userResult.rows[0];
  if (!user.is_verified) {
    const err = new Error('Please verify your email before logging in.'); err.status = 403; err.is_verified = false; err.email = user.email; throw err;
  }
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) { const err = new Error('Invalid credentials'); err.status = 401; throw err; }
  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash; delete user.verification_code; delete user.verification_code_expires;
  return { token, user };
};

const loginAdmin = async ({ email, password }) => {
  const userResult = await userRepo.findByEmailAndRole(email, 'ADMIN');
  if (userResult.rows.length === 0) {
    const err = new Error('Invalid credentials or not an admin'); err.status = 401; throw err;
  }
  const user = userResult.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) { const err = new Error('Invalid credentials'); err.status = 401; throw err; }
  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash;
  return { token, user };
};

const registerCustomer = async ({ name, email, password, phone }) => {
  const client = await db.pool.connect();
  try {
    const existingUser = await userRepo.checkEmailExists(client, email);
    if (existingUser.rows.length > 0) {
      const err = new Error('Email already in use'); err.status = 409; throw err;
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const verificationCode = generateVerificationCode();
    const verificationExpires = getExpirationTime();

    const userResult = await userRepo.insertUser(client, { name, email, password_hash, phone, role: 'CUSTOMER', verificationCode, verificationExpires });
    const newUser = userResult.rows[0];

    const adminRes = await userRepo.findAdminUser();
    if (adminRes.rows.length > 0) {
      await userRepo.insertAdminNotification(client, {
        userId: adminRes.rows[0].id,
        title: 'New Customer Registration',
        message: `${name} just joined the platform.`,
        type: 'USER_REGISTRATION'
      });
    }
    sendVerificationEmail(email, verificationCode).catch(err => console.error('Background Email Error:', err));
    return { email: newUser.email };
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
};

const loginCustomer = async ({ email, password }) => {
  const userResult = await userRepo.findByEmailAndRole(email, 'CUSTOMER');
  if (userResult.rows.length === 0) {
    const err = new Error('Invalid credentials or not a customer'); err.status = 401; throw err;
  }
  const user = userResult.rows[0];
  if (!user.is_verified) {
    const err = new Error('Please verify your email before logging in.'); err.status = 403; err.is_verified = false; err.email = user.email; throw err;
  }
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) { const err = new Error('Invalid credentials'); err.status = 401; throw err; }
  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash; delete user.verification_code; delete user.verification_code_expires;
  return { token, user };
};

const verifyEmail = async ({ email, code }) => {
  const userResult = await userRepo.findByEmail(email);
  if (userResult.rows.length === 0) { const err = new Error('User not found'); err.status = 404; throw err; }
  const user = userResult.rows[0];
  if (user.is_verified) { const err = new Error('Email is already verified'); err.status = 400; throw err; }
  if (user.verification_code !== code) { const err = new Error('Invalid verification code'); err.status = 400; throw err; }
  if (new Date(user.verification_code_expires) < new Date()) {
    const err = new Error('Verification code has expired. Please request a new one.'); err.status = 400; throw err;
  }
  const updatedUserResult = await userRepo.markVerified(email);
  const updatedUser = updatedUserResult.rows[0];
  const token = jwt.sign({ userId: updatedUser.id, role: updatedUser.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  delete updatedUser.password_hash;
  return { token, user: updatedUser };
};

const resendVerificationCode = async ({ email }) => {
  const userResult = await userRepo.findByEmail(email);
  if (userResult.rows.length === 0) { const err = new Error('User not found'); err.status = 404; throw err; }
  const user = userResult.rows[0];
  if (user.is_verified) { const err = new Error('Email is already verified'); err.status = 400; throw err; }
  const newCode = generateVerificationCode();
  const newExpires = getExpirationTime();
  await userRepo.updateVerificationCode(email, newCode, newExpires);
  sendVerificationEmail(email, newCode).catch(err => console.error('Background Email Error:', err));
};

const forgotPassword = async ({ email }) => {
  const userResult = await userRepo.findByEmail(email);
  if (userResult.rows.length === 0) { const err = new Error('User not found'); err.status = 404; throw err; }
  const resetCode = generateVerificationCode();
  const resetExpires = getExpirationTime();
  await userRepo.updateVerificationCode(email, resetCode, resetExpires);
  sendForgotPasswordEmail(email, resetCode).catch(err => console.error('Background Email Error:', err));
};

const resetPassword = async ({ email, code, newPassword }) => {
  const userResult = await userRepo.findByEmail(email);
  if (userResult.rows.length === 0) { const err = new Error('User not found'); err.status = 404; throw err; }
  const user = userResult.rows[0];
  if (user.verification_code !== code) { const err = new Error('Invalid reset code'); err.status = 400; throw err; }
  if (new Date(user.verification_code_expires) < new Date()) {
    const err = new Error('Reset code has expired. Please request a new one.'); err.status = 400; throw err;
  }
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(newPassword, salt);
  await userRepo.updatePassword(email, password_hash);
};

const googleLoginCustomer = async ({ idToken }) => {
  const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  const { email, name } = payload;
  const userResult = await userRepo.findByEmailAndRole(email, 'CUSTOMER');
  if (userResult.rows.length === 0) return { isNewUser: true, data: { email, name, idToken } };
  const user = userResult.rows[0];
  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash; delete user.verification_code; delete user.verification_code_expires;
  return { isNewUser: false, token, user };
};

const googleSignupCustomer = async ({ idToken, phone, name, password }) => {
  const client = await db.pool.connect();
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const finalName = name || payload.name;
    await client.query('BEGIN');
    const existingUser = await userRepo.checkEmailExists(client, email);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      const err = new Error('Email already in use'); err.status = 409; throw err;
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userResult = await userRepo.insertVerifiedUser(client, { name: finalName, email, password_hash, phone, role: 'CUSTOMER' });
    const newUser = userResult.rows[0];
    const adminRes = await userRepo.findAdminUser();
    if (adminRes.rows.length > 0) {
      await userRepo.insertAdminNotification(client, {
        userId: adminRes.rows[0].id,
        title: 'New Customer Registration (Google)',
        message: `${finalName} just joined via Google.`,
        type: 'USER_REGISTRATION'
      });
    }
    await client.query('COMMIT');
    const token = jwt.sign({ userId: newUser.id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return { token, user: newUser };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

const googleLoginOwner = async ({ idToken }) => {
  const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  const { email, name } = payload;
  const userResult = await userRepo.findByEmailAndRole(email, 'OWNER');
  if (userResult.rows.length === 0) return { isNewUser: true, data: { email, name, idToken } };
  const user = userResult.rows[0];
  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash; delete user.verification_code; delete user.verification_code_expires;
  return { isNewUser: false, token, user };
};

const googleSignupOwner = async ({ idToken, phone, name, business_name, password }) => {
  const client = await db.pool.connect();
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const finalName = name || payload.name;
    await client.query('BEGIN');
    const existingUser = await userRepo.checkEmailExists(client, email);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      const err = new Error('Email already in use'); err.status = 409; throw err;
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userResult = await userRepo.insertVerifiedUser(client, { name: finalName, email, password_hash, phone, role: 'OWNER' });
    const newUser = userResult.rows[0];
    await ownerRepo.insertOwner(client, newUser.id, business_name);
    const adminRes = await userRepo.findAdminUser();
    if (adminRes.rows.length > 0) {
      await userRepo.insertAdminNotification(client, {
        userId: adminRes.rows[0].id,
        title: 'New Turf Owner Registered (Google)',
        message: `${finalName} just joined via Google.`,
        type: 'USER_REGISTRATION'
      });
    }
    await client.query('COMMIT');
    const token = jwt.sign({ userId: newUser.id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return { token, user: newUser };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

module.exports = {
  registerOwner, loginOwner, loginAdmin, registerCustomer, loginCustomer,
  verifyEmail, resendVerificationCode, forgotPassword, resetPassword,
  googleLoginCustomer, googleSignupCustomer, googleLoginOwner, googleSignupOwner,
};
