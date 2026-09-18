const db = require('../config/db');
const {
	notificationQueue
} = require('../utils/notificationQueue');
// Get all turfs (pending, active, rejected) for admin dashboard
const getAllTurfs = async (req, res) => {
	try {
		const query = `
      SELECT 
        t.*,
        o.business_name,
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
          SELECT COALESCE(json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC), '[]')
          FROM turf_images ti
          WHERE ti.turf_id = t.id
        ) AS images
      FROM turfs t
      JOIN owners o ON t.owner_id = o.id
      ORDER BY t.created_at DESC
    `;
		const turfResult = await db.query(query);
		return res.status(200).json({
			success: true,
			data: turfResult.rows
		});
	} catch (err) {
		console.error('Admin Get All Turfs Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
// Approve a turf
const approveTurf = async (req, res) => {
	const {
		id
	} = req.params;
	try {
		const result = await db.query(`UPDATE turfs SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
			[id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Turf not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Turf approved and is now ACTIVE',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Admin Approve Turf Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
// Reject a turf
const rejectTurf = async (req, res) => {
	const {
		id
	} = req.params;
	try {
		const result = await db.query(`UPDATE turfs SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
			[id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Turf not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Turf has been REJECTED',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Admin Reject Turf Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getAllOwners = async (req, res) => {
	try {
		const query = `
      SELECT 
        o.id AS owner_id,
        o.business_name,
        o.created_at AS owner_created_at,
        u.id AS user_id,
        u.name,
        u.email,
        u.phone,
        COUNT(t.id) AS turf_count
      FROM owners o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN turfs t ON o.id = t.owner_id
      GROUP BY o.id, u.id
      ORDER BY o.created_at DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get All Owners Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteOwner = async (req, res) => {
	const {
		id
	} = req.params; // This is the owner_id
	try {
		// Find the user_id associated with this owner_id
		const ownerResult = await db.query('SELECT user_id FROM owners WHERE id = $1', [id]);
		if (ownerResult.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Owner not found'
			});
		}
		const userId = ownerResult.rows[0].user_id;
		// Delete the user. Because of ON DELETE CASCADE, this will delete the owner, turfs, etc.
		await db.query(`DELETE FROM users WHERE id = $1 AND role = 'OWNER'`, [userId]);
		return res.status(200).json({
			success: true,
			message: 'Owner and all associated data successfully deleted'
		});
	} catch (err) {
		console.error('Admin Delete Owner Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteTurf = async (req, res) => {
	const {
		id
	} = req.params;
	try {
		const result = await db.query('DELETE FROM turfs WHERE id = $1 RETURNING id', [id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Turf not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Turf deleted successfully'
		});
	} catch (err) {
		console.error('Admin Delete Turf Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getSportsStats = async (req, res) => {
	try {
		const query = `
      SELECT 
        s.name as sport_name,
        COUNT(ts.turf_id) as turf_count,
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) as turfs
      FROM sports s
      LEFT JOIN turf_sports ts ON s.id = ts.sport_id
      LEFT JOIN turfs t ON ts.turf_id = t.id
      GROUP BY s.id, s.name
      ORDER BY turf_count DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get Sports Stats Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getAllCustomers = async (req, res) => {
	try {
		const query = `
      SELECT id, name, email, phone, created_at
      FROM users
      WHERE role = 'CUSTOMER'
      ORDER BY created_at DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get All Customers Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteCustomer = async (req, res) => {
	const {
		id
	} = req.params;
	try {
		const result = await db.query(`DELETE FROM users WHERE id = $1 AND role = 'CUSTOMER' RETURNING id`, [id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Customer not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Customer deleted successfully'
		});
	} catch (err) {
		console.error('Admin Delete Customer Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getAllBookings = async (req, res) => {
	try {
		const query = `
      SELECT 
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
        o.business_name AS owner_business_name,
        u.id AS customer_id,
        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      JOIN sports s ON b.sport_id = s.id
      JOIN owners o ON t.owner_id = o.id
      JOIN users u ON b.customer_id = u.id
      ORDER BY b.booking_date DESC, b.start_time DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get All Bookings Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getAllPayments = async (req, res) => {
	try {
		const query = `
      SELECT 
        b.id AS booking_id,
        b.total_price AS amount,
        b.status AS payment_status,
        b.razorpay_order_id,
        b.razorpay_payment_id,
        b.payment_method,
        b.created_at AS payment_date,
        t.name AS turf_name,
        o.business_name AS owner_business_name,
        ou.name AS owner_personal_name,
        u.name AS customer_name,
        u.email AS customer_email
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      JOIN owners o ON t.owner_id = o.id
      JOIN users ou ON o.user_id = ou.id
      JOIN users u ON b.customer_id = u.id
      WHERE b.razorpay_order_id IS NOT NULL
      ORDER BY b.created_at DESC
    `;
		const result = await db.query(query);
		// Calculate some basic stats for the admin
		let totalRevenue = 0;
		let successfulPayments = 0;
		result.rows.forEach(row => {
			if (row.payment_status === 'CONFIRMED') {
				totalRevenue += parseFloat(row.amount);
				successfulPayments++;
			}
		});
		return res.status(200).json({
			success: true,
			stats: {
				total_revenue: totalRevenue,
				successful_payments: successfulPayments,
				total_transactions: result.rows.length
			},
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get All Payments Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getAllQueries = async (req, res) => {
	try {
		const query = `
      SELECT 
        q.id,
        q.subject,
        q.message,
        q.admin_reply,
        q.status,
        q.created_at,
        q.updated_at,
        o.id AS owner_id,
        o.business_name,
        u.name AS owner_name,
        u.email AS owner_email
      FROM owner_queries q
      JOIN owners o ON q.owner_id = o.id
      JOIN users u ON o.user_id = u.id
      ORDER BY q.created_at DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get All Queries Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const replyToQuery = async (req, res) => {
	const {
		id
	} = req.params;
	const {
		admin_reply,
		status
	} = req.body;
	if (!admin_reply) {
		return res.status(400).json({
			success: false,
			message: 'Admin reply is required'
		});
	}
	try {
		const updateQuery = `
      UPDATE owner_queries 
      SET admin_reply = $1, 
          status = COALESCE($2, 'ANSWERED'),
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3 
      RETURNING *
    `;
		const result = await db.query(updateQuery, [admin_reply, status || 'ANSWERED', id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Query not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Replied to query successfully',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Admin Reply To Query Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getAllFeedbacks = async (req, res) => {
	try {
		const query = `
      SELECT 
        tf.*,
        u.name as customer_name,
        u.email as customer_email,
        t.name as turf_name
      FROM turf_feedbacks tf
      JOIN users u ON tf.customer_id = u.id
      JOIN turfs t ON tf.turf_id = t.id
      ORDER BY tf.created_at DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get All Feedbacks Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteFeedback = async (req, res) => {
	const {
		id
	} = req.params;
	try {
		const result = await db.query('DELETE FROM turf_feedbacks WHERE id = $1 RETURNING id', [id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Feedback not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Feedback deleted successfully'
		});
	} catch (err) {
		console.error('Admin Delete Feedback Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const notifyNearbyUsers = async (req, res) => {
	const {
		turf_id,
		radius_km,
		title,
		body,
		customer_ids
	} = req.body;
	const hasSpecificCustomers = customer_ids && Array.isArray(customer_ids) && customer_ids.length > 0;

	if (!turf_id || !title || !body) {
		return res.status(400).json({
			success: false,
			message: 'Missing required fields (turf_id, title, body)'
		});
	}
	
	if (!radius_km && !hasSpecificCustomers) {
		return res.status(400).json({
			success: false,
			message: 'You must provide either a radius_km or select specific customer_ids.'
		});
	}

	try {
		// 1. Get Turf coordinates
		const turfResult = await db.query('SELECT latitude, longitude FROM turfs WHERE id = $1', [turf_id]);
		if (turfResult.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Turf not found'
			});
		}
		const turf = turfResult.rows[0];
		if ((!turf.latitude || !turf.longitude) && radius_km) {
			return res.status(400).json({
				success: false,
				message: 'Turf coordinates not set (required for radius)'
			});
		}

		// 2. Query users using PostGIS (ONLY CUSTOMERS)
		let query = `
      SELECT id, name, fcm_token 
      FROM users 
      WHERE 
        role = 'CUSTOMER'
        AND fcm_token IS NOT NULL 
    `;
		let queryParams = [];
		let paramIndex = 1;

		if (radius_km) {
			const radiusInMeters = parseFloat(radius_km) * 1000;
			query += ` AND ST_DWithin(location, ST_MakePoint($${paramIndex}, $${paramIndex+1})::geography, $${paramIndex+2})`;
			queryParams.push(turf.longitude, turf.latitude, radiusInMeters);
			paramIndex += 3;
		}

		// If specific customers were selected, filter by those IDs
		let isSpecificTargeting = false;
		if (hasSpecificCustomers) {
			isSpecificTargeting = true;
			query += ` AND id = ANY($${paramIndex}::uuid[])`;
			queryParams.push(customer_ids);
		}
		const result = await db.query(query, queryParams);
		const eligibleUsers = result.rows;
		if (eligibleUsers.length === 0) {
			return res.status(200).json({
				success: true,
				message: 'No eligible users found in this radius.'
			});
		}
		// Determine targeted_names string
		let targetedNamesStr = 'All nearby customers';
		if (isSpecificTargeting) {
			targetedNamesStr = eligibleUsers.map(u => u.name).join(', ');
		}
		// 2.5 Save the campaign record in notification_campaigns table
		const insertCampaignQuery = `
      INSERT INTO notification_campaigns (turf_id, title, message, radius_km, users_targeted, targeted_names)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
		await db.query(insertCampaignQuery, [turf_id, title, body, radius_km || 0, eligibleUsers.length, targetedNamesStr]);
		// 3. Chunk tokens into arrays of 500
		const tokens = eligibleUsers.map(u => u.fcm_token);
		const CHUNK_SIZE = 500;
		const tokenChunks = [];
		for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
			tokenChunks.push(tokens.slice(i, i + CHUNK_SIZE));
		}
		// 4. Push jobs to BullMQ
		for (const chunk of tokenChunks) {
			await notificationQueue.add('sendNotificationBatch', {
				tokens: chunk,
				payload: {
					title,
					body
				},
				adminId: req.user ? req.user.id : null,
				turfId: turf_id
			});
		}
		// 5. Also save personal notifications for each targeted user so they can see it in their app history
		if (eligibleUsers.length > 0) {
			const userIds = eligibleUsers.map(u => u.id);
			await db.query(`INSERT INTO notifications (user_id, title, message, type)
         SELECT unnest($1::uuid[]), $2, $3, 'PROMO'`,
				[userIds, title, body]);
		}
		return res.status(200).json({
			success: true,
			message: `Notification queued for ${eligibleUsers.length} users in ${tokenChunks.length} batches.`
		});
	} catch (err) {
		console.error('Admin Notify Nearby Users Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getNearbyCustomers = async (req, res) => {
	const {
		id
	} = req.params; // turf_id
	const {
		radius_km
	} = req.query;
	if (!radius_km) {
		return res.status(400).json({
			success: false,
			message: 'radius_km query parameter is required'
		});
	}
	try {
		const turfResult = await db.query('SELECT latitude, longitude FROM turfs WHERE id = $1', [id]);
		if (turfResult.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Turf not found'
			});
		}
		const turf = turfResult.rows[0];
		if (!turf.latitude || !turf.longitude) {
			return res.status(400).json({
				success: false,
				message: 'Turf coordinates not set'
			});
		}
		const radiusInMeters = parseFloat(radius_km) * 1000;
		const query = `
      SELECT id, name, email, phone, fcm_token IS NOT NULL as has_app 
      FROM users 
      WHERE 
        role = 'CUSTOMER'
        AND ST_DWithin(
          location, 
          ST_MakePoint($1, $2)::geography, 
          $3
        )
      ORDER BY name ASC
    `;
		const result = await db.query(query, [turf.longitude, turf.latitude, radiusInMeters]);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get Nearby Customers Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const getNotificationCampaigns = async (req, res) => {
	try {
		const query = `
      SELECT 
        nc.*,
        t.name as turf_name
      FROM notification_campaigns nc
      JOIN turfs t ON nc.turf_id = t.id
      ORDER BY nc.created_at DESC
    `;
		const result = await db.query(query);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Admin Get Notification Campaigns Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const deleteNotificationCampaign = async (req, res) => {
	const {
		id
	} = req.params;
	try {
		const result = await db.query('DELETE FROM notification_campaigns WHERE id = $1 RETURNING id', [id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Campaign not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: 'Campaign deleted successfully'
		});
	} catch (err) {
		console.error('Admin Delete Notification Campaign Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const notifySingleUser = async (req, res) => {
	const {
		id
	} = req.params; // user_id
	const {
		title,
		body
	} = req.body;
	if (!title || !body) {
		return res.status(400).json({
			success: false,
			message: 'Missing title or body'
		});
	}
	try {
		// 1. Check if user exists and get fcm_token
		const userResult = await db.query('SELECT id, fcm_token FROM users WHERE id = $1', [id]);
		if (userResult.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'User not found'
			});
		}
		const user = userResult.rows[0];
		if (!user.fcm_token) {
			return res.status(400).json({
				success: false,
				message: 'User does not have an FCM token registered'
			});
		}
		// 2. Save notification history in the database for this specific user
		const insertQuery = `
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
    `;
		await db.query(insertQuery, [user.id, title, body, 'PERSONAL']);
		// 3. Push job to BullMQ
		await notificationQueue.add('sendNotificationBatch', {
			tokens: [user.fcm_token],
			payload: {
				title,
				body
			},
			adminId: req.user ? req.user.id : null,
			turfId: null
		});
		return res.status(200).json({
			success: true,
			message: 'Notification queued successfully for the user.'
		});
	} catch (err) {
		console.error('Admin Notify Single User Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
const toggleFeaturedTurf = async (req, res) => {
	const {
		id
	} = req.params;
	const {
		is_featured
	} = req.body;
	if (is_featured === undefined) {
		return res.status(400).json({
			success: false,
			message: 'is_featured boolean is required'
		});
	}
	try {
		const result = await db.query(`UPDATE turfs SET is_featured = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
			[is_featured, id]);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Turf not found'
			});
		}
		return res.status(200).json({
			success: true,
			message: `Turf ${is_featured ? 'marked as featured' : 'removed from featured'}`,
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Admin Toggle Featured Turf Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};
module.exports = {
	getAllTurfs,
	approveTurf,
	rejectTurf,
	getAllOwners,
	deleteOwner,
	deleteTurf,
	getSportsStats,
	getAllCustomers,
	deleteCustomer,
	getAllBookings,
	getAllPayments,
	getAllQueries,
	replyToQuery,
	getAllFeedbacks,
	deleteFeedback,
	notifyNearbyUsers,
	getNotificationCampaigns,
	deleteNotificationCampaign,
	notifySingleUser,
	getNearbyCustomers,
	toggleFeaturedTurf
};
