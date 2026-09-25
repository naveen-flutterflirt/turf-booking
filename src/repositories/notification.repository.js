const db = require('../config/db');

const getNotifications = (userId) =>
  db.query(
    `SELECT id, title, message, type, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

const markAsRead = (id, userId) =>
  db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId]);

const markAllAsRead = (userId) =>
  db.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE RETURNING id`, [userId]);

const deleteNotification = (id, userId) =>
  db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);

const clearAllNotifications = (userId) =>
  db.query(`DELETE FROM notifications WHERE user_id = $1 RETURNING id`, [userId]);

const insertNotification = (userId, title, message, type) =>
  db.query(
    "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
    [userId, title, message, type]
  );

const insertBulkNotifications = (userIds, title, message) =>
  db.query(
    `INSERT INTO notifications (user_id, title, message, type) SELECT unnest($1::uuid[]), $2, $3, 'PROMO'`,
    [userIds, title, message]
  );

const getNotificationCampaigns = () =>
  db.query(
    `SELECT nc.*, t.name as turf_name FROM notification_campaigns nc JOIN turfs t ON nc.turf_id = t.id ORDER BY nc.created_at DESC`
  );

const insertCampaign = ({ turfId, title, body, radius_km, usersCount, targetedNames }) =>
  db.query(
    `INSERT INTO notification_campaigns (turf_id, title, message, radius_km, users_targeted, targeted_names) VALUES ($1, $2, $3, $4, $5, $6)`,
    [turfId, title, body, radius_km || 0, usersCount, targetedNames]
  );

const deleteCampaign = (id) =>
  db.query('DELETE FROM notification_campaigns WHERE id = $1 RETURNING id', [id]);

module.exports = {
  getNotifications, markAsRead, markAllAsRead, deleteNotification,
  clearAllNotifications, insertNotification, insertBulkNotifications,
  getNotificationCampaigns, insertCampaign, deleteCampaign,
};
