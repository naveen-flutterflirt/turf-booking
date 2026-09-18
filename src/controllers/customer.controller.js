const db = require('../config/db');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Razorpay initialized inside createBooking to prevent server crash if env keys are missing during deployment

// Get only ACTIVE turfs for the customer app/website
const getActiveTurfs = async (req, res) => {
  const { lat, lng, radius, min_price, max_price, sport, date, page, limit } = req.query;

  try {
    // Pagination is optional: if page/limit are not provided, return all turfs
    const isPaginated = page !== undefined || limit !== undefined;
    const parsedLimit = isPaginated ? (parseInt(limit, 10) || 10) : null;
    const parsedPage = isPaginated ? (parseInt(page, 10) || 1) : null;
    const offset = isPaginated ? (parsedPage - 1) * parsedLimit : null;

    let selectDistance = "NULL AS distance_km";
    let whereClause = "WHERE t.status = 'ACTIVE' AND t.is_open = TRUE";
    let orderByClause = "ORDER BY t.created_at DESC";
    const queryParams = [];
    let paramIndex = 1;

    if (lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const parsedRadius = radius ? parseFloat(radius) : null;

      // Haversine Formula for distance in kilometers
      selectDistance = `
        ROUND((
          6371 * acos(
            cos(radians($${paramIndex})) * cos(radians(t.latitude)) *
            cos(radians(t.longitude) - radians($${paramIndex + 1})) +
            sin(radians($${paramIndex})) * sin(radians(t.latitude))
          )
        )::numeric, 2) AS distance_km
      `;
      queryParams.push(parsedLat, parsedLng);
      paramIndex += 2;

      if (parsedRadius) {
        whereClause += ` AND (
          6371 * acos(
            cos(radians($${paramIndex - 2})) * cos(radians(t.latitude)) *
            cos(radians(t.longitude) - radians($${paramIndex - 1})) +
            sin(radians($${paramIndex - 2})) * sin(radians(t.latitude))
          )
        ) <= $${paramIndex}`;
        queryParams.push(parsedRadius);
        paramIndex += 1;
      }

      orderByClause = "ORDER BY distance_km ASC NULLS LAST";
    }

    // 1. Price Filter
    if (min_price) {
      whereClause += ` AND t.price_per_hour >= $${paramIndex}`;
      queryParams.push(parseFloat(min_price));
      paramIndex += 1;
    }
    if (max_price) {
      whereClause += ` AND t.price_per_hour <= $${paramIndex}`;
      queryParams.push(parseFloat(max_price));
      paramIndex += 1;
    }

    // 2. Sport Filter
    if (sport) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM turf_sports ts
        JOIN sports s ON ts.sport_id = s.id
        WHERE ts.turf_id = t.id AND s.name ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${sport}%`);
      paramIndex += 1;
    }

    // 3. Strict Date Availability Filter
    if (date) {
      // Check if total possible slots (close_time - open_time in hours) > confirmed bookings on that date
      whereClause += ` AND (
        (EXTRACT(EPOCH FROM (t.closing_time - t.opening_time)) / 3600) > (
          SELECT COUNT(id) FROM bookings 
          WHERE turf_id = t.id AND booking_date = $${paramIndex} AND status = 'CONFIRMED'
        )
      )`;
      queryParams.push(date);
      paramIndex += 1;
    }

    // Build LIMIT/OFFSET clause only when pagination is requested
    let paginationClause = '';
    if (isPaginated) {
      paginationClause = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(parsedLimit, offset);
    }

    const query = `
      SELECT 
        t.*,
        COUNT(t.id) OVER() as total_count,
        ${selectDistance},
        (
          SELECT COALESCE(AVG(rating), 0)::numeric(10,1) 
          FROM turf_feedbacks WHERE turf_id = t.id
        ) AS average_rating,
        (
          SELECT COUNT(id)
          FROM turf_feedbacks WHERE turf_id = t.id
        ) AS total_reviews,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', tf.id,
              'rating', tf.rating,
              'comment', tf.comment,
              'image1_url', tf.image1_url,
              'image2_url', tf.image2_url,
              'created_at', tf.created_at,
              'customer_name', u.name
            ) ORDER BY tf.created_at DESC
          ), '[]')
          FROM turf_feedbacks tf
          JOIN users u ON tf.customer_id = u.id
          WHERE tf.turf_id = t.id
        ) AS feedbacks,
        (
          SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name)), '[]')
          FROM turf_sports ts
          JOIN sports s ON ts.sport_id = s.id
          WHERE ts.turf_id = t.id
        ) AS sports,
        (
          SELECT COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)), '[]')
          FROM turf_amenities ta
          JOIN amenities a ON ta.amenity_id = a.id
          WHERE ta.turf_id = t.id
        ) AS amenities,
        (
          SELECT COALESCE(json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 's3_key', ti.s3_key, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC), '[]')
          FROM turf_images ti
          WHERE ti.turf_id = t.id
        ) AS images
      FROM turfs t
      ${whereClause}
      ${orderByClause}
      ${paginationClause}
    `;
    
    const turfResult = await db.query(query, queryParams);

    const total = turfResult.rows.length > 0 ? parseInt(turfResult.rows[0].total_count) : 0;
    
    // Remove total_count from each row object before sending
    const data = turfResult.rows.map(row => {
      const { total_count, ...rest } = row;
      return rest;
    });

    return res.status(200).json({
      success: true,
      data: data,
      meta: {
        total,
        page: parsedPage || 1,
        limit: parsedLimit || total,
        total_pages: isPaginated ? Math.ceil(total / parsedLimit) : 1
      }
    });
  } catch (err) {
    console.error('Customer Get Turfs Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getProfile = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(
      'SELECT id, name, email, phone, role, status, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, email, phone } = req.body;
  try {
    const result = await db.query(
      `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, name, email, phone, created_at, updated_at`,
      [name, email, phone, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, message: 'Profile updated successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Customer Update Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Helper function to add hours to a time string "HH:MM:SS"
const addHoursToTime = (timeStr, hours) => {
  const [h, m, s] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, s);
  date.setHours(date.getHours() + hours);
  return date.toTimeString().split(' ')[0];
};

const getTurfSlots = async (req, res) => {
  const { id } = req.params; // turf_id
  const { date, sport_id } = req.query; // YYYY-MM-DD, sport_id

  if (!date || !sport_id) {
    return res.status(400).json({ success: false, message: 'date and sport_id query parameters are required' });
  }

  try {
    // 1. Get Turf opening and closing time
    const turfResult = await db.query('SELECT opening_time, closing_time FROM turfs WHERE id = $1', [id]);
    if (turfResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Turf not found' });
    }
    const { opening_time, closing_time } = turfResult.rows[0];

    // 1.5 Check if the sport is available at this turf
    const turfSportCheck = await db.query('SELECT 1 FROM turf_sports WHERE turf_id = $1 AND sport_id = $2', [id, sport_id]);
    if (turfSportCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'The selected sport is not available at this turf' });
    }

    // 2. Get existing CONFIRMED bookings for this turf on this date and sport
    const bookingResult = await db.query(
      `SELECT start_time, end_time FROM bookings WHERE turf_id = $1 AND booking_date = $2 AND sport_id = $3 AND status = 'CONFIRMED'`,
      [id, date, sport_id]
    );
    const existingBookings = bookingResult.rows;

    // 3. Generate hourly slots
    const slots = [];
    let current = opening_time;

    // Treat midnight (00:00:00) as 24:00:00 for correct comparison
    const effectiveClosingTime = closing_time === '00:00:00' ? '24:00:00' : closing_time;

    while (current < effectiveClosingTime) {
      const nextHour = addHoursToTime(current, 1);
      // Convert midnight result to 24:00:00 for comparison
      const effectiveNextHour = nextHour === '00:00:00' ? '24:00:00' : nextHour;
      
      // Stop if next hour goes past closing time
      if (effectiveNextHour > effectiveClosingTime) break; 

      // Check if this slot overlaps with any booking
      let isBooked = false;
      for (const booking of existingBookings) {
        // Simple overlap check: If the slot start is >= booking start AND slot start < booking end
        if (current >= booking.start_time && current < booking.end_time) {
          isBooked = true;
          break;
        }
      }

      // Check if slot is in the past
      let isExpired = false;
      const slotDateTime = new Date(`${date}T${current}Z`); // Use UTC or local depending on server, but simpler to just compare
      // For a more accurate local comparison:
      const now = new Date();
      // Calculate slot time (assuming local timezone of turf)
      const [sh, sm, ss] = current.split(':').map(Number);
      const [y, m, d] = date.split('-').map(Number);
      const slotDateLocal = new Date(y, m - 1, d, sh, sm, ss || 0);

      if (slotDateLocal < now) {
        isExpired = true;
      }

      slots.push({
        start: current.substring(0, 5), // "HH:MM"
        end: nextHour === '00:00:00' ? '00:00' : nextHour.substring(0, 5),
        status: isBooked ? 'BOOKED' : (isExpired ? 'EXPIRED' : 'AVAILABLE')
      });

      current = nextHour;
      // If we've wrapped to midnight, stop
      if (current === '00:00:00') break;
    }

    return res.status(200).json({ success: true, data: slots });
  } catch (err) {
    console.error('Customer Get Slots Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createBooking = async (req, res) => {
  const userId = req.user.id;
  const { turf_id, sport_id, date, time_slots, is_full_day } = req.body;

  if (!turf_id || !sport_id || !date) {
    return res.status(400).json({ success: false, message: 'turf_id, sport_id and date are required' });
  }
  if (!is_full_day && (!time_slots || !Array.isArray(time_slots) || time_slots.length === 0)) {
    return res.status(400).json({ success: false, message: 'Provide time_slots array or set is_full_day: true' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock the Turf row for UPDATE to prevent double-booking
    const turfResult = await client.query('SELECT price_per_hour, opening_time, closing_time FROM turfs WHERE id = $1 FOR UPDATE', [turf_id]);
    if (turfResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Turf not found' });
    }
    const turf = turfResult.rows[0];

    // 2. Determine requested slots
    let requestedSlots = []; // Array of objects: { start_time, end_time }
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
      // time_slots should be an array of objects e.g. [{ start_time: "16:00", end_time: "17:00" }]
      requestedSlots = time_slots.map(t => {
        let start = t.start_time;
        let end = t.end_time;
        if (start.length === 5) start += ':00';
        if (end.length === 5) end += ':00';
        return { start_time: start, end_time: end };
      });
    }

    // 2.5 Prevent booking slots in the past
    const firstSlot = requestedSlots[0];
    const [sh, sm, ss] = firstSlot.start_time.split(':').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    const bookingDateLocal = new Date(y, m - 1, d, sh, sm, ss || 0);
    
    if (bookingDateLocal < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cannot book a time slot in the past' });
    }

    // 3. Check for conflicts
    const slotStarts = requestedSlots.map(s => s.start_time);
    const conflictResult = await client.query(
      `SELECT id FROM bookings WHERE turf_id = $1 AND sport_id = $2 AND booking_date = $3 AND status = 'CONFIRMED' AND start_time = ANY($4)`,
      [turf_id, sport_id, date, slotStarts]
    );

    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'One or more selected slots have already been booked by someone else!' });
    }

    // 4. Calculate total amount
    const totalAmount = requestedSlots.length * parseFloat(turf.price_per_hour);

    // 5. Create Razorpay Order
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
       await client.query('ROLLBACK');
       return res.status(500).json({ success: false, message: 'Payment gateway is not configured on this server.' });
    }
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Razorpay receipt length must be <= 40 chars. We use a short random string + timestamp
    const shortReceipt = `rcpt_${userId.substring(0,8)}_${Date.now()}`;
    const options = {
      amount: totalAmount * 100, // Razorpay works in paise
      currency: "INR",
      receipt: shortReceipt
    };
    const order = await razorpay.orders.create(options);

    // 6. Insert bookings as PAYMENT_PENDING with the order ID
    const bookingsCreated = [];
    for (const slot of requestedSlots) {
      const bookingRes = await client.query(
        `INSERT INTO bookings (turf_id, sport_id, customer_id, booking_date, start_time, end_time, status, total_price, razorpay_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'PAYMENT_PENDING', $7, $8) RETURNING *`,
        [turf_id, sport_id, userId, date, slot.start_time, slot.end_time, turf.price_per_hour, order.id]
      );
      bookingsCreated.push(bookingRes.rows[0]);
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Payment pending. Proceed to pay.',
      data: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        bookings: bookingsCreated
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Customer Create Booking Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

const cancelBooking = async (req, res) => {
  const { id } = req.params; // booking_id
  const userId = req.user.id;

  try {
    const result = await db.query(
      `UPDATE bookings SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND customer_id = $2 AND status = 'CONFIRMED' RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found or already cancelled' });
    }

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully. Time slot has been freed up.',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Customer Cancel Booking Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const userId = req.user.id;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment verification details' });
  }

  try {
    // 1. Cryptographic Signature Verification
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // 2. Fetch Payment Method from Razorpay
    let paymentMethod = 'unknown';
    try {
      if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        const razorpay = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        paymentMethod = paymentDetails.method || 'unknown';
      }
    } catch (apiErr) {
      console.warn('Could not fetch payment details from Razorpay API:', apiErr);
    }

    // 3. Update all bookings linked to this order to CONFIRMED
    const updateResult = await db.query(
      `UPDATE bookings 
       SET status = 'CONFIRMED', 
           razorpay_payment_id = $1, 
           razorpay_signature = $2, 
           payment_method = $3,
           updated_at = CURRENT_TIMESTAMP 
       WHERE razorpay_order_id = $4 AND customer_id = $5 
       RETURNING *`,
      [razorpay_payment_id, razorpay_signature, paymentMethod, razorpay_order_id, userId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No bookings found for this order' });
    }

    // 3. Fetch full details for the receipt/success screen
    const receiptResult = await db.query(
      `SELECT b.*, t.name as turf_name, t.address, t.city, t.latitude, t.longitude
       FROM bookings b
       JOIN turfs t ON b.turf_id = t.id
       WHERE b.razorpay_order_id = $1`,
      [razorpay_order_id]
    );

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully. Booking CONFIRMED!',
      data: receiptResult.rows
    });
  } catch (err) {
    console.error('Customer Verify Payment Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getCustomerBookings = async (req, res) => {
  const userId = req.user.id;

  try {
    const query = `
      SELECT 
        b.*, 
        t.name as turf_name, 
        t.address, 
        t.city, 
        t.latitude, 
        t.longitude,
        s.name as sport_name,
        (SELECT image_url FROM turf_images WHERE turf_id = t.id ORDER BY sort_order ASC LIMIT 1) AS turf_image,
        EXISTS (SELECT 1 FROM turf_feedbacks tf WHERE tf.booking_id = b.id) AS has_feedback
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      JOIN sports s ON b.sport_id = s.id
      WHERE b.customer_id = $1 AND b.status != 'PAYMENT_PENDING'
      ORDER BY b.booking_date DESC, b.start_time DESC
    `;
    const result = await db.query(query, [userId]);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Customer Get Bookings Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const rescheduleBooking = async (req, res) => {
  const { id } = req.params; // booking_id
  const userId = req.user.id;
  const { date, start_time, end_time } = req.body;

  if (!date || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: 'date, start_time, and end_time are required' });
  }

  // Prevent rescheduling to the past
  let formattedStartTime = start_time;
  if (formattedStartTime.length === 5) formattedStartTime += ':00';
  let formattedEndTime = end_time;
  if (formattedEndTime.length === 5) formattedEndTime += ':00';

  const [sh, sm, ss] = formattedStartTime.split(':').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  const newBookingDateLocal = new Date(y, m - 1, d, sh, sm, ss || 0);
  
  if (newBookingDateLocal < new Date()) {
    return res.status(400).json({ success: false, message: 'Cannot reschedule to a time slot in the past' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the booking to verify ownership and get turf_id and sport_id
    const bookingResult = await client.query('SELECT turf_id, sport_id, status, booking_date, start_time FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE', [id, userId]);
    
    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.status !== 'CONFIRMED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Only CONFIRMED bookings can be rescheduled' });
    }

    // Check if there are at least 2 hours left before the original booking starts
    const originalBookingDate = new Date(booking.booking_date);
    const [origSh, origSm, origSs] = booking.start_time.split(':').map(Number);
    originalBookingDate.setHours(origSh, origSm, origSs || 0);

    const twoHoursFromNow = new Date();
    twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

    if (originalBookingDate <= twoHoursFromNow) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Rescheduling is only allowed at least 2 hours before the match starts' });
    }

    // 2. Check for conflicts
    const conflictResult = await client.query(
      `SELECT id FROM bookings 
       WHERE turf_id = $1 AND sport_id = $2 AND booking_date = $3 AND status = 'CONFIRMED' AND id != $4
       AND start_time < $5 AND end_time > $6`,
      [booking.turf_id, booking.sport_id, date, id, formattedEndTime, formattedStartTime]
    );

    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'The selected time slot is already booked!' });
    }

    // 3. Update the booking
    const updateResult = await client.query(
      `UPDATE bookings 
       SET booking_date = $1, start_time = $2, end_time = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [date, formattedStartTime, formattedEndTime, id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: updateResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Customer Reschedule Booking Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

const getTurfFeedbacks = async (req, res) => {
  const { id } = req.params; // turf_id
  try {
    const query = `
      SELECT tf.*, u.name as customer_name
      FROM turf_feedbacks tf
      JOIN users u ON tf.customer_id = u.id
      WHERE tf.turf_id = $1
      ORDER BY tf.created_at DESC
    `;
    const result = await db.query(query, [id]);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Customer Get Turf Feedbacks Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

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
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Customer Get Notifications Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const markNotificationRead = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const result = await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.status(200).json({ success: true, message: 'Notification marked as read', data: result.rows[0] });
  } catch (err) {
    console.error('Customer Mark Notification Read Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getActiveTurfs, getProfile, updateProfile, getTurfSlots, createBooking, cancelBooking, verifyPayment, getCustomerBookings, rescheduleBooking, getTurfFeedbacks, getNotifications, markNotificationRead };
