const db = require('../config/db');

// Queries for admin queries (owner support tickets)
const getAllQueries = () =>
  db.query(
    `SELECT q.id, q.subject, q.message, q.admin_reply, q.status, q.created_at, q.updated_at,
       o.id AS owner_id, o.business_name, u.name AS owner_name, u.email AS owner_email
     FROM owner_queries q JOIN owners o ON q.owner_id = o.id JOIN users u ON o.user_id = u.id
     ORDER BY q.created_at DESC`
  );

const replyToQuery = (id, admin_reply, status) =>
  db.query(
    `UPDATE owner_queries SET admin_reply = $1, status = COALESCE($2, 'ANSWERED'), updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 RETURNING *`,
    [admin_reply, status || 'ANSWERED', id]
  );

// Sports stats
const getSportsStats = () =>
  db.query(
    `SELECT s.name as sport_name, COUNT(ts.turf_id) as turf_count,
       COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') as turfs
     FROM sports s LEFT JOIN turf_sports ts ON s.id = ts.sport_id LEFT JOIN turfs t ON ts.turf_id = t.id
     GROUP BY s.id, s.name ORDER BY turf_count DESC`
  );

// Promos
const addPromo = (image_url, status) =>
  db.query(
    'INSERT INTO promos (image_url, status) VALUES ($1, $2) RETURNING *',
    [image_url, status || 'ACTIVE']
  );

const deletePromo = (id) =>
  db.query('DELETE FROM promos WHERE id = $1 RETURNING id', [id]);

const updatePromoStatus = (id, status) =>
  db.query('UPDATE promos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [status, id]);

const getAllPromos = () =>
  db.query('SELECT * FROM promos ORDER BY created_at DESC');

// Payout
const updatePayout = (payoutId, newStatus, failureReason) =>
  db.query(
    `UPDATE payouts SET status = $1, failure_reason = $2, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_payout_id = $3 RETURNING *`,
    [newStatus, failureReason, payoutId]
  );

module.exports = {
  getAllQueries, replyToQuery, getSportsStats,
  addPromo, deletePromo, updatePromoStatus, getAllPromos,
  updatePayout,
};
