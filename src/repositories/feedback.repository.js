const db = require('../config/db');

const createFeedback = (turf_id, customer_id, booking_id, rating, comment) =>
  db.query(
    `INSERT INTO turf_feedbacks (turf_id, customer_id, booking_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [turf_id, customer_id, booking_id, rating, comment]
  );

const updateFeedback = (feedback_id, customer_id, rating, comment) =>
  db.query(
    `UPDATE turf_feedbacks SET rating = COALESCE($1, rating), comment = COALESCE($2, comment), updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND customer_id = $4 RETURNING *`,
    [rating, comment, feedback_id, customer_id]
  );

const deleteFeedback = (feedback_id, customer_id) =>
  db.query(
    `DELETE FROM turf_feedbacks WHERE id = $1 AND customer_id = $2 RETURNING id`,
    [feedback_id, customer_id]
  );

const deleteFeedbackAdmin = (id) =>
  db.query('DELETE FROM turf_feedbacks WHERE id = $1 RETURNING id', [id]);

const getBookingForFeedback = (booking_id, customer_id) =>
  db.query(`SELECT status FROM bookings WHERE id = $1 AND customer_id = $2`, [booking_id, customer_id]);

const getTurfFeedbacks = (turfId) =>
  db.query(
    `SELECT tf.*, u.name as customer_name FROM turf_feedbacks tf JOIN users u ON tf.customer_id = u.id
     WHERE tf.turf_id = $1 ORDER BY tf.created_at DESC`,
    [turfId]
  );

const getAllFeedbacks = () =>
  db.query(
    `SELECT tf.*, u.name as customer_name, u.email as customer_email, t.name as turf_name
     FROM turf_feedbacks tf JOIN users u ON tf.customer_id = u.id JOIN turfs t ON tf.turf_id = t.id
     ORDER BY tf.created_at DESC`
  );

module.exports = {
  createFeedback, updateFeedback, deleteFeedback, deleteFeedbackAdmin,
  getBookingForFeedback, getTurfFeedbacks, getAllFeedbacks,
};
