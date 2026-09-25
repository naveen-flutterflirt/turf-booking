const db = require('../config/db');
const bookingRepo = require('../repositories/booking.repository');
const turfRepo = require('../repositories/turf.repository');
const ownerRepo = require('../repositories/owner.repository');
const razorpayService = require('./razorpay.service');

// Helper: add hours to a time string "HH:MM:SS"
const addHoursToTime = (timeStr, hours) => {
  const [h, m, s] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, s);
  date.setHours(date.getHours() + hours);
  return date.toTimeString().split(' ')[0];
};

const getActiveTurfs = async (query) => {
  const { lat, lng, radius, min_price, max_price, sport, date, page, limit, is_featured } = query;
  const isPaginated = page !== undefined || limit !== undefined;
  const parsedLimit = isPaginated ? (parseInt(limit, 10) || 10) : null;
  const parsedPage = isPaginated ? (parseInt(page, 10) || 1) : null;
  const offset = isPaginated ? (parsedPage - 1) * parsedLimit : null;

  let selectDistance = "NULL AS distance_km";
  let whereClause = "WHERE t.status = 'ACTIVE' AND t.is_open = TRUE";
  let orderByClause = "ORDER BY t.is_featured DESC, t.created_at DESC";
  const queryParams = [];
  let paramIndex = 1;

  if (lat && lng) {
    const parsedLat = parseFloat(lat), parsedLng = parseFloat(lng);
    const parsedRadius = radius ? parseFloat(radius) : null;
    selectDistance = `ROUND((6371 * acos(cos(radians($${paramIndex})) * cos(radians(t.latitude)) * cos(radians(t.longitude) - radians($${paramIndex + 1})) + sin(radians($${paramIndex})) * sin(radians(t.latitude))))::numeric, 2) AS distance_km`;
    queryParams.push(parsedLat, parsedLng);
    paramIndex += 2;
    if (parsedRadius) {
      whereClause += ` AND (6371 * acos(cos(radians($${paramIndex - 2})) * cos(radians(t.latitude)) * cos(radians(t.longitude) - radians($${paramIndex - 1})) + sin(radians($${paramIndex - 2})) * sin(radians(t.latitude)))) <= $${paramIndex}`;
      queryParams.push(parsedRadius); paramIndex += 1;
    }
    orderByClause = "ORDER BY distance_km ASC NULLS LAST";
  }

  if (min_price) { whereClause += ` AND t.price_per_hour >= $${paramIndex}`; queryParams.push(parseFloat(min_price)); paramIndex += 1; }
  if (max_price) { whereClause += ` AND t.price_per_hour <= $${paramIndex}`; queryParams.push(parseFloat(max_price)); paramIndex += 1; }

  let sportSubqueryFilter = '';
  if (sport) {
    whereClause += ` AND EXISTS (SELECT 1 FROM turf_sports ts JOIN sports s ON ts.sport_id = s.id WHERE ts.turf_id = t.id AND s.name ILIKE $${paramIndex})`;
    sportSubqueryFilter = ` AND s.name ILIKE $${paramIndex}`;
    queryParams.push(`%${sport}%`); paramIndex += 1;
  }
  if (date) {
    whereClause += ` AND ((EXTRACT(EPOCH FROM (t.closing_time - t.opening_time)) / 3600) > (SELECT COUNT(id) FROM bookings WHERE turf_id = t.id AND booking_date = $${paramIndex} AND status = 'CONFIRMED'))`;
    queryParams.push(date); paramIndex += 1;
  }
  if (is_featured === 'true') { whereClause += ` AND t.is_featured = TRUE`; }

  let paginationClause = '';
  if (isPaginated) { paginationClause = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`; queryParams.push(parsedLimit, offset); }

  const sql = `SELECT t.*, COUNT(t.id) OVER() as total_count, ${selectDistance},
    (SELECT COALESCE(AVG(rating), 0)::numeric(10,1) FROM turf_feedbacks WHERE turf_id = t.id) AS average_rating,
    (SELECT COUNT(id) FROM turf_feedbacks WHERE turf_id = t.id) AS total_reviews,
    (SELECT COALESCE(json_agg(json_build_object('id', tf.id, 'rating', tf.rating, 'comment', tf.comment, 'image1_url', tf.image1_url, 'image2_url', tf.image2_url, 'created_at', tf.created_at, 'customer_name', u.name) ORDER BY tf.created_at DESC), '[]') FROM turf_feedbacks tf JOIN users u ON tf.customer_id = u.id WHERE tf.turf_id = t.id) AS feedbacks,
    (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name)), '[]') FROM turf_sports ts JOIN sports s ON ts.sport_id = s.id WHERE ts.turf_id = t.id${sportSubqueryFilter}) AS sports,
    (SELECT COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)), '[]') FROM turf_amenities ta JOIN amenities a ON ta.amenity_id = a.id WHERE ta.turf_id = t.id) AS amenities,
    (SELECT COALESCE(json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 's3_key', ti.s3_key, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC), '[]') FROM turf_images ti WHERE ti.turf_id = t.id) AS images
    FROM turfs t ${whereClause} ${orderByClause} ${paginationClause}`;

  const turfResult = await db.query(sql, queryParams);
  const total = turfResult.rows.length > 0 ? parseInt(turfResult.rows[0].total_count) : 0;
  const data = turfResult.rows.map(({ total_count, ...rest }) => rest);
  return { data, meta: { total, page: parsedPage || 1, limit: parsedLimit || total, total_pages: isPaginated ? Math.ceil(total / parsedLimit) : 1 } };
};

const getTurfSlots = async (turfId, { date, sport_id }) => {
  const turfResult = await turfRepo.getTurfTimings(turfId);
  if (turfResult.rows.length === 0) { const err = new Error('Turf not found'); err.status = 404; throw err; }
  const { opening_time, closing_time } = turfResult.rows[0];

  const turfSportCheck = await turfRepo.checkSportInTurf(turfId, sport_id);
  if (turfSportCheck.rows.length === 0) { const err = new Error('The selected sport is not available at this turf'); err.status = 400; throw err; }

  const bookingResult = await bookingRepo.getConfirmedBookings(turfId, date, sport_id);
  const existingBookings = bookingResult.rows;

  const slots = [];
  let current = opening_time;
  const effectiveClosingTime = closing_time === '00:00:00' ? '24:00:00' : closing_time;

  while (current < effectiveClosingTime) {
    const nextHour = addHoursToTime(current, 1);
    const effectiveNextHour = nextHour === '00:00:00' ? '24:00:00' : nextHour;
    if (effectiveNextHour > effectiveClosingTime) break;

    let isBooked = false;
    for (const booking of existingBookings) {
      if (current >= booking.start_time && current < booking.end_time) { isBooked = true; break; }
    }

    const [sh, sm, ss] = current.split(':').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    const slotDateLocal = new Date(y, m - 1, d, sh, sm, ss || 0);
    const isExpired = slotDateLocal < new Date();

    slots.push({ start: current.substring(0, 5), end: nextHour === '00:00:00' ? '00:00' : nextHour.substring(0, 5), status: isBooked ? 'BOOKED' : (isExpired ? 'EXPIRED' : 'AVAILABLE') });
    current = nextHour;
    if (current === '00:00:00') break;
  }
  return slots;
};

const createBooking = async (userId, { turf_id, sport_id, date, time_slots, is_full_day }) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const turfResult = await turfRepo.lockTurfForUpdate(client, turf_id);
    if (turfResult.rows.length === 0) { await client.query('ROLLBACK'); const err = new Error('Turf not found'); err.status = 404; throw err; }
    const turf = turfResult.rows[0];

    let requestedSlots = [];
    if (is_full_day) {
      let current = turf.opening_time;
      const effectiveClose = turf.closing_time === '00:00:00' ? '24:00:00' : turf.closing_time;
      while (current < effectiveClose) {
        const nextHour = addHoursToTime(current, 1);
        const effectiveNext = nextHour === '00:00:00' ? '24:00:00' : nextHour;
        if (effectiveNext > effectiveClose) break;
        requestedSlots.push({ start_time: current, end_time: nextHour });
        current = nextHour;
        if (current === '00:00:00') break;
      }
    } else {
      requestedSlots = time_slots.map(t => {
        let start = t.start_time, end = t.end_time;
        if (start.length === 5) start += ':00';
        if (end.length === 5) end += ':00';
        return { start_time: start, end_time: end };
      });
    }

    const firstSlot = requestedSlots[0];
    const [sh, sm, ss] = firstSlot.start_time.split(':').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    if (new Date(y, m - 1, d, sh, sm, ss || 0) < new Date()) {
      await client.query('ROLLBACK'); const err = new Error('Cannot book a time slot in the past'); err.status = 400; throw err;
    }

    const conflictResult = await bookingRepo.checkSlotConflicts(client, { turfId: turf_id, sportId: sport_id, date, slotStarts: requestedSlots.map(s => s.start_time) });
    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK'); const err = new Error('One or more selected slots have already been booked by someone else!'); err.status = 409; throw err;
    }

    const totalAmount = requestedSlots.length * parseFloat(turf.price_per_hour);
    let order;
    try {
      const shortReceipt = `rcpt_${userId.substring(0, 8)}_${Date.now()}`;
      let transfers = null;
      if (turf.razorpay_linked_account_id) {
        transfers = [
          {
            account: turf.razorpay_linked_account_id,
            amount: Math.floor(totalAmount * 100 * 0.90), // 90% goes to vendor, rounded down to paise
            currency: "INR",
            notes: { name: "Turf Booking Split" },
            on_hold: 0
          }
        ];
      }
      order = await razorpayService.createOrder(totalAmount, shortReceipt, transfers);
    } catch (error) {
      await client.query('ROLLBACK'); const err = new Error(error.message || 'Payment gateway error.'); err.status = 500; throw err;
    }

    const bookingsCreated = [];
    for (const slot of requestedSlots) {
      const bookingRes = await bookingRepo.insertBookingsPending(client, { turfId: turf_id, sportId: sport_id, userId, date, slot, price: turf.price_per_hour, orderId: order.id });
      bookingsCreated.push(bookingRes.rows[0]);
    }

    await client.query('COMMIT');
    return { order_id: order.id, amount: order.amount, currency: order.currency, bookings: bookingsCreated };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

const verifyPayment = async (userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const isValidSignature = razorpayService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValidSignature) { const err = new Error('Invalid payment signature'); err.status = 400; throw err; }

  let paymentMethod = 'unknown';
  const paymentDetails = await razorpayService.fetchPaymentDetails(razorpay_payment_id);
  if (paymentDetails && paymentDetails.method) { paymentMethod = paymentDetails.method; }

  const updateResult = await bookingRepo.confirmBookingsByOrder(userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentMethod });
  if (updateResult.rows.length === 0) { const err = new Error('No bookings found for this order'); err.status = 404; throw err; }

  const receiptResult = await bookingRepo.getBookingReceipt(razorpay_order_id);
  return receiptResult.rows;
};

const cancelBooking = async (userId, id) => {
  const result = await bookingRepo.cancelBooking(id, userId);
  if (result.rows.length === 0) { const err = new Error('Booking not found or already cancelled'); err.status = 404; throw err; }
  return result.rows[0];
};

const getCustomerBookings = (userId) => bookingRepo.getCustomerBookings(userId).then(r => r.rows);

const rescheduleBooking = async (userId, id, { date, start_time, end_time }) => {
  let formattedStartTime = start_time, formattedEndTime = end_time;
  if (formattedStartTime.length === 5) formattedStartTime += ':00';
  if (formattedEndTime.length === 5) formattedEndTime += ':00';

  const [sh, sm, ss] = formattedStartTime.split(':').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(y, m - 1, d, sh, sm, ss || 0) < new Date()) {
    const err = new Error('Cannot reschedule to a time slot in the past'); err.status = 400; throw err;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const bookingResult = await bookingRepo.getBookingForReschedule(client, id, userId);
    if (bookingResult.rows.length === 0) { await client.query('ROLLBACK'); const err = new Error('Booking not found'); err.status = 404; throw err; }

    const booking = bookingResult.rows[0];
    if (booking.status !== 'CONFIRMED') { await client.query('ROLLBACK'); const err = new Error('Only CONFIRMED bookings can be rescheduled'); err.status = 400; throw err; }

    const originalBookingDate = new Date(booking.booking_date);
    const [origSh, origSm, origSs] = booking.start_time.split(':').map(Number);
    originalBookingDate.setHours(origSh, origSm, origSs || 0);
    const twoHoursFromNow = new Date(); twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);
    if (originalBookingDate <= twoHoursFromNow) {
      await client.query('ROLLBACK'); const err = new Error('Rescheduling is only allowed at least 2 hours before the match starts'); err.status = 400; throw err;
    }

    const conflictResult = await bookingRepo.checkRescheduleConflict(client, { turfId: booking.turf_id, sportId: booking.sport_id, date, id, endTime: formattedEndTime, startTime: formattedStartTime });
    if (conflictResult.rows.length > 0) { await client.query('ROLLBACK'); const err = new Error('The selected time slot is already booked!'); err.status = 409; throw err; }

    const updateResult = await bookingRepo.updateBookingSchedule(client, { id, date, startTime: formattedStartTime, endTime: formattedEndTime });
    await client.query('COMMIT');
    return updateResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

const getOwnerBookings = async (userId, query) => {
  const { page = 1, limit = 5 } = query;
  const parsedLimit = parseInt(limit, 10) || 5;
  const parsedPage = parseInt(page, 10) || 1;
  const offset = (parsedPage - 1) * parsedLimit;
  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  const result = await bookingRepo.getOwnerBookings(ownerResult.rows[0].id, parsedLimit, offset);
  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
  const data = result.rows.map(({ total_count, ...rest }) => rest);
  return { data, meta: { total, page: parsedPage, limit: parsedLimit, total_pages: Math.ceil(total / parsedLimit) } };
};

const getOwnerDashboardStats = async (userId) => {
  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  const ownerId = ownerResult.rows[0].id;

  const turfsRes = await turfRepo.getTurfStats(ownerId);
  const activeTurfsRes = await turfRepo.getActiveTurfStats(ownerId);
  const totalTurfs = parseInt(turfsRes.rows[0].count) || 0;
  const totalActiveTurfs = parseInt(activeTurfsRes.rows[0].count) || 0;

  const bookingsRes = await bookingRepo.getOwnerEarnings(ownerId);
  const totalBookings = parseInt(bookingsRes.rows[0].total_bookings) || 0;
  const totalEarnings = parseFloat(bookingsRes.rows[0].total_earnings) || 0;

  let occupancyRate = 0;
  if (totalActiveTurfs > 0) {
    const bookedTurfsRes = await bookingRepo.getBookedTurfs(ownerId);
    const bookedTurfs = parseInt(bookedTurfsRes.rows[0].booked_turfs) || 0;
    occupancyRate = (bookedTurfs / totalActiveTurfs) * 100;
  }

  const recentRes = await bookingRepo.getOwnerRecentBookings(ownerId);
  const weeklyEarningsRes = await bookingRepo.getOwnerWeeklyEarnings(ownerId);
  const formattedWeeklyEarnings = weeklyEarningsRes.rows.map(row => ({ label: row.label, value: parseFloat(row.value) }));

  return {
    total_earnings: totalEarnings, total_bookings: totalBookings, total_turfs: totalTurfs,
    occupancy_rate: Math.round(occupancyRate * 100) / 100,
    recent_bookings: recentRes.rows, weekly_earnings: formattedWeeklyEarnings,
  };
};

module.exports = {
  getActiveTurfs, getTurfSlots, createBooking, verifyPayment, cancelBooking,
  getCustomerBookings, rescheduleBooking, getOwnerBookings, getOwnerDashboardStats,
};
