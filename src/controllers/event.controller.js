const db = require('../config/db');
const razorpayService = require('../services/razorpay.service');
const bookingRepo = require('../repositories/booking.repository');
const turfRepo = require('../repositories/turf.repository');

exports.createEvent = async (req, res) => {
	try {
		const { name, description, turf_id, date, start_time, end_time, max_players, total_price, upi_id } = req.body;
		const creator_id = req.user.id; // From auth middleware

		if (!name || !turf_id || !date || !start_time || !end_time || !max_players || !total_price || !upi_id) {
			return res.status(400).json({ success: false, message: 'Missing required fields' });
		}

		const price_per_person = (total_price / max_players).toFixed(2);

		const client = await db.pool.connect();
		try {
			await client.query('BEGIN');
			// Get turf details to find Razorpay linked account
			const turfResult = await client.query('SELECT t.*, o.razorpay_linked_account_id FROM turfs t JOIN owners o ON t.owner_id = o.id WHERE t.id = $1', [turf_id]);
			if (turfResult.rows.length === 0) {
				await client.query('ROLLBACK');
				return res.status(404).json({ success: false, message: 'Turf not found' });
			}
			const turf = turfResult.rows[0];

			// Create Razorpay Order
			let order;
			try {
				const shortReceipt = `evt_${creator_id.substring(0, 8)}_${Date.now()}`;
				let transfers = null;
				if (turf.razorpay_linked_account_id) {
					transfers = [{
						account: turf.razorpay_linked_account_id,
						amount: Math.floor(parseFloat(total_price) * 100 * 0.90), // 90% goes to vendor
						currency: "INR",
						notes: { name: "Event Turf Booking Split" },
						on_hold: 0
					}];
				}
				order = await razorpayService.createOrder(parseFloat(total_price), shortReceipt, transfers);
			} catch (error) {
				await client.query('ROLLBACK');
				return res.status(500).json({ success: false, message: error.message || 'Payment gateway error.' });
			}

			// Insert Event as PENDING
			const result = await client.query(
				`INSERT INTO events (name, description, turf_id, creator_id, date, start_time, end_time, max_players, total_price, price_per_person, upi_id, status)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PAYMENT_PENDING') RETURNING *`,
				[name, description || null, turf_id, creator_id, date, start_time, end_time, max_players, total_price, price_per_person, upi_id]
			);
			
			await client.query('COMMIT');

			res.status(201).json({ 
				success: true, 
				message: 'Payment pending. Proceed to pay.', 
				data: result.rows[0],
				order_id: order.id,
				amount: order.amount,
				currency: order.currency
			});
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	} catch (error) {
		console.error('Error creating event:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.verifyEventPayment = async (req, res) => {
	const { event_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
	const user_id = req.user.id;

	if (!event_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
		return res.status(400).json({ success: false, message: 'Missing payment verification details' });
	}

	try {
		const isValidSignature = razorpayService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
		if (!isValidSignature) {
			return res.status(400).json({ success: false, message: 'Invalid payment signature' });
		}

		let paymentMethod = 'unknown';
		const paymentDetails = await razorpayService.fetchPaymentDetails(razorpay_payment_id);
		if (paymentDetails && paymentDetails.method) { paymentMethod = paymentDetails.method; }

		const client = await db.pool.connect();
		try {
			await client.query('BEGIN');
			
			// Verify Event
			const eventResult = await client.query('SELECT * FROM events WHERE id = $1 AND creator_id = $2', [event_id, user_id]);
			if (eventResult.rows.length === 0) {
				await client.query('ROLLBACK');
				return res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
			}
			const event = eventResult.rows[0];

			if (event.status !== 'PAYMENT_PENDING') {
				await client.query('ROLLBACK');
				return res.status(400).json({ success: false, message: 'Event is not pending payment' });
			}

			// Find an active sport for this turf to link the booking to (since we don't have a specific sport_id)
			const sportResult = await client.query('SELECT sport_id FROM turf_sports WHERE turf_id = $1 LIMIT 1', [event.turf_id]);
			const dummySportId = sportResult.rows.length > 0 ? sportResult.rows[0].sport_id : null;

			if (!dummySportId) {
				await client.query('ROLLBACK');
				return res.status(400).json({ success: false, message: 'Turf has no sports assigned.' });
			}

			// Calculate slot properly (formatting for Booking table)
			let st = event.start_time; if (st.length === 5) st += ':00';
			let et = event.end_time; if (et.length === 5) et += ':00';

			// Insert confirmed booking for this slot
			await client.query(`
				INSERT INTO bookings (customer_id, turf_id, sport_id, booking_date, start_time, end_time, subtotal, total_price, status, payment_method, razorpay_order_id, razorpay_payment_id, razorpay_signature)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED', $9, $10, $11, $12)
			`, [user_id, event.turf_id, dummySportId, event.date, st, et, event.total_price, event.total_price, paymentMethod, razorpay_order_id, razorpay_payment_id, razorpay_signature]);

			// Update event status to PENDING (waiting for owner approval)
			const updatedEvent = await client.query(
				`UPDATE events SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
				[event.id]
			);

			await client.query('COMMIT');
			
			return res.status(200).json({
				success: true,
				message: 'Event payment verified successfully. Event is now pending Owner Approval!',
				data: updatedEvent.rows[0]
			});
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	} catch (error) {
		console.error('Error verifying event payment:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.updateEvent = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, description, turf_id, date, start_time, end_time, max_players, total_price, upi_id } = req.body;
		const user_id = req.user.id;

		// Check if event exists and belongs to the user
		const eventCheck = await db.query('SELECT * FROM events WHERE id = $1 AND creator_id = $2', [id, user_id]);
		if (eventCheck.rows.length === 0) {
			return res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
		}

		if (!name || !turf_id || !date || !start_time || !end_time || !max_players || !total_price || !upi_id) {
			return res.status(400).json({ success: false, message: 'Missing required fields' });
		}

		const price_per_person = (total_price / max_players).toFixed(2);

		const result = await db.query(
			`UPDATE events 
             SET name = $1, description = $2, turf_id = $3, date = $4, start_time = $5, end_time = $6, max_players = $7, total_price = $8, price_per_person = $9, upi_id = $10, updated_at = CURRENT_TIMESTAMP
             WHERE id = $11 RETURNING *`,
			[name, description || null, turf_id, date, start_time, end_time, max_players, total_price, price_per_person, upi_id, id]
		);

		res.status(200).json({ success: true, data: result.rows[0] });
	} catch (error) {
		console.error('Error updating event:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.deleteEvent = async (req, res) => {
	try {
		const { id } = req.params;
		const user_id = req.user.id;

		// Check if event exists and belongs to the user
		const eventCheck = await db.query('SELECT * FROM events WHERE id = $1 AND creator_id = $2', [id, user_id]);
		if (eventCheck.rows.length === 0) {
			return res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
		}

		// Delete the event
		await db.query('DELETE FROM events WHERE id = $1', [id]);

		res.status(200).json({ success: true, message: 'Event deleted successfully' });
	} catch (error) {
		console.error('Error deleting event:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.getAllEvents = async (req, res) => {
	try {
		// Fetch events and join with turfs and sports to get names
		const result = await db.query(
			`SELECT e.*, t.name as turf_name, t.address, s.name as sport_name, u.name as creator_name,
              (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id AND ep.status = 'APPROVED') as current_players
       FROM events e
       JOIN turfs t ON e.turf_id = t.id
       LEFT JOIN sports s ON e.sport_id = s.id
       JOIN users u ON e.creator_id = u.id
       WHERE e.status = 'OPEN' AND e.date >= CURRENT_DATE
       ORDER BY e.date ASC, e.start_time ASC`
		);

		res.status(200).json({ success: true, data: result.rows });
	} catch (error) {
		console.error('Error fetching events:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.joinEvent = async (req, res) => {
	try {
		const { id } = req.params;
		const { payment_transaction_id } = req.body;
		const user_id = req.user.id;

		if (!payment_transaction_id) {
			return res.status(400).json({ success: false, message: 'Transaction ID is required' });
		}

		// Check if event is open
		const eventCheck = await db.query('SELECT * FROM events WHERE id = $1 AND status = $2', [id, 'OPEN']);
		if (eventCheck.rows.length === 0) {
			return res.status(404).json({ success: false, message: 'Event not found or closed' });
		}
		
		const event = eventCheck.rows[0];

		// Check if user is creator
		if (event.creator_id === user_id) {
			return res.status(400).json({ success: false, message: 'Creator cannot join their own event' });
		}

		// Insert participant
		const result = await db.query(
			`INSERT INTO event_participants (event_id, user_id, payment_transaction_id, status)
       VALUES ($1, $2, $3, 'PENDING') RETURNING *`,
			[id, user_id, payment_transaction_id]
		);

		res.status(201).json({ success: true, data: result.rows[0], message: 'Join request sent successfully' });
	} catch (error) {
		if (error.code === '23505') { // Unique violation
			return res.status(400).json({ success: false, message: 'You have already requested to join this event' });
		}
		console.error('Error joining event:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.approveParticipant = async (req, res) => {
	try {
		const { eventId, participantId } = req.params;
		const creator_id = req.user.id;

		// Verify event ownership
		const eventCheck = await db.query('SELECT * FROM events WHERE id = $1 AND creator_id = $2', [eventId, creator_id]);
		if (eventCheck.rows.length === 0) {
			return res.status(403).json({ success: false, message: 'Unauthorized or event not found' });
		}

		// Update participant status
		const result = await db.query(
			`UPDATE event_participants SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND event_id = $2 RETURNING *`,
			[participantId, eventId]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ success: false, message: 'Participant request not found' });
		}
        
		res.status(200).json({ success: true, message: 'Participant approved successfully' });
	} catch (error) {
		console.error('Error approving participant:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.rejectParticipant = async (req, res) => {
	try {
		const { eventId, participantId } = req.params;
		const creator_id = req.user.id;

		// Verify event ownership
		const eventCheck = await db.query('SELECT * FROM events WHERE id = $1 AND creator_id = $2', [eventId, creator_id]);
		if (eventCheck.rows.length === 0) {
			return res.status(403).json({ success: false, message: 'Unauthorized or event not found' });
		}

		const result = await db.query(
			`UPDATE event_participants SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND event_id = $2 RETURNING *`,
			[participantId, eventId]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ success: false, message: 'Participant request not found' });
		}
        
		res.status(200).json({ success: true, message: 'Participant rejected successfully' });
	} catch (error) {
		console.error('Error rejecting participant:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.getEventParticipants = async (req, res) => {
	try {
		const { eventId } = req.params;
		const creator_id = req.user.id;

		// Verify event ownership
		const eventCheck = await db.query('SELECT * FROM events WHERE id = $1 AND creator_id = $2', [eventId, creator_id]);
		if (eventCheck.rows.length === 0) {
			return res.status(403).json({ success: false, message: 'Unauthorized or event not found' });
		}

		const result = await db.query(
			`SELECT ep.id, ep.status, ep.payment_transaction_id, ep.created_at, u.name, u.phone 
             FROM event_participants ep
             JOIN users u ON ep.user_id = u.id
             WHERE ep.event_id = $1
             ORDER BY ep.created_at DESC`,
			[eventId]
		);

		res.status(200).json({ success: true, data: result.rows });
	} catch (error) {
		console.error('Error fetching participants:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.getMyEvents = async (req, res) => {
    try {
        const user_id = req.user.id;
        
        // Events created by user
        const createdEvents = await db.query(
            `SELECT e.*, t.name as turf_name, s.name as sport_name 
             FROM events e
             JOIN turfs t ON e.turf_id = t.id
             LEFT JOIN sports s ON e.sport_id = s.id
             WHERE e.creator_id = $1
             ORDER BY e.date DESC`, [user_id]
        );
        
        // Events joined by user
        const joinedEvents = await db.query(
            `SELECT e.*, t.name as turf_name, s.name as sport_name, ep.status as join_status, ep.payment_transaction_id
             FROM events e
             JOIN event_participants ep ON e.id = ep.event_id
             JOIN turfs t ON e.turf_id = t.id
             LEFT JOIN sports s ON e.sport_id = s.id
             WHERE ep.user_id = $1
             ORDER BY e.date DESC`, [user_id]
        );
        
        res.status(200).json({ 
            success: true, 
            data: {
                created: createdEvents.rows,
                joined: joinedEvents.rows
            }
        });
    } catch(error) {
        console.error('Error fetching my events:', error);
		res.status(500).json({ success: false, message: 'Server error' });
    }
};

// --- OWNER SPECIFIC METHODS ---

exports.getOwnerPendingEvents = async (req, res) => {
	try {
		const owner_user_id = req.user.id;

		// Fetch the owner record
		const ownerCheck = await db.query('SELECT id FROM owners WHERE user_id = $1', [owner_user_id]);
		if (ownerCheck.rows.length === 0) {
			return res.status(403).json({ success: false, message: 'You are not registered as an owner' });
		}
		const owner_id = ownerCheck.rows[0].id;

		// Fetch pending events for turfs owned by this owner
		const result = await db.query(
			`SELECT e.*, t.name as turf_name, s.name as sport_name, u.name as creator_name, u.phone as creator_phone
             FROM events e
             JOIN turfs t ON e.turf_id = t.id
             LEFT JOIN sports s ON e.sport_id = s.id
             JOIN users u ON e.creator_id = u.id
             WHERE t.owner_id = $1 AND e.status = 'PENDING'
             ORDER BY e.created_at DESC`, [owner_id]
		);

		res.status(200).json({ success: true, data: result.rows });
	} catch (error) {
		console.error('Error fetching owner events:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

exports.ownerApproveEvent = async (req, res) => {
	try {
		const { id } = req.params;
		const { status } = req.body; // 'OPEN' to approve, 'CANCELLED' to reject
		const owner_user_id = req.user.id;

		if (!['OPEN', 'CANCELLED'].includes(status)) {
			return res.status(400).json({ success: false, message: 'Invalid status. Must be OPEN or CANCELLED' });
		}

		// Verify owner owns the turf associated with this event
		const eventCheck = await db.query(
			`SELECT e.* FROM events e 
             JOIN turfs t ON e.turf_id = t.id 
             JOIN owners o ON t.owner_id = o.id 
             WHERE e.id = $1 AND o.user_id = $2`, 
			[id, owner_user_id]
		);

		if (eventCheck.rows.length === 0) {
			return res.status(403).json({ success: false, message: 'Unauthorized or event not found' });
		}

		// Update event status
		const result = await db.query(
			`UPDATE events SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
			[status, id]
		);

		res.status(200).json({ success: true, message: `Event ${status === 'OPEN' ? 'approved' : 'rejected'} successfully`, data: result.rows[0] });
	} catch (error) {
		console.error('Error approving event:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
};
