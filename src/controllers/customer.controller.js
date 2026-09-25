const bookingService = require('../services/booking.service');
const userRepo = require('../repositories/user.repository');
const feedbackRepo = require('../repositories/feedback.repository');
const notificationRepo = require('../repositories/notification.repository');
const adminRepo = require('../repositories/admin.repository');
const bcrypt = require('bcryptjs');
const getActiveTurfs = async (req, res) => {
	try {
		const result = await bookingService.getActiveTurfs(req.query);
		return res.status(200).json({
			success: true,
			data: result.data,
			meta: result.meta
		});
	} catch (err) {
		console.error('Customer Get Turfs Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getProfile = async (req, res) => {
	try {
		const result = await userRepo.findById(req.user.id);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'User not found'
		});
		return res.status(200).json({
			success: true,
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Get Profile Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const updateProfile = async (req, res) => {
	const {
		name,
		email,
		phone
	} = req.body;
	try {
		const result = await userRepo.updateUserProfileSimple(req.user.id, {
			name,
			email,
			phone
		});
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'User not found'
		});
		return res.status(200).json({
			success: true,
			message: 'Profile updated successfully',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Customer Update Profile Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getTurfSlots = async (req, res) => {
	const {
		date,
		sport_id
	} = req.query;
	if (!date || !sport_id) return res.status(400).json({
		success: false,
		message: 'date and sport_id query parameters are required'
	});
	try {
		const slots = await bookingService.getTurfSlots(req.params.id, {
			date,
			sport_id
		});
		return res.status(200).json({
			success: true,
			data: slots
		});
	} catch (err) {
		console.error('Customer Get Slots Error:', err);
		return res.status(err.status || 500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};
const createBooking = async (req, res) => {
	const {
		turf_id,
		sport_id,
		date,
		time_slots,
		is_full_day
	} = req.body;
	if (!turf_id || !sport_id || !date) return res.status(400).json({
		success: false,
		message: 'turf_id, sport_id and date are required'
	});
	if (!is_full_day && (!time_slots || !Array.isArray(time_slots) || time_slots.length === 0)) {
		return res.status(400).json({
			success: false,
			message: 'Provide time_slots array or set is_full_day: true'
		});
	}
	try {
		const data = await bookingService.createBooking(req.user.id, {
			turf_id,
			sport_id,
			date,
			time_slots,
			is_full_day
		});
		return res.status(201).json({
			success: true,
			message: 'Payment pending. Proceed to pay.',
			data
		});
	} catch (err) {
		console.error('Customer Create Booking Error:', err);
		return res.status(err.status || 500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};
const cancelBooking = async (req, res) => {
	try {
		const data = await bookingService.cancelBooking(req.user.id, req.params.id);
		return res.status(200).json({
			success: true,
			message: 'Booking cancelled successfully. Time slot has been freed up.',
			data
		});
	} catch (err) {
		console.error('Customer Cancel Booking Error:', err);
		return res.status(err.status || 500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};
const verifyPayment = async (req, res) => {
	const {
		razorpay_order_id,
		razorpay_payment_id,
		razorpay_signature
	} = req.body;
	if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
		return res.status(400).json({
			success: false,
			message: 'Missing payment verification details'
		});
	}
	try {
		const data = await bookingService.verifyPayment(req.user.id, {
			razorpay_order_id,
			razorpay_payment_id,
			razorpay_signature
		});
		return res.status(200).json({
			success: true,
			message: 'Payment verified successfully. Booking CONFIRMED!',
			data
		});
	} catch (err) {
		console.error('Customer Verify Payment Error:', err);
		return res.status(err.status || 500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};
const getCustomerBookings = async (req, res) => {
	try {
		const data = await bookingService.getCustomerBookings(req.user.id);
		return res.status(200).json({
			success: true,
			data
		});
	} catch (err) {
		console.error('Customer Get Bookings Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const rescheduleBooking = async (req, res) => {
	const {
		date,
		start_time,
		end_time
	} = req.body;
	if (!date || !start_time || !end_time) return res.status(400).json({
		success: false,
		message: 'date, start_time, and end_time are required'
	});
	try {
		const data = await bookingService.rescheduleBooking(req.user.id, req.params.id, {
			date,
			start_time,
			end_time
		});
		return res.status(200).json({
			success: true,
			message: 'Booking rescheduled successfully',
			data
		});
	} catch (err) {
		console.error('Customer Reschedule Booking Error:', err);
		return res.status(err.status || 500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};
const getTurfFeedbacks = async (req, res) => {
	try {
		const result = await feedbackRepo.getTurfFeedbacks(req.params.id);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Customer Get Turf Feedbacks Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getNotifications = async (req, res) => {
	try {
		const result = await notificationRepo.getNotifications(req.user.id);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Customer Get Notifications Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const markNotificationRead = async (req, res) => {
	try {
		const result = await notificationRepo.markAsRead(req.params.id, req.user.id);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Notification not found'
		});
		return res.status(200).json({
			success: true,
			message: 'Notification marked as read',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Customer Mark Notification Read Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteNotification = async (req, res) => {
	try {
		const result = await notificationRepo.deleteNotification(req.params.id, req.user.id);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Notification not found'
		});
		return res.status(200).json({
			success: true,
			message: 'Notification deleted successfully'
		});
	} catch (err) {
		console.error('Customer Delete Notification Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const changePassword = async (req, res) => {
	const {
		current_password,
		new_password
	} = req.body;
	if (!current_password || !new_password) return res.status(400).json({
		success: false,
		message: 'Current password and new password are required'
	});
	try {
		const userResult = await userRepo.getUserPasswordHash(req.user.id);
		if (userResult.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'User not found'
		});
		const isMatch = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
		if (!isMatch) return res.status(401).json({
			success: false,
			message: 'Incorrect current password'
		});
		const salt = await bcrypt.genSalt(10);
		const new_password_hash = await bcrypt.hash(new_password, salt);
		await userRepo.changeUserPassword(req.user.id, new_password_hash);
		return res.status(200).json({
			success: true,
			message: 'Password changed successfully'
		});
	} catch (err) {
		console.error('Customer Change Password Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getActivePromos = async (req, res) => {
	try {
		const result = await adminRepo.getAllPromos();
		const activePromos = result.rows.filter(p => p.status === 'ACTIVE');
		return res.status(200).json({
			success: true,
			data: activePromos
		});
	} catch (err) {
		console.error('Customer Get Promos Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};

const getAppSettings = async (req, res) => {
	const db = require('../config/db');
	try {
		const result = await db.query('SELECT latest_android_version, latest_ios_version, force_update, normal_update, update_message, play_store_url, app_store_url FROM app_settings LIMIT 1');
		return res.status(200).json({
			success: true,
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Get App Settings Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};

module.exports = {
	getActiveTurfs,
	getProfile,
	updateProfile,
	getTurfSlots,
	createBooking,
	cancelBooking,
	verifyPayment,
	getCustomerBookings,
	rescheduleBooking,
	getTurfFeedbacks,
	getNotifications,
	markNotificationRead,
	deleteNotification,
	changePassword,
	getActivePromos,
	getAppSettings
};
