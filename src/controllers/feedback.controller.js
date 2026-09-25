const feedbackRepo = require('../repositories/feedback.repository');

const createFeedback = async (req, res) => {
  const customer_id = req.user.id;
  const { turf_id, booking_id, rating, comment, image1_url, image2_url } = req.body;
  if (!turf_id || !booking_id || !rating) return res.status(400).json({ success: false, message: 'turf_id, booking_id, and rating are required' });
  try {
    const bookingQuery = await feedbackRepo.getBookingForFeedback(booking_id, customer_id);
    if (bookingQuery.rows.length === 0) return res.status(404).json({ success: false, message: 'Booking not found or does not belong to you.' });
    if (bookingQuery.rows[0].status !== 'COMPLETED') return res.status(400).json({ success: false, message: 'Feedback can only be given for completed bookings.' });
    const result = await feedbackRepo.createFeedback(turf_id, customer_id, booking_id, rating, comment);
    return res.status(201).json({ success: true, message: 'Feedback added successfully', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ success: false, message: 'Feedback already exists for this booking.' });
    console.error('Error creating feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const updateFeedback = async (req, res) => {
  const { rating, comment } = req.body;
  try {
    const result = await feedbackRepo.updateFeedback(req.params.id, req.user.id, rating, comment);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Feedback not found or unauthorized.' });
    return res.status(200).json({ success: true, message: 'Feedback updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const result = await feedbackRepo.deleteFeedback(req.params.id, req.user.id);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Feedback not found or unauthorized.' });
    return res.status(200).json({ success: true, message: 'Feedback deleted successfully.' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { createFeedback, updateFeedback, deleteFeedback };
