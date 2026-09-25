const db = require('../config/db');

const insertBookingsPending = (client, { turfId, sportId, userId, date, slot, price, orderId }) =>
  client.query(
    `INSERT INTO bookings (turf_id, sport_id, customer_id, booking_date, start_time, end_time, status, total_price, razorpay_order_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'PAYMENT_PENDING', $7, $8) RETURNING *`,
    [turfId, sportId, userId, date, slot.start_time, slot.end_time, price, orderId]
  );

const checkSlotConflicts = (client, { turfId, sportId, date, slotStarts }) =>
  client.query(
    `SELECT id FROM bookings WHERE turf_id = $1 AND sport_id = $2 AND booking_date = $3 AND status = 'CONFIRMED' AND start_time = ANY($4)`,
    [turfId, sportId, date, slotStarts]
  );

const getConfirmedBookings = (turfId, date, sportId) =>
  db.query(
    `SELECT start_time, end_time FROM bookings WHERE turf_id = $1 AND booking_date = $2 AND sport_id = $3 AND status = 'CONFIRMED'`,
    [turfId, date, sportId]
  );

const confirmBookingsByOrder = (userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentMethod }) =>
  db.query(
    `UPDATE bookings SET status = 'CONFIRMED', razorpay_payment_id = $1, razorpay_signature = $2, payment_method = $3, updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_order_id = $4 AND customer_id = $5 RETURNING *`,
    [razorpay_payment_id, razorpay_signature, paymentMethod, razorpay_order_id, userId]
  );

const confirmBookingsByOrderWebhook = (orderId, paymentId, paymentMethod) =>
  db.query(
    `UPDATE bookings SET status = 'CONFIRMED', razorpay_payment_id = $1, razorpay_signature = 'webhook_verified', payment_method = $2, updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_order_id = $3 AND status = 'PAYMENT_PENDING' RETURNING id, status`,
    [paymentId, paymentMethod, orderId]
  );

const getBookingReceipt = (orderId) =>
  db.query(
    `SELECT b.*, t.name as turf_name, t.address, t.city, t.latitude, t.longitude
     FROM bookings b JOIN turfs t ON b.turf_id = t.id WHERE b.razorpay_order_id = $1`,
    [orderId]
  );

const cancelBooking = (id, userId) =>
  db.query(
    `UPDATE bookings SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND customer_id = $2 AND status = 'CONFIRMED' RETURNING *`,
    [id, userId]
  );

const getCustomerBookings = (userId) =>
  db.query(
    `SELECT b.*, t.name as turf_name, t.address, t.city, t.latitude, t.longitude, s.name as sport_name,
       (SELECT image_url FROM turf_images WHERE turf_id = t.id ORDER BY sort_order ASC LIMIT 1) AS turf_image,
       EXISTS (SELECT 1 FROM turf_feedbacks tf WHERE tf.booking_id = b.id) AS has_feedback
     FROM bookings b JOIN turfs t ON b.turf_id = t.id JOIN sports s ON b.sport_id = s.id
     WHERE b.customer_id = $1 AND b.status != 'PAYMENT_PENDING'
     ORDER BY b.booking_date DESC, b.start_time DESC`,
    [userId]
  );

const getOwnerBookings = (ownerId, parsedLimit, offset) =>
  db.query(
    `SELECT COUNT(b.id) OVER() as total_count, b.id AS booking_id, b.booking_date, b.start_time, b.end_time,
       b.status, b.total_price, b.razorpay_order_id, b.razorpay_payment_id,
       t.id AS turf_id, t.name AS turf_name, s.name AS sport_name,
       u.id AS customer_id, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM bookings b JOIN turfs t ON b.turf_id = t.id JOIN sports s ON b.sport_id = s.id JOIN users u ON b.customer_id = u.id
     WHERE t.owner_id = $1 AND b.status != 'PAYMENT_PENDING'
     ORDER BY b.booking_date DESC, b.start_time DESC LIMIT $2 OFFSET $3`,
    [ownerId, parsedLimit, offset]
  );

const getAllBookings = () =>
  db.query(
    `SELECT b.id AS booking_id, b.booking_date, b.start_time, b.end_time, b.status, b.total_price,
       b.razorpay_order_id, b.razorpay_payment_id, t.id AS turf_id, t.name AS turf_name,
       s.name AS sport_name, o.business_name AS owner_business_name,
       u.id AS customer_id, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM bookings b JOIN turfs t ON b.turf_id = t.id JOIN sports s ON b.sport_id = s.id
     JOIN owners o ON t.owner_id = o.id JOIN users u ON b.customer_id = u.id
     ORDER BY b.booking_date DESC, b.start_time DESC`
  );

const getOwnerEarnings = (ownerId) =>
  db.query(
    `SELECT COUNT(b.id) AS total_bookings,
       SUM(CASE WHEN b.status = 'CONFIRMED' THEN b.total_price ELSE 0 END) AS total_earnings
     FROM bookings b JOIN turfs t ON b.turf_id = t.id WHERE t.owner_id = $1`,
    [ownerId]
  );

const getBookedTurfs = (ownerId) =>
  db.query(
    `SELECT COUNT(DISTINCT b.turf_id) AS booked_turfs FROM bookings b JOIN turfs t ON b.turf_id = t.id
     WHERE t.owner_id = $1 AND b.status = 'CONFIRMED'`,
    [ownerId]
  );

const getOwnerRecentBookings = (ownerId) =>
  db.query(
    `SELECT booking_id, booking_date, start_time, status, total_price, turf_name, sport_name, customer_name
     FROM (
       SELECT b.id AS booking_id, b.booking_date, b.start_time, b.status, b.total_price,
         t.name AS turf_name, s.name AS sport_name, u.name AS customer_name, b.created_at,
         ROW_NUMBER() OVER(PARTITION BY b.turf_id, b.sport_id, b.booking_date, b.start_time ORDER BY b.created_at DESC) as rn
       FROM bookings b JOIN turfs t ON b.turf_id = t.id JOIN sports s ON b.sport_id = s.id JOIN users u ON b.customer_id = u.id
       WHERE t.owner_id = $1 AND b.status = 'COMPLETED'
     ) sub WHERE rn = 1 ORDER BY created_at DESC LIMIT 4`,
    [ownerId]
  );

const getOwnerWeeklyEarnings = (ownerId) =>
  db.query(
    `WITH last_7_days AS (SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date)
     SELECT trim(to_char(d.date, 'Dy')) AS label, COALESCE(SUM(b.total_price), 0) AS value
     FROM last_7_days d
     LEFT JOIN (
       SELECT b.booking_date, b.total_price FROM bookings b JOIN turfs t ON b.turf_id = t.id
       WHERE t.owner_id = $1 AND b.status = 'CONFIRMED'
     ) b ON b.booking_date = d.date
     GROUP BY d.date ORDER BY d.date ASC`,
    [ownerId]
  );

const getBookingForReschedule = (client, id, userId) =>
  client.query(
    'SELECT turf_id, sport_id, status, booking_date, start_time FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE',
    [id, userId]
  );

const checkRescheduleConflict = (client, { turfId, sportId, date, id, endTime, startTime }) =>
  client.query(
    `SELECT id FROM bookings WHERE turf_id = $1 AND sport_id = $2 AND booking_date = $3 AND status = 'CONFIRMED' AND id != $4 AND start_time < $5 AND end_time > $6`,
    [turfId, sportId, date, id, endTime, startTime]
  );

const updateBookingSchedule = (client, { id, date, startTime, endTime }) =>
  client.query(
    `UPDATE bookings SET booking_date = $1, start_time = $2, end_time = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
    [date, startTime, endTime, id]
  );

const getAllPayments = () =>
  db.query(
    `SELECT b.id AS booking_id, b.total_price AS amount, b.status AS payment_status,
       b.razorpay_order_id, b.razorpay_payment_id, b.payment_method, b.created_at AS payment_date,
       t.name AS turf_name, o.business_name AS owner_business_name,
       ou.name AS owner_personal_name, u.name AS customer_name, u.email AS customer_email
     FROM bookings b JOIN turfs t ON b.turf_id = t.id JOIN owners o ON t.owner_id = o.id
     JOIN users ou ON o.user_id = ou.id JOIN users u ON b.customer_id = u.id
     WHERE b.razorpay_order_id IS NOT NULL ORDER BY b.created_at DESC`
  );

const getOwnerByBookingOrder = (orderId) =>
  db.query(
    `SELECT o.user_id FROM bookings b JOIN turfs t ON b.turf_id = t.id JOIN owners o ON t.owner_id = o.id
     WHERE b.razorpay_order_id = $1 LIMIT 1`,
    [orderId]
  );

module.exports = {
  insertBookingsPending, checkSlotConflicts, getConfirmedBookings,
  confirmBookingsByOrder, confirmBookingsByOrderWebhook, getBookingReceipt,
  cancelBooking, getCustomerBookings, getOwnerBookings, getAllBookings,
  getOwnerEarnings, getBookedTurfs, getOwnerRecentBookings, getOwnerWeeklyEarnings,
  getBookingForReschedule, checkRescheduleConflict, updateBookingSchedule,
  getAllPayments, getOwnerByBookingOrder,
};
