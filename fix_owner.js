const fs = require('fs');

const file = 'src/controllers/owner.controller.js';
let content = fs.readFileSync(file, 'utf8');

const cleanCode = `
const getOwnerDashboardStats = async (req, res) => {
	try {
        const userId = req.user.id;
		// Get Owner ID
		const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
		if (ownerResult.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Owner profile not found'
			});
		}
		const ownerId = ownerResult.rows[0].id;
		// 1. Total Turfs (Active/Open)
		const turfsRes = await db.query(\`SELECT COUNT(id) AS count FROM turfs WHERE owner_id = $1\`, [ownerId]);
		const totalTurfs = parseInt(turfsRes.rows[0].count) || 0;
		const activeTurfsRes = await db.query(\`SELECT COUNT(id) AS count FROM turfs WHERE owner_id = $1 AND status = 'ACTIVE' AND is_open = TRUE\`, [ownerId]);
		const totalActiveTurfs = parseInt(activeTurfsRes.rows[0].count) || 0;
		// 2. Earnings and Total Bookings
		const bookingsRes = await db.query(\`
      SELECT 
        COUNT(b.id) AS total_bookings,
        SUM(CASE WHEN b.status IN ('CONFIRMED', 'COMPLETED') THEN b.total_price ELSE 0 END) AS total_earnings
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      WHERE t.owner_id = $1 AND b.status != 'PAYMENT_PENDING'
    \`, [ownerId]);
		const totalBookings = parseInt(bookingsRes.rows[0].total_bookings) || 0;
		const totalEarnings = parseFloat(bookingsRes.rows[0].total_earnings) || 0;
		// 3. Occupancy Rate Calculation
		let occupancyRate = 0;
		if (totalActiveTurfs > 0) {
			const bookedTurfsRes = await db.query(\`
        SELECT COUNT(DISTINCT b.turf_id) AS booked_turfs
        FROM bookings b
        JOIN turfs t ON b.turf_id = t.id
        WHERE t.owner_id = $1 
          AND b.status = 'CONFIRMED'
          AND b.booking_date = CURRENT_DATE
      \`, [ownerId]);
			const bookedTurfs = parseInt(bookedTurfsRes.rows[0].booked_turfs) || 0;
			occupancyRate = (bookedTurfs / totalActiveTurfs) * 100;
		}
		// 4. Recent Top 4 Bookings
		const recentRes = await db.query(\`
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
        WHERE t.owner_id = $1 AND b.status != 'PAYMENT_PENDING'
      ) sub
      WHERE rn = 1
      ORDER BY created_at DESC
      LIMIT 4
    \`, [ownerId]);
		// 5. Weekly Earnings Chart Data
		const weeklyEarningsRes = await db.query(\`
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
        WHERE t.owner_id = $1 AND b.status IN ('CONFIRMED', 'COMPLETED')
      ) b ON b.booking_date = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    \`, [ownerId]);
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
				occupancy_rate: Math.round(occupancyRate * 100) / 100,
				recent_bookings: recentRes.rows,
				weekly_earnings: formattedWeeklyEarnings
			}
		});
	} catch (err) {
		console.error('Owner Dashboard Stats Error:', err);
		return res.status(err.status || 500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};

const getOwnerProfile = async (req, res) => {
	try {
		const result = await ownerRepo.getOwnerProfile(req.user.id);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Owner profile not found'
		});
		return res.status(200).json({
			success: true,
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Get Owner Profile Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};

const updateOwnerProfile = async (req, res) => {
	const {
		name,
		email,
		phone,
		business_name
	} = req.body;
	const client = await db.pool.connect();
	try {
		await client.query('BEGIN');
		await userRepo.updateUserProfile(client, req.user.id, {
			name,
			email,
			phone
		});
		if (business_name) await ownerRepo.updateOwnerBusinessName(client, business_name, req.user.id);
		await client.query('COMMIT');
		const updatedProfile = await ownerRepo.getOwnerProfileClient(client, req.user.id);
		return res.status(200).json({
			success: true,
			message: 'Profile updated successfully',
			data: updatedProfile.rows[0]
		});
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('Update Owner Profile Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	} finally {
		client.release();
	}
};

const submitQuery = async (req, res) => {
	const {
		subject,
		message
	} = req.body;
	if (!subject || !message) return res.status(400).json({
		success: false,
		message: 'Subject and message are required'
	});
	try {
		const ownerResult = await ownerRepo.findOwnerByUserId(req.user.id);
		if (ownerResult.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Owner profile not found'
		});
		const result = await ownerRepo.submitOwnerQuery(ownerResult.rows[0].id, subject, message);
		return res.status(201).json({
			success: true,
			message: 'Query submitted successfully',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Submit Query Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};

const getQueries = async (req, res) => {
	try {
		const ownerResult = await ownerRepo.findOwnerByUserId(req.user.id);
		if (ownerResult.rows.length === 0) return res.status(404).json({
			success: false,
			message: 'Owner profile not found'
		});
		const result = await ownerRepo.getOwnerQueries(ownerResult.rows[0].id);
		return res.status(200).json({
			success: true,
			data: result.rows
		});
	} catch (err) {
		console.error('Get Queries Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};

const getAccountDetails = async (req, res) => {
	const userId = req.user.id;
	const { owner_id } = req.query;
	try {
		let query;
		let params;
		if (req.user.role === 'ADMIN' && owner_id) {
			query = \`
        SELECT account_name, account_number, ifsc_code, bank_name
        FROM owners
        WHERE id = $1
      \`;
			params = [owner_id];
		} else if (req.user.role === 'ADMIN' && !owner_id) {
			query = \`
        SELECT o.id as owner_id, o.account_name, o.account_number, o.ifsc_code, o.bank_name, u.name, u.email
        FROM owners o
        JOIN users u ON o.user_id = u.id
      \`;
			params = [];
			const result = await db.query(query, params);
			return res.status(200).json({
				success: true,
				data: result.rows
			});
		} else {
			query = \`
        SELECT account_name, account_number, ifsc_code, bank_name
        FROM owners
        WHERE user_id = $1
      \`;
			params = [userId];
		}
		const result = await db.query(query, params);
		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Owner profile not found'
			});
		}
		return res.status(200).json({
			success: true,
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Get Account Details Error:', err);
		return res.status(500).json({
			success: false,
			message: 'Internal server error'
		});
	}
};

const updateAccountDetails = async (req, res) => {
	const userId = req.user.id;
	const { account_name, account_number, ifsc_code, bank_name } = req.body;
	try {
		const ownerResult = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
		if (ownerResult.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Owner profile not found'
			});
		}
        
        // 1. Fetch user email and name for Razorpay
        const userRes = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        // 2. Create Razorpay Linked Account automatically
        const razorpayService = require('../services/razorpay.service');
        let linkedAccountId = null;
        try {
            const linkedAccount = await razorpayService.createLinkedAccount({
                name: user.name,
                email: user.email,
                accountHolderName: account_name,
                bankAccountNumber: account_number,
                ifsc: ifsc_code
            });
            linkedAccountId = linkedAccount.id;
        } catch (rzpErr) {
            console.error("Razorpay creation failed, but continuing update. Error:", rzpErr.message);
        }

		const query = \`
      UPDATE owners 
      SET account_name = $1, account_number = $2, ifsc_code = $3, bank_name = $4, razorpay_linked_account_id = COALESCE($5, razorpay_linked_account_id), updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $6
      RETURNING account_name, account_number, ifsc_code, bank_name
    \`;
		const result = await db.query(query, [account_name, account_number, ifsc_code, bank_name, linkedAccountId, userId]);
		return res.status(200).json({
			success: true,
			message: 'Account details updated successfully',
			data: result.rows[0]
		});
	} catch (err) {
		console.error('Update Account Details Error:', err);
		return res.status(500).json({
			success: false,
			message: err.message || 'Internal server error'
		});
	}
};

module.exports = {
	createTurf,
	getOwnerTurfs,
	updateTurf,
	deleteTurf,
	addTurfImage,
	deleteTurfImage,
	getOwnerBookings,
	getOwnerDashboardStats,
	getOwnerProfile,
	updateOwnerProfile,
	submitQuery,
	getQueries,
	getAccountDetails,
	updateAccountDetails
};
`;

const index = content.indexOf('const getOwnerDashboardStats = async (req, res) => {');
if (index !== -1) {
    content = content.substring(0, index) + cleanCode;
    fs.writeFileSync(file, content, 'utf8');
    console.log("Fixed owner.controller.js");
} else {
    console.log("Could not find anchor.");
}
