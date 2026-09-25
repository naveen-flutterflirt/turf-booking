const db = require('../config/db');
const turfRepo = require('../repositories/turf.repository');
const userRepo = require('../repositories/user.repository');
const ownerRepo = require('../repositories/owner.repository');
const bookingRepo = require('../repositories/booking.repository');
const feedbackRepo = require('../repositories/feedback.repository');
const notificationRepo = require('../repositories/notification.repository');
const adminRepo = require('../repositories/admin.repository');
const { notificationQueue } = require('../utils/notificationQueue');

const getAllTurfs = async (req, res) => {
  try {
    const turfResult = await turfRepo.getAllTurfs();
    return res.status(200).json({ success: true, data: turfResult.rows });
  } catch (err) {
    console.error('Admin Get All Turfs Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const approveTurf = async (req, res) => {
  try {
    const result = await turfRepo.approveTurf(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found' });
    return res.status(200).json({ success: true, message: 'Turf approved and is now ACTIVE', data: result.rows[0] });
  } catch (err) {
    console.error('Admin Approve Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const rejectTurf = async (req, res) => {
  try {
    const result = await turfRepo.rejectTurf(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found' });
    return res.status(200).json({ success: true, message: 'Turf has been REJECTED', data: result.rows[0] });
  } catch (err) {
    console.error('Admin Reject Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllOwners = async (req, res) => {
  try {
    const result = await ownerRepo.getAllOwners();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Owners Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteOwner = async (req, res) => {
  try {
    const ownerResult = await ownerRepo.findOwnerUserIdById(req.params.id);
    if (ownerResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner not found' });
    await userRepo.deleteOwnerUser(ownerResult.rows[0].user_id);
    return res.status(200).json({ success: true, message: 'Owner and all associated data successfully deleted' });
  } catch (err) {
    console.error('Admin Delete Owner Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteTurf = async (req, res) => {
  try {
    const result = await turfRepo.deleteTurfAdmin(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found' });
    return res.status(200).json({ success: true, message: 'Turf deleted successfully' });
  } catch (err) {
    console.error('Admin Delete Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getSportsStats = async (req, res) => {
  try {
    const result = await adminRepo.getSportsStats();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get Sports Stats Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const result = await userRepo.getAllCustomers();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Customers Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const result = await userRepo.deleteCustomer(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer not found' });
    return res.status(200).json({ success: true, message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('Admin Delete Customer Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const result = await bookingRepo.getAllBookings();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Bookings Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllPayments = async (req, res) => {
  try {
    const result = await bookingRepo.getAllPayments();
    let totalRevenue = 0, successfulPayments = 0;
    result.rows.forEach(row => {
      if (row.payment_status === 'CONFIRMED') { totalRevenue += parseFloat(row.amount); successfulPayments++; }
    });
    return res.status(200).json({ success: true, stats: { total_revenue: totalRevenue, successful_payments: successfulPayments, total_transactions: result.rows.length }, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Payments Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllQueries = async (req, res) => {
  try {
    const result = await adminRepo.getAllQueries();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Queries Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const replyToQuery = async (req, res) => {
  const { admin_reply, status } = req.body;
  if (!admin_reply) return res.status(400).json({ success: false, message: 'Admin reply is required' });
  try {
    const result = await adminRepo.replyToQuery(req.params.id, admin_reply, status);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Query not found' });
    return res.status(200).json({ success: true, message: 'Replied to query successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Admin Reply To Query Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllFeedbacks = async (req, res) => {
  try {
    const result = await feedbackRepo.getAllFeedbacks();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Feedbacks Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const result = await feedbackRepo.deleteFeedbackAdmin(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Feedback not found' });
    return res.status(200).json({ success: true, message: 'Feedback deleted successfully' });
  } catch (err) {
    console.error('Admin Delete Feedback Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const notifyNearbyUsers = async (req, res) => {
  const { turf_id, radius_km, title, body, customer_ids } = req.body;
  const hasSpecificCustomers = customer_ids && Array.isArray(customer_ids) && customer_ids.length > 0;
  const parsedRadius = radius_km ? parseFloat(radius_km) : 0;
  if (!turf_id || !title || !body) return res.status(400).json({ success: false, message: 'Missing required fields (turf_id, title, body)' });
  if (parsedRadius <= 0 && !hasSpecificCustomers) return res.status(400).json({ success: false, message: 'You must provide either a valid radius ( > 0 ) or select specific customers.' });
  try {
    const turfResult = await turfRepo.getTurfCoordinates(turf_id);
    if (turfResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found' });
    const turf = turfResult.rows[0];
    if ((!turf.latitude || !turf.longitude) && radius_km) return res.status(400).json({ success: false, message: 'Turf coordinates not set (required for radius)' });

    let query = `SELECT id, name, fcm_token FROM users WHERE role = 'CUSTOMER' AND fcm_token IS NOT NULL`;
    let queryParams = []; let paramIndex = 1;
    if (parsedRadius > 0) {
      query += ` AND ST_DWithin(location, ST_MakePoint($${paramIndex}, $${paramIndex + 1})::geography, $${paramIndex + 2})`;
      queryParams.push(turf.longitude, turf.latitude, parsedRadius * 1000); paramIndex += 3;
    }
    let isSpecificTargeting = false;
    if (hasSpecificCustomers) { isSpecificTargeting = true; query += ` AND id = ANY($${paramIndex}::uuid[])`; queryParams.push(customer_ids); }
    const result = await db.query(query, queryParams);
    const eligibleUsers = result.rows;
    if (eligibleUsers.length === 0) return res.status(200).json({ success: true, message: 'No eligible users found in this radius.' });

    const targetedNamesStr = isSpecificTargeting ? eligibleUsers.map(u => u.name).join(', ') : 'All nearby customers';
    await notificationRepo.insertCampaign({ turfId: turf_id, title, body, radius_km, usersCount: eligibleUsers.length, targetedNames: targetedNamesStr });

    const tokens = eligibleUsers.map(u => u.fcm_token);
    const CHUNK_SIZE = 500;
    const tokenChunks = [];
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) { tokenChunks.push(tokens.slice(i, i + CHUNK_SIZE)); }
    for (const chunk of tokenChunks) {
      await notificationQueue.add('sendNotificationBatch', { tokens: chunk, payload: { title, body }, adminId: req.user ? req.user.id : null, turfId: turf_id });
    }
    if (eligibleUsers.length > 0) {
      await notificationRepo.insertBulkNotifications(eligibleUsers.map(u => u.id), title, body);
    }
    return res.status(200).json({ success: true, message: `Notification queued for ${eligibleUsers.length} users in ${tokenChunks.length} batches.` });
  } catch (err) {
    console.error('Admin Notify Nearby Users Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getNearbyCustomers = async (req, res) => {
  const { radius_km } = req.query;
  if (!radius_km) return res.status(400).json({ success: false, message: 'radius_km query parameter is required' });
  try {
    const turfResult = await turfRepo.getTurfCoordinates(req.params.id);
    if (turfResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found' });
    const turf = turfResult.rows[0];
    if (!turf.latitude || !turf.longitude) return res.status(400).json({ success: false, message: 'Turf coordinates not set' });
    const result = await db.query(
      `SELECT id, name, email, phone, fcm_token IS NOT NULL as has_app FROM users WHERE role = 'CUSTOMER' AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3) ORDER BY name ASC`,
      [turf.longitude, turf.latitude, parseFloat(radius_km) * 1000]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get Nearby Customers Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getNotificationCampaigns = async (req, res) => {
  try {
    const result = await notificationRepo.getNotificationCampaigns();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get Notification Campaigns Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteNotificationCampaign = async (req, res) => {
  try {
    const result = await notificationRepo.deleteCampaign(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Campaign not found' });
    return res.status(200).json({ success: true, message: 'Campaign deleted successfully' });
  } catch (err) {
    console.error('Admin Delete Notification Campaign Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const notifySingleUser = async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });
  try {
    const userResult = await userRepo.findUserWithToken(req.params.id);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = userResult.rows[0];
    if (!user.fcm_token) return res.status(400).json({ success: false, message: 'User does not have an FCM token registered' });
    await notificationRepo.insertNotification(user.id, title, body, 'PERSONAL');
    await notificationQueue.add('sendNotificationBatch', { tokens: [user.fcm_token], payload: { title, body }, adminId: req.user ? req.user.id : null, turfId: null });
    return res.status(200).json({ success: true, message: 'Notification queued successfully for the user.' });
  } catch (err) {
    console.error('Admin Notify Single User Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const toggleFeaturedTurf = async (req, res) => {
  const { is_featured } = req.body;
  if (is_featured === undefined) return res.status(400).json({ success: false, message: 'is_featured boolean is required' });
  try {
    const result = await turfRepo.toggleFeatured(req.params.id, is_featured);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found' });
    return res.status(200).json({ success: true, message: `Turf ${is_featured ? 'marked as featured' : 'removed from featured'}`, data: result.rows[0] });
  } catch (err) {
    console.error('Admin Toggle Featured Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const addPromo = async (req, res) => {
  const { image_url, status } = req.body;
  if (!image_url) return res.status(400).json({ success: false, message: 'image_url is required' });
  try {
    const result = await adminRepo.addPromo(image_url, status);
    return res.status(201).json({ success: true, message: 'Promo created successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Admin Add Promo Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deletePromo = async (req, res) => {
  try {
    const result = await adminRepo.deletePromo(req.params.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Promo not found' });
    return res.status(200).json({ success: true, message: 'Promo deleted successfully' });
  } catch (err) {
    console.error('Admin Delete Promo Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updatePromoStatus = async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'status is required' });
  try {
    const result = await adminRepo.updatePromoStatus(req.params.id, status);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Promo not found' });
    return res.status(200).json({ success: true, message: 'Promo status updated', data: result.rows[0] });
  } catch (err) {
    console.error('Admin Update Promo Status Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllPromos = async (req, res) => {
  try {
    const result = await adminRepo.getAllPromos();
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin Get All Promos Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getAllTurfs, approveTurf, rejectTurf, getAllOwners, deleteOwner, deleteTurf,
  getSportsStats, getAllCustomers, deleteCustomer, getAllBookings, getAllPayments,
  getAllQueries, replyToQuery, getAllFeedbacks, deleteFeedback, notifyNearbyUsers,
  getNotificationCampaigns, deleteNotificationCampaign, notifySingleUser,
  getNearbyCustomers, toggleFeaturedTurf, addPromo, deletePromo, updatePromoStatus, getAllPromos
};
