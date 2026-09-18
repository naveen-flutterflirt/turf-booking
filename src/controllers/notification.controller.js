const db = require('../config/db');
const getNotifications = async (req, res) => {
	const userId = req.user.id;
	try {
		const query = `
      SELECT id, title, message, type, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
		const result = await db.query(query, [userId]);
		// Count unread
		const unreadCount = result.rows.filter(n => !n.is_read).length;
		return res.status(200).json({
			success: true,
			unread_count: unreadCount,
			data: result.rows
		});
	} catch (err) {
		console.error('Get Notifications Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const markAsRead = async (req, res) => {
	const userId = req.user.id;
	const {
		id
	} = req.params;
	try {
		const result = await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
			[id, userId]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Notification not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Marked as read',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Mark As Read Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const markAllAsRead = async (req, res) => {
	const userId = req.user.id;
	try {
		const result = await db.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE RETURNING id`,
			[userId]);
		return res.status(200).json({
			success: true,
			message: `Marked ${result.rows.length} notifications as read`
		});
	} catch (err) {
		console.error('Mark All As Read Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteNotification = async (req, res) => {
	const userId = req.user.id;
	const {
		id
	} = req.params;
	try {
		const result = await db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
			[id, userId]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Notification not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Notification deleted successfully'
		});
	} catch (err) {
		console.error('Delete Notification Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const clearAllNotifications = async (req, res) => {
	const userId = req.user.id;
	try {
		const result = await db.query(`DELETE FROM notifications WHERE user_id = $1 RETURNING id`,
			[userId]);
		return res.status(200).json({
			success: true,
			message: `Cleared ${result.rows.length} notifications`
		});
	} catch (err) {
		console.error('Clear All Notifications Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const updateFcmToken = async (req, res) => {
	const userId = req.user.id;
	const {
		fcm_token,
		device_type
	} = req.body;
	if (!fcm_token) {
		return res.status(400).json({
			success: false,
			message: 'FCM token is required'
		});
	}
	try {
		const result = await db.query(`UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
			[fcm_token, userId]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'User not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'FCM token updated successfully'
		});
	} catch (err) {
		console.error('Update FCM Token Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
module.exports = {
	getNotifications,
	markAsRead,
	markAllAsRead,
	deleteNotification,
	clearAllNotifications,
	updateFcmToken
};
