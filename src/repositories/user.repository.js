const db = require('../config/db');

const findByEmail = (email) =>
  db.query('SELECT * FROM users WHERE email = $1', [email]);

const findByEmailAndRole = (email, role) =>
  db.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, role]);

const findById = (id) =>
  db.query('SELECT id, name, email, phone, role, status, created_at FROM users WHERE id = $1', [id]);

const findByIdFull = (id) =>
  db.query('SELECT id, name, email, phone, role, status FROM users WHERE id = $1', [id]);

const findAdminUser = () =>
  db.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");

const insertUser = (client, { name, email, password_hash, phone, role, verificationCode, verificationExpires }) =>
  client.query(
    `INSERT INTO users (name, email, password_hash, phone, role, verification_code, verification_code_expires, is_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING id, name, email, role`,
    [name, email, password_hash, phone, role, verificationCode, verificationExpires]
  );

const insertVerifiedUser = (client, { name, email, password_hash, phone, role }) =>
  client.query(
    `INSERT INTO users (name, email, password_hash, phone, role, is_verified)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id, name, email, role, phone, created_at, is_verified`,
    [name, email, password_hash, phone, role]
  );

const checkEmailExists = (client, email) =>
  client.query('SELECT id FROM users WHERE email = $1', [email]);

const markVerified = (email) =>
  db.query(
    `UPDATE users SET is_verified = true, verification_code = null, verification_code_expires = null WHERE email = $1 RETURNING *`,
    [email]
  );

const updateVerificationCode = (email, code, expires) =>
  db.query(
    `UPDATE users SET verification_code = $1, verification_code_expires = $2 WHERE email = $3`,
    [code, expires, email]
  );

const updatePassword = (email, password_hash) =>
  db.query(
    `UPDATE users SET password_hash = $1, verification_code = null, verification_code_expires = null WHERE email = $2`,
    [password_hash, email]
  );

const updateFcmToken = (userId, fcm_token) =>
  db.query(`UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`, [fcm_token, userId]);

const updateUserProfile = (client, userId, fields) => {
  let query = 'UPDATE users SET ';
  const values = [];
  let idx = 1;
  if (fields.name)            { query += `name = $${idx++}, `;    values.push(fields.name); }
  if (fields.email)           { query += `email = $${idx++}, `;   values.push(fields.email); }
  if (fields.phone !== undefined) { query += `phone = $${idx++}, `; values.push(fields.phone); }
  if (values.length === 0) return Promise.resolve({ rows: [] });
  query = query.slice(0, -2) + ` WHERE id = $${idx}`;
  values.push(userId);
  return client.query(query, values);
};

const updateUserProfileSimple = (userId, { name, email, phone }) =>
  db.query(
    `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, name, email, phone, created_at, updated_at`,
    [name, email, phone, userId]
  );

const changeUserPassword = (userId, new_password_hash) =>
  db.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [new_password_hash, userId]);

const getUserPasswordHash = (userId) =>
  db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);

const getAllCustomers = () =>
  db.query("SELECT id, name, email, phone, created_at FROM users WHERE role = 'CUSTOMER' ORDER BY created_at DESC");

const deleteCustomer = (id) =>
  db.query("DELETE FROM users WHERE id = $1 AND role = 'CUSTOMER' RETURNING id", [id]);

const deleteOwnerUser = (userId) =>
  db.query("DELETE FROM users WHERE id = $1 AND role = 'OWNER'", [userId]);

const findUserWithToken = (id) =>
  db.query('SELECT id, fcm_token FROM users WHERE id = $1', [id]);

const findUsersByRole = (role) =>
  db.query(
    `SELECT id, name, fcm_token FROM users WHERE role = $1 AND fcm_token IS NOT NULL`,
    [role]
  );

const insertAdminNotification = (client, { userId, title, message, type }) =>
  client.query(
    "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
    [userId, title, message, type]
  );

module.exports = {
  findByEmail,
  findByEmailAndRole,
  findById,
  findByIdFull,
  findAdminUser,
  insertUser,
  insertVerifiedUser,
  checkEmailExists,
  markVerified,
  updateVerificationCode,
  updatePassword,
  updateFcmToken,
  updateUserProfile,
  updateUserProfileSimple,
  changeUserPassword,
  getUserPasswordHash,
  getAllCustomers,
  deleteCustomer,
  deleteOwnerUser,
  findUserWithToken,
  findUsersByRole,
  insertAdminNotification,
};
