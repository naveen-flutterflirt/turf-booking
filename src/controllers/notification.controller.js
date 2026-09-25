const notificationRepo = require('../repositories/notification.repository');
const userRepo = require('../repositories/user.repository');

const getNotifications = async (req, res) => {
  try {
    const result = await notificationRepo.getNotifications(req.user.id);
    const unreadCount = result.rows.filter(n => !n.is_read).length;
    return res.status(200).json({ success: true, unread_count: unreadCount, data: result.rows });
  } catch (err) {
    console.error('Get Notifications Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const result = await notificationRepo.markAsRead(req.params.id, req.user.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
    return res.status(200).json({ success: true, message: 'Marked as read', data: result.rows[0] });
  } catch (err) {
    console.error('Mark As Read Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const result = await notificationRepo.markAllAsRead(req.user.id);
    return res.status(200).json({ success: true, message: `Marked ${result.rows.length} notifications as read` });
  } catch (err) {
    console.error('Mark All As Read Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const result = await notificationRepo.deleteNotification(req.params.id, req.user.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
    return res.status(200).json({ success: true, message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('Delete Notification Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const clearAllNotifications = async (req, res) => {
  try {
    const result = await notificationRepo.clearAllNotifications(req.user.id);
    return res.status(200).json({ success: true, message: `Cleared ${result.rows.length} notifications` });
  } catch (err) {
    console.error('Clear All Notifications Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateFcmToken = async (req, res) => {
  const { fcm_token, device_type } = req.body;
  if (!fcm_token) return res.status(400).json({ success: false, message: 'FCM token is required' });
  try {
    const result = await userRepo.updateFcmToken(req.user.id, fcm_token);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, message: 'FCM token updated successfully' });
  } catch (err) {
    console.error('Update FCM Token Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification, clearAllNotifications, updateFcmToken };
