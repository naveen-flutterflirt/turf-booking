const db = require('../config/db');

// Create a new coupon (Admin / Owner)
exports.createCoupon = async (req, res) => {
    try {
        const {
            code,
            discount_type,
            discount_value,
            max_discount_amount,
            min_booking_amount,
            start_date,
            end_date,
            usage_limit,
            user_usage_limit = 1,
            new_users_only = false,
            owner_id = null,
            allowed_user_id = null
        } = req.body;

        // Basic validation
        if (!code || !discount_type || !discount_value || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const query = `
            INSERT INTO coupons (
                code, discount_type, discount_value, max_discount_amount, 
                min_booking_amount, start_date, end_date, usage_limit, 
                user_usage_limit, new_users_only, owner_id, allowed_user_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            ) RETURNING *
        `;
        
        const values = [
            code.toUpperCase(), discount_type, discount_value, max_discount_amount || null,
            min_booking_amount || null, start_date, end_date, usage_limit || null,
            user_usage_limit, new_users_only, owner_id, allowed_user_id
        ];

        const { rows } = await db.query(query, values);
        
        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: rows[0]
        });
    } catch (error) {
        console.error('Error creating coupon:', error);
        if (error.code === '23505') { // Postgres unique constraint violation
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Validate and calculate discount for a customer
exports.validateCoupon = async (req, res) => {
    try {
        const { code, turf_id, subtotal } = req.body;
        const customerId = req.user.id;

        if (!code || !subtotal) {
            return res.status(400).json({ success: false, message: 'Code and subtotal are required' });
        }

        // 1. Fetch coupon
        const couponQuery = `SELECT * FROM coupons WHERE code = $1 AND status = 'ACTIVE'`;
        const { rows: coupons } = await db.query(couponQuery, [code.toUpperCase()]);
        
        if (coupons.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or inactive coupon code.' });
        }
        const coupon = coupons[0];

        // 2. Check Validity Dates
        const now = new Date();
        if (now < new Date(coupon.start_date) || now > new Date(coupon.end_date)) {
            return res.status(400).json({ success: false, message: 'This coupon is expired or not yet active.' });
        }

        // 3. Check Minimum Booking Amount
        if (coupon.min_booking_amount && subtotal < parseFloat(coupon.min_booking_amount)) {
            return res.status(400).json({ success: false, message: `Minimum booking value must be ₹${coupon.min_booking_amount}` });
        }

        // 4. Check Allowed User (VIP Coupon)
        if (coupon.allowed_user_id && coupon.allowed_user_id !== customerId) {
            return res.status(400).json({ success: false, message: 'This coupon is not valid for your account.' });
        }

        // 5. Check New User Only
        if (coupon.new_users_only) {
            const pastBookingsQuery = `SELECT count(*) FROM bookings WHERE customer_id = $1 AND status IN ('CONFIRMED', 'COMPLETED')`;
            const { rows: pastBookings } = await db.query(pastBookingsQuery, [customerId]);
            if (parseInt(pastBookings[0].count) > 0) {
                return res.status(400).json({ success: false, message: 'This coupon is only valid for first-time users.' });
            }
        }

        // 6. Check Global Usage Limit
        if (coupon.usage_limit) {
            const globalUsageQuery = `SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1`;
            const { rows: globalUsage } = await db.query(globalUsageQuery, [coupon.id]);
            if (parseInt(globalUsage[0].count) >= coupon.usage_limit) {
                return res.status(400).json({ success: false, message: 'This coupon has reached its maximum usage limit.' });
            }
        }

        // 7. Check Per-User Usage Limit
        if (coupon.user_usage_limit) {
            const userUsageQuery = `SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1 AND user_id = $2`;
            const { rows: userUsage } = await db.query(userUsageQuery, [coupon.id, customerId]);
            if (parseInt(userUsage[0].count) >= coupon.user_usage_limit) {
                return res.status(400).json({ success: false, message: 'You have already used this coupon the maximum allowed times.' });
            }
        }

        // 8. Calculate Discount
        let discountAmount = 0;
        if (coupon.discount_type === 'FLAT') {
            discountAmount = parseFloat(coupon.discount_value);
        } else if (coupon.discount_type === 'PERCENTAGE') {
            discountAmount = (subtotal * parseFloat(coupon.discount_value)) / 100;
            if (coupon.max_discount_amount && discountAmount > parseFloat(coupon.max_discount_amount)) {
                discountAmount = parseFloat(coupon.max_discount_amount);
            }
        }

        // Ensure discount doesn't exceed subtotal
        if (discountAmount > subtotal) {
            discountAmount = subtotal;
        }

        const finalTotal = subtotal - discountAmount;

        res.status(200).json({
            success: true,
            valid: true,
            coupon_id: coupon.id,
            code: coupon.code,
            discount_amount: discountAmount,
            subtotal: subtotal,
            final_total: finalTotal
        });

    } catch (error) {
        console.error('Error validating coupon:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get all coupons (Admin)
exports.getAllCoupons = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
        res.status(200).json({ success: true, coupons: rows });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get available coupons for a customer to display in the app
exports.getAvailableCoupons = async (req, res) => {
    try {
        const customerId = req.user.id;
        const turfId = req.query.turf_id; // Optional: If they are on a specific turf page

        let query = `
            SELECT id, code, discount_type, discount_value, max_discount_amount, 
                   min_booking_amount, start_date, end_date, new_users_only
            FROM coupons 
            WHERE status = 'ACTIVE' 
            AND end_date >= CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'
            AND start_date <= CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'
            AND (usage_limit IS NULL OR id NOT IN (
                SELECT coupon_id FROM coupon_usages GROUP BY coupon_id HAVING COUNT(*) >= coupons.usage_limit
            ))
            AND (allowed_user_id IS NULL OR allowed_user_id = $1)
            -- Hide if the user has already reached their personal usage limit for this coupon
            AND (user_usage_limit IS NULL OR id NOT IN (
                SELECT coupon_id FROM coupon_usages WHERE user_id = $1 GROUP BY coupon_id HAVING COUNT(*) >= coupons.user_usage_limit
            ))
            -- Hide 'new_users_only' coupons if this user already has confirmed bookings
            AND (new_users_only = FALSE OR $1 NOT IN (
                SELECT customer_id FROM bookings WHERE status IN ('CONFIRMED', 'COMPLETED')
            ))
        `;
        
        const values = [customerId];

        // If frontend passes a turf_id, we can figure out the owner_id to show specific coupons
        if (turfId) {
            query += ` AND (owner_id IS NULL OR owner_id = (SELECT owner_id FROM turfs WHERE id = $2))`;
            values.push(turfId);
        } else {
            // If just browsing home page, only show global coupons
            query += ` AND owner_id IS NULL`;
        }

        query += ` ORDER BY created_at DESC`;

        const { rows: coupons } = await db.query(query, values);
        
        res.status(200).json({ success: true, coupons });
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
