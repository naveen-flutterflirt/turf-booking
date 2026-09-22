const db = require('../config/db');
const razorpayService = require('../services/razorpay.service');

const razorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  if (!signature || !req.rawBody) {
    return res.status(400).json({ success: false, message: 'Missing signature or raw body' });
  }

  try {
    // 1. Verify Signature
    const isValid = razorpayService.verifyWebhookSignature(req.rawBody, signature);

    if (!isValid) {
      console.warn('Webhook signature mismatch!');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    // 2. Parse Event
    const event = req.body;
    console.log(`Received verified Razorpay Webhook Event: ${event.event}`);

    // 3. Handle 'order.paid' or 'payment.captured'
    if (event.event === 'order.paid' || event.event === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;
      const paymentMethod = paymentEntity.method || 'unknown';

      if (!orderId) {
        return res.status(200).send('OK'); // Acknowledge to prevent retries
      }

      // 4. Update the Booking Status if it is PAYMENT_PENDING
      const updateQuery = `
        UPDATE bookings 
        SET status = 'CONFIRMED', 
            razorpay_payment_id = $1, 
            razorpay_signature = 'webhook_verified', 
            payment_method = $2,
            updated_at = CURRENT_TIMESTAMP 
        WHERE razorpay_order_id = $3 AND status = 'PAYMENT_PENDING'
        RETURNING id, status
      `;
      
      const result = await db.query(updateQuery, [paymentId, paymentMethod, orderId]);
      
      if (result.rows.length > 0) {
        console.log(`Webhook successfully updated ${result.rows.length} bookings for order ${orderId} to CONFIRMED!`);
        
        // --- TRIGGER ASYNC PAYOUT ---
        // Push each confirmed booking to the payout queue
        for (const row of result.rows) {
          try {
            const { payoutQueue } = require('../utils/payoutQueue');
            await payoutQueue.add('processPayout', { bookingId: row.id }, {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000 // 5 seconds
              }
            });
            console.log(`Added booking ${row.id} to PayoutQueue`);
          } catch (qErr) {
            console.error(`Failed to add booking ${row.id} to PayoutQueue:`, qErr);
          }
        }

        // --- NOTIFICATION TRIGGER ---
        // Notify Owner
        try {
          const ownerQuery = `
            SELECT o.user_id 
            FROM bookings b 
            JOIN turfs t ON b.turf_id = t.id 
            JOIN owners o ON t.owner_id = o.id 
            WHERE b.razorpay_order_id = $1 LIMIT 1
          `;
          const ownerRes = await db.query(ownerQuery, [orderId]);
          if (ownerRes.rows.length > 0) {
            const ownerUserId = ownerRes.rows[0].user_id;
            const title = 'Payment Received';
            const message = `A new payment was received for order ${orderId}.`;
            await db.query(
              "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
              [ownerUserId, title, message, 'PAYMENT']
            );
          }
        } catch (notifErr) {
          console.error('Failed to send webhook notification:', notifErr);
        }
      } else {
        console.log(`Webhook processed order ${orderId}, but no pending bookings were found (may have been verified by app already).`);
      }
    }

    // Always return 200 OK to acknowledge receipt, otherwise Razorpay keeps retrying for 24 hours
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(500).send('Internal Server Error');
  }
};

module.exports = { razorpayWebhook };
