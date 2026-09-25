const turfService = require('../services/turf.service');
const ownerRepo = require('../repositories/owner.repository');
const userRepo = require('../repositories/user.repository');
const db = require('../config/db');

const createTurf = async (req, res) => {
  const { name, address, city, price_per_hour, opening_time, closing_time } = req.body || {};
  if (!name || !address || !city || !price_per_hour || !opening_time || !closing_time) {
    return res.status(400).json({ success: false, message: 'Missing required fields for Turf' });
  }
  try {
    const newTurf = await turfService.createTurf(req.user.id, req.body);
    return res.status(201).json({ success: true, message: 'Turf created successfully. Awaiting admin approval.', data: newTurf });
  } catch (err) {
    console.error('Create Turf Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error while creating turf' });
  }
};

const getOwnerTurfs = async (req, res) => {
  try {
    const data = await turfService.getOwnerTurfs(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Get Owner Turfs Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const updateTurf = async (req, res) => {
  try {
    const data = await turfService.updateTurf(req.user.id, req.params.id, req.body || {});
    return res.status(200).json({ success: true, message: 'Turf updated successfully', data });
  } catch (err) {
    console.error('Update Turf Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const deleteTurf = async (req, res) => {
  try {
    await turfService.deleteTurf(req.user.id, req.params.id);
    return res.status(200).json({ success: true, message: 'Turf deleted successfully' });
  } catch (err) {
    console.error('Delete Turf Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const addTurfImage = async (req, res) => {
  const { image_url, s3_key, sort_order } = req.body;
  if (!image_url) return res.status(400).json({ success: false, message: 'image_url is required' });
  try {
    const data = await turfService.addTurfImage(req.user.id, req.params.id, { image_url, s3_key, sort_order });
    return res.status(201).json({ success: true, message: 'Image added successfully', data });
  } catch (err) {
    console.error('Add Turf Image Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const deleteTurfImage = async (req, res) => {
  try {
    await turfService.deleteTurfImage(req.user.id, req.params.id, req.params.imageId);
    return res.status(200).json({ success: true, message: 'Image deleted successfully' });
  } catch (err) {
    console.error('Delete Turf Image Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const getOwnerBookings = async (req, res) => {
  try {
    const bookingService = require('../services/booking.service');
    const result = await bookingService.getOwnerBookings(req.user.id, req.query);
    return res.status(200).json({ success: true, data: result.data, meta: result.meta });
  } catch (err) {
    console.error('Owner Get Bookings Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const getOwnerDashboardStats = async (req, res) => {
  try {
    const bookingService = require('../services/booking.service');
    const data = await bookingService.getOwnerDashboardStats(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Owner Dashboard Stats Error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

const getOwnerProfile = async (req, res) => {
  try {
    const result = await ownerRepo.getOwnerProfile(req.user.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get Owner Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateOwnerProfile = async (req, res) => {
  const { name, email, phone, business_name } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await userRepo.updateUserProfile(client, req.user.id, { name, email, phone });
    if (business_name) await ownerRepo.updateOwnerBusinessName(client, business_name, req.user.id);
    await client.query('COMMIT');
    const updatedProfile = await ownerRepo.getOwnerProfileClient(client, req.user.id);
    return res.status(200).json({ success: true, message: 'Profile updated successfully', data: updatedProfile.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update Owner Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally { client.release(); }
};

const submitQuery = async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ success: false, message: 'Subject and message are required' });
  try {
    const ownerResult = await ownerRepo.findOwnerByUserId(req.user.id);
    if (ownerResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    const result = await ownerRepo.submitOwnerQuery(ownerResult.rows[0].id, subject, message);
    return res.status(201).json({ success: true, message: 'Query submitted successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Submit Query Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getQueries = async (req, res) => {
  try {
    const ownerResult = await ownerRepo.findOwnerByUserId(req.user.id);
    if (ownerResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    const result = await ownerRepo.getOwnerQueries(ownerResult.rows[0].id);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get Queries Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const addPayoutDetails = async (req, res) => {
  const { accountHolderName, bankAccountNumber, confirmBankAccountNumber, ifsc } = req.body;
  if (!accountHolderName || !bankAccountNumber || !confirmBankAccountNumber || !ifsc) {
    return res.status(400).json({ success: false, message: 'All payout fields are required' });
  }
  if (bankAccountNumber !== confirmBankAccountNumber) {
    return res.status(400).json({ success: false, message: 'Bank account numbers do not match' });
  }
  try {
    const ownerRes = await ownerRepo.getOwnerProfile(req.user.id);
    if (ownerRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    const owner = ownerRes.rows[0];

    const razorpayService = require('../services/razorpay.service');
    const linkedAccount = await razorpayService.createLinkedAccount({
      name: owner.name,
      email: owner.email,
      accountHolderName,
      bankAccountNumber,
      ifsc
    });

    const result = await ownerRepo.updatePayoutDetails(req.user.id, { 
      accountHolderName, 
      bankAccountNumber, 
      ifsc,
      razorpayLinkedAccountId: linkedAccount.id
    });
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    return res.status(200).json({ success: true, message: 'Payout details updated successfully. Bank verified for automatic transfers.' });
  } catch (err) {
    console.error('Add Payout Details Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getPayoutDetails = async (req, res) => {
  try {
    const result = await ownerRepo.getPayoutDetails(req.user.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    const owner = result.rows[0];
    let maskedBank = null;
    if (owner.bank_account_number) {
      const len = owner.bank_account_number.length;
      maskedBank = len > 4 ? 'X'.repeat(len - 4) + owner.bank_account_number.slice(-4) : 'XXXX';
    }
    return res.status(200).json({ success: true, data: { accountHolderName: owner.account_holder_name, bankAccountNumber: maskedBank, ifsc: owner.ifsc, status: owner.bank_verification_status, isCompleted: owner.payout_details_completed } });
  } catch (err) {
    console.error('Get Payout Details Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  createTurf, getOwnerTurfs, updateTurf, deleteTurf, addTurfImage, deleteTurfImage,
  getOwnerBookings, getOwnerDashboardStats, getOwnerProfile, updateOwnerProfile,
  submitQuery, getQueries, addPayoutDetails, getPayoutDetails
};
