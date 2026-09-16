const db = require('../config/db');

// Create Feedback
const createFeedback = async (req, res) => {
  const customer_id = req.user.id;
  const { turf_id, booking_id, rating, comment, image1_url, image2_url } = req.body;

  if (!turf_id || !booking_id || !rating) {
    return res.status(400).json({ success: false, message: 'turf_id, booking_id, and rating are required' });
  }

  try {
    // Check if booking belongs to customer and is COMPLETED
    const bookingQuery = await db.query(
      `SELECT status FROM bookings WHERE id = $1 AND customer_id = $2`,
      [booking_id, customer_id]
    );

    if (bookingQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found or does not belong to you.' });
    }

    if (bookingQuery.rows[0].status !== 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Feedback can only be given for completed bookings.' });
    }

    // Insert feedback
    const query = `
      INSERT INTO turf_feedbacks (turf_id, customer_id, booking_id, rating, comment, image1_url, image2_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [turf_id, customer_id, booking_id, rating, comment, image1_url, image2_url];
    
    const result = await db.query(query, values);

    return res.status(201).json({ success: true, message: 'Feedback added successfully', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // Unique violation in Postgres
      return res.status(400).json({ success: false, message: 'Feedback already exists for this booking.' });
    }
    console.error('Error creating feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Update Feedback
const updateFeedback = async (req, res) => {
  const customer_id = req.user.id;
  const feedback_id = req.params.id;
  const { rating, comment, image1_url, image2_url } = req.body;

  try {
    const query = `
      UPDATE turf_feedbacks
      SET rating = COALESCE($1, rating), comment = COALESCE($2, comment), image1_url = COALESCE($3, image1_url), image2_url = COALESCE($4, image2_url), updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND customer_id = $6
      RETURNING *
    `;
    const values = [rating, comment, image1_url, image2_url, feedback_id, customer_id];
    
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Feedback not found or unauthorized.' });
    }

    return res.status(200).json({ success: true, message: 'Feedback updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Delete Feedback
const deleteFeedback = async (req, res) => {
  const customer_id = req.user.id;
  const feedback_id = req.params.id;

  try {
    const query = `
      DELETE FROM turf_feedbacks
      WHERE id = $1 AND customer_id = $2
      RETURNING id
    `;
    
    const result = await db.query(query, [feedback_id, customer_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Feedback not found or unauthorized.' });
    }

    return res.status(200).json({ success: true, message: 'Feedback deleted successfully.' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = {
  createFeedback,
  updateFeedback,
  deleteFeedback
};
