const db = require('../config/db');

const createTurf = async (req, res) => {
  const { name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time, sports, amenities, images } = req.body || {};
  const userId = req.user.id;

  // Basic validation
  if (!name || !address || !city || !price_per_hour || !opening_time || !closing_time) {
    return res.status(400).json({ success: false, message: 'Missing required fields for Turf' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN'); // Start Transaction

    // 1. Get the owner ID for this user
    const ownerResult = await client.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    // 2. Insert the Turf
    const turfQuery = `
      INSERT INTO turfs (owner_id, name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const turfValues = [ownerId, name, description, address, city, state, pincode, latitude || null, longitude || null, price_per_hour, opening_time, closing_time];
    const turfResult = await client.query(turfQuery, turfValues);
    const newTurf = turfResult.rows[0];

    // 3. Link sports if provided
    if (sports && Array.isArray(sports) && sports.length > 0) {
       for (const sportItem of sports) {
         let sportId = sportItem;
         
         // Check if it's a valid UUID. If not, assume it's a name like "Cricket"
         const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
         if (!uuidRegex.test(sportItem)) {
            const sportResult = await client.query('SELECT id FROM sports WHERE name ILIKE $1', [sportItem]);
            if (sportResult.rows.length > 0) {
              sportId = sportResult.rows[0].id;
            } else {
              // If the sport doesn't exist in the database, skip it
              continue; 
            }
         }

         await client.query(
           'INSERT INTO turf_sports (turf_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
           [newTurf.id, sportId]
         );
       }
    }

    // 3.5 Link amenities if provided
    if (amenities && Array.isArray(amenities) && amenities.length > 0) {
       for (const amenityItem of amenities) {
         let amenityId = amenityItem;
         
         const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
         if (!uuidRegex.test(amenityItem)) {
            const amenityResult = await client.query('SELECT id FROM amenities WHERE name ILIKE $1', [amenityItem]);
            if (amenityResult.rows.length > 0) {
              amenityId = amenityResult.rows[0].id;
            } else {
              const newAmenity = await client.query('INSERT INTO amenities (name) VALUES ($1) RETURNING id', [amenityItem]);
              amenityId = newAmenity.rows[0].id;
            }
         }

         await client.query(
           'INSERT INTO turf_amenities (turf_id, amenity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
           [newTurf.id, amenityId]
         );
       }
    }

    // 4. Insert Images to DB (URLs provided by frontend)
    let parsedImages = images;
    if (typeof images === 'string') {
      try { parsedImages = JSON.parse(images); } 
      catch (e) { parsedImages = [images]; }
    }

    let sortOrder = 0;
    const uploadedImages = [];
    if (parsedImages && Array.isArray(parsedImages)) {
      for (const img of parsedImages) {
        if (sortOrder >= 10) break; // Max 10 images
        if (!img || typeof img.url !== 'string' || !img.url.trim()) continue;

        const imgRes = await client.query(
          'INSERT INTO turf_images (turf_id, image_url, s3_key, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
          [newTurf.id, img.url, img.key || null, sortOrder]
        );
        uploadedImages.push(imgRes.rows[0]);
        sortOrder++;
      }
    }
    // --- NOTIFICATION TRIGGER ---
    const adminRes = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      const title = 'New Turf Pending Approval';
      const message = `${name} is waiting for your review.`;
      await client.query(
        "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
        [adminId, title, message, 'TURF_APPROVAL']
      );
    }

    await client.query('COMMIT');
    
    newTurf.sports = sports || [];
    newTurf.amenities = amenities || [];
    newTurf.images = uploadedImages;

    return res.status(201).json({
      success: true,
      message: 'Turf created successfully. Awaiting admin approval.',
      data: newTurf
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while creating turf' });
  } finally {
    client.release();
  }
};

const getOwnerTurfs = async (req, res) => {
  const userId = req.user.id;

  try {
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    // Fetch turfs with their associated sports and images using subqueries to avoid cartesian products
    const query = `
      SELECT 
        t.*,
        COALESCE((SELECT COUNT(b.id) FROM bookings b WHERE b.turf_id = t.id AND b.status = 'CONFIRMED'), 0)::int AS bookings_count,
        COALESCE(
          (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
           FROM turf_sports ts JOIN sports s ON ts.sport_id = s.id 
           WHERE ts.turf_id = t.id), 
          '[]'
        ) AS sports,
        COALESCE(
          (SELECT json_agg(json_build_object('id', a.id, 'name', a.name))
           FROM turf_amenities ta JOIN amenities a ON ta.amenity_id = a.id 
           WHERE ta.turf_id = t.id), 
          '[]'
        ) AS amenities,
        COALESCE(
          (SELECT json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 's3_key', ti.s3_key, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC)
           FROM turf_images ti 
           WHERE ti.turf_id = t.id), 
          '[]'
        ) AS images
      FROM turfs t
      WHERE t.owner_id = $1
      ORDER BY t.created_at DESC
    `;
    const turfResult = await db.query(query, [ownerId]);

    return res.status(200).json({
      success: true,
      data: turfResult.rows
    });
  } catch (err) {
    console.error('Get Owner Turfs Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateTurf = async (req, res) => {
  const { id } = req.params;
  const { name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time, is_open, images } = req.body || {};
  const userId = req.user.id;

  try {
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    // Verify turf belongs to this owner
    const turfCheck = await db.query('SELECT id FROM turfs WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    if (turfCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Turf not found or you do not have permission to edit it' });
    }

    // Update query
    const updateQuery = `
      UPDATE turfs 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          address = COALESCE($3, address),
          city = COALESCE($4, city),
          state = COALESCE($5, state),
          pincode = COALESCE($6, pincode),
          latitude = COALESCE($7, latitude),
          longitude = COALESCE($8, longitude),
          price_per_hour = COALESCE($9, price_per_hour),
          opening_time = COALESCE($10, opening_time),
          closing_time = COALESCE($11, closing_time),
          is_open = COALESCE($12, is_open),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 AND owner_id = $14
      RETURNING *
    `;
    const updateValues = [name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time, is_open, id, ownerId];
    
    const result = await db.query(updateQuery, updateValues);
    
    // If new image URLs were provided, append them
    let parsedImages = images;
    if (typeof images === 'string') {
      try { parsedImages = JSON.parse(images); } 
      catch (e) { parsedImages = [images]; }
    }

    if (parsedImages && Array.isArray(parsedImages) && parsedImages.length > 0) {
      const orderRes = await db.query('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM turf_images WHERE turf_id = $1', [id]);
      let currentOrder = parseInt(orderRes.rows[0].max_order) + 1;
      
      for (const img of parsedImages) {
        if (!img || typeof img.url !== 'string' || !img.url.trim()) continue;
        
        await db.query(
          'INSERT INTO turf_images (turf_id, image_url, s3_key, sort_order) VALUES ($1, $2, $3, $4)',
          [id, img.url, img.key || null, currentOrder]
        );
        currentOrder++;
      }
    }

    // Fetch the fully updated turf with sports and images
    const fullTurfQuery = `
      SELECT 
        t.*,
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
      WHERE t.id = $1
    `;
    const fullTurfResult = await db.query(fullTurfQuery, [id]);

    return res.status(200).json({ success: true, message: 'Turf updated successfully', data: fullTurfResult.rows[0] });
  } catch (err) {
    console.error('Update Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteTurf = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    const result = await db.query('DELETE FROM turfs WHERE id = $1 AND owner_id = $2 RETURNING id', [id, ownerId]);
    
    if (result.rows.length === 0) {
       return res.status(404).json({ success: false, message: 'Turf not found or you do not have permission to delete it' });
    }

    return res.status(200).json({ success: true, message: 'Turf deleted successfully' });
  } catch (err) {
    console.error('Delete Turf Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const addTurfImage = async (req, res) => {
  const { id } = req.params; // turf_id
  const { image_url, s3_key, sort_order } = req.body;
  const userId = req.user.id;

  if (!image_url) {
    return res.status(400).json({ success: false, message: 'image_url is required' });
  }

  try {
    // 1. Verify turf belongs to the logged in owner
    const turfCheck = await db.query(
      `SELECT t.id FROM turfs t JOIN owners o ON t.owner_id = o.id WHERE t.id = $1 AND o.user_id = $2`,
      [id, userId]
    );

    if (turfCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Turf not found or you do not have permission' });
    }

    // 2. Check if turf already has 10 images
    const countCheck = await db.query('SELECT COUNT(*) FROM turf_images WHERE turf_id = $1', [id]);
    if (parseInt(countCheck.rows[0].count, 10) >= 10) {
      return res.status(400).json({ success: false, message: 'Maximum 10 images allowed per turf' });
    }

    // 3. Insert image
    const result = await db.query(
      'INSERT INTO turf_images (turf_id, image_url, s3_key, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, image_url, s3_key || null, sort_order || 0]
    );

    return res.status(201).json({
      success: true,
      message: 'Image added successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Add Turf Image Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteTurfImage = async (req, res) => {
  const { id, imageId } = req.params;
  const userId = req.user.id;

  try {
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Owner profile not found' });
    const ownerId = ownerResult.rows[0].id;

    // Verify turf belongs to this owner
    const turfCheck = await db.query('SELECT id FROM turfs WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    if (turfCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Turf not found or you do not have permission' });

    // Find image record
    const imageResult = await db.query('SELECT s3_key FROM turf_images WHERE id = $1 AND turf_id = $2', [imageId, id]);
    if (imageResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Image not found' });

    const s3Key = imageResult.rows[0].s3_key;

    // Delete from S3
    if (s3Key) {
      const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ 
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET || process.env.AWS_S3_AVATAR_BUCKET,
        Key: s3Key
      }));
    }

    // Delete from database
    await db.query('DELETE FROM turf_images WHERE id = $1', [imageId]);

    return res.status(200).json({ success: true, message: 'Image deleted successfully' });
  } catch (err) {
    console.error('Delete Turf Image Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getOwnerBookings = async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 5 } = req.query;

  try {
    const parsedLimit = parseInt(limit, 10) || 5;
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;
    const query = `
      SELECT 
        COUNT(b.id) OVER() as total_count,
        b.id AS booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.status,
        b.total_price,
        b.razorpay_order_id,
        b.razorpay_payment_id,
        t.id AS turf_id,
        t.name AS turf_name,
        s.name AS sport_name,
        u.id AS customer_id,
        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      JOIN sports s ON b.sport_id = s.id
      JOIN users u ON b.customer_id = u.id
      WHERE t.owner_id = $1
      ORDER BY b.booking_date DESC, b.start_time DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [ownerId, parsedLimit, offset]);

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    // Remove total_count from each row object before sending
    const data = result.rows.map(row => {
      const { total_count, ...rest } = row;
      return rest;
    });

    return res.status(200).json({
      success: true,
      data: data,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        total_pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (err) {
    console.error('Owner Get Bookings Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getOwnerDashboardStats = async (req, res) => {
  const userId = req.user.id;

  try {
    // Get Owner ID
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    // 1. Total Turfs (Active/Open)
    const turfsRes = await db.query(`SELECT COUNT(id) AS count FROM turfs WHERE owner_id = $1`, [ownerId]);
    const totalTurfs = parseInt(turfsRes.rows[0].count) || 0;

    const activeTurfsRes = await db.query(`SELECT COUNT(id) AS count FROM turfs WHERE owner_id = $1 AND status = 'ACTIVE' AND is_open = TRUE`, [ownerId]);
    const totalActiveTurfs = parseInt(activeTurfsRes.rows[0].count) || 0;

    // 2. Earnings and Total Bookings
    const bookingsRes = await db.query(`
      SELECT 
        COUNT(b.id) AS total_bookings,
        SUM(CASE WHEN b.status = 'CONFIRMED' THEN b.total_price ELSE 0 END) AS total_earnings
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      WHERE t.owner_id = $1
    `, [ownerId]);
    
    const totalBookings = parseInt(bookingsRes.rows[0].total_bookings) || 0;
    const totalEarnings = parseFloat(bookingsRes.rows[0].total_earnings) || 0;

    // 3. Occupancy Rate Calculation (Turfs with at least one booking / Total Active Turfs)
    let occupancyRate = 0;
    if (totalActiveTurfs > 0) {
      const bookedTurfsRes = await db.query(`
        SELECT COUNT(DISTINCT b.turf_id) AS booked_turfs
        FROM bookings b
        JOIN turfs t ON b.turf_id = t.id
        WHERE t.owner_id = $1 AND b.status = 'CONFIRMED'
      `, [ownerId]);
      const bookedTurfs = parseInt(bookedTurfsRes.rows[0].booked_turfs) || 0;
      occupancyRate = (bookedTurfs / totalActiveTurfs) * 100;
    }

    // 4. Recent Top 4 Bookings (Deduplicated by turf, sport, date, and time to hide multiple abandoned checkout attempts)
    const recentRes = await db.query(`
      SELECT booking_id, booking_date, start_time, status, total_price, turf_name, sport_name, customer_name
      FROM (
        SELECT 
          b.id AS booking_id,
          b.booking_date,
          b.start_time,
          b.status,
          b.total_price,
          t.name AS turf_name,
          s.name AS sport_name,
          u.name AS customer_name,
          b.created_at,
          ROW_NUMBER() OVER(PARTITION BY b.turf_id, b.sport_id, b.booking_date, b.start_time ORDER BY b.created_at DESC) as rn
        FROM bookings b
        JOIN turfs t ON b.turf_id = t.id
        JOIN sports s ON b.sport_id = s.id
        JOIN users u ON b.customer_id = u.id
        WHERE t.owner_id = $1
      ) sub
      WHERE rn = 1
      ORDER BY created_at DESC
      LIMIT 4
    `, [ownerId]);

    // 5. Weekly Earnings Chart Data (Last 7 Days)
    const weeklyEarningsRes = await db.query(`
      WITH last_7_days AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date
      )
      SELECT 
        trim(to_char(d.date, 'Dy')) AS label,
        COALESCE(SUM(b.total_price), 0) AS value
      FROM last_7_days d
      LEFT JOIN (
        SELECT b.booking_date, b.total_price 
        FROM bookings b
        JOIN turfs t ON b.turf_id = t.id
        WHERE t.owner_id = $1 AND b.status = 'CONFIRMED'
      ) b ON b.booking_date = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    `, [ownerId]);

    // Format value to numbers
    const formattedWeeklyEarnings = weeklyEarningsRes.rows.map(row => ({
      label: row.label,
      value: parseFloat(row.value)
    }));

    return res.status(200).json({
      success: true,
      data: {
        total_earnings: totalEarnings,
        total_bookings: totalBookings,
        total_turfs: totalTurfs,
        occupancy_rate: Math.round(occupancyRate * 100) / 100, // Round to 2 decimal places
        recent_bookings: recentRes.rows,
        weekly_earnings: formattedWeeklyEarnings
      }
    });

  } catch (err) {
    console.error('Owner Dashboard Stats Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getOwnerProfile = async (req, res) => {
  const userId = req.user.id;
  try {
    const query = `
      SELECT u.id as user_id, o.id as owner_id, u.name, u.email, u.phone, o.business_name
      FROM users u
      JOIN owners o ON u.id = o.user_id
      WHERE u.id = $1
    `;
    const result = await db.query(query, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get Owner Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateOwnerProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, email, phone, business_name } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Update users table (name, email, phone)
    let userUpdateQuery = 'UPDATE users SET ';
    const userUpdateValues = [];
    let userParamIndex = 1;
    
    if (name) {
      userUpdateQuery += `name = $${userParamIndex++}, `;
      userUpdateValues.push(name);
    }
    if (email) {
      userUpdateQuery += `email = $${userParamIndex++}, `;
      userUpdateValues.push(email);
    }
    if (phone !== undefined) {
      userUpdateQuery += `phone = $${userParamIndex++}, `;
      userUpdateValues.push(phone);
    }

    if (userUpdateValues.length > 0) {
      userUpdateQuery = userUpdateQuery.slice(0, -2); // remove last comma and space
      userUpdateQuery += ` WHERE id = $${userParamIndex}`;
      userUpdateValues.push(userId);
      await client.query(userUpdateQuery, userUpdateValues);
    }

    // Update owners table (business_name)
    if (business_name) {
      await client.query('UPDATE owners SET business_name = $1 WHERE user_id = $2', [business_name, userId]);
    }

    await client.query('COMMIT');

    // Fetch the updated profile
    const updatedProfile = await client.query(`
      SELECT u.id as user_id, o.id as owner_id, u.name, u.email, u.phone, o.business_name
      FROM users u
      JOIN owners o ON u.id = o.user_id
      WHERE u.id = $1
    `, [userId]);

    return res.status(200).json({ success: true, message: 'Profile updated successfully', data: updatedProfile.rows[0] });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update Owner Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

const submitQuery = async (req, res) => {
  const { subject, message } = req.body;
  const userId = req.user.id;

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Subject and message are required' });
  }

  try {
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    const query = `
      INSERT INTO owner_queries (owner_id, subject, message)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(query, [ownerId, subject, message]);

    return res.status(201).json({ success: true, message: 'Query submitted successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Submit Query Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getQueries = async (req, res) => {
  const userId = req.user.id;

  try {
    const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Owner profile not found' });
    }
    const ownerId = ownerResult.rows[0].id;

    const query = `
      SELECT id, subject, message, admin_reply, status, created_at, updated_at
      FROM owner_queries
      WHERE owner_id = $1
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [ownerId]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get Queries Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { createTurf, getOwnerTurfs, updateTurf, deleteTurf, addTurfImage, deleteTurfImage, getOwnerBookings, getOwnerDashboardStats, getOwnerProfile, updateOwnerProfile, submitQuery, getQueries };
