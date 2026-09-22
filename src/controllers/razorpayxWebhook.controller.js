const db = require('../config/db');
const razorpayService = require('../services/razorpay.service');

const razorpayxWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  if (!signature || !req.rawBody) {
    return res.status(400).json({ success: false, message: 'Missing signature or raw body' });
  }

  try {
    // 1. Verify Signature (Uses the same webhook secret conceptually, but make sure the environment matches)
    const isValid = razorpayService.verifyWebhookSignature(req.rawBody, signature);

    if (!isValid) {
      console.warn('RazorpayX Webhook signature mismatch!');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;
    console.log(`Received verified RazorpayX Webhook Event: ${event.event}`);

    // We expect events like: payout.processed, payout.failed, payout.reversed
    if (['payout.processed', 'payout.failed', 'payout.reversed'].includes(event.event)) {
      const payoutEntity = event.payload.payout.entity;
      const payoutId = payoutEntity.id;
      let newStatus = 'PROCESSING';
      let failureReason = null;

      if (event.event === 'payout.processed') {
        newStatus = 'SUCCESS';
      } else if (event.event === 'payout.failed' || event.event === 'payout.reversed') {
        newStatus = 'FAILED';
        failureReason = payoutEntity.failure_reason || payoutEntity.status_details?.reason || 'Unknown failure';
      }

      const updateQuery = `
        UPDATE payouts 
        SET status = $1, failure_reason = $2, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE razorpay_payout_id = $3
        RETURNING *
      `;
      const result = await db.query(updateQuery, [newStatus, failureReason, payoutId]);

      if (result.rows.length > 0) {
        console.log(`Updated payout ${payoutId} status to ${newStatus}`);
        
        // Optional: Notify Owner
        try {
          const payoutData = result.rows[0];
          const ownerRes = await db.query('SELECT user_id FROM owners WHERE id = $1', [payoutData.owner_id]);
          if (ownerRes.rows.length > 0) {
             const ownerUserId = ownerRes.rows[0].user_id;
             let title = '';
             let message = '';
             const amountInRupees = payoutData.owner_amount / 100;

             if (newStatus === 'SUCCESS') {
               title = 'Payout Successful';
               message = `Your payout of ₹${amountInRupees} has been successfully processed to your bank account.`;
             } else {
               title = 'Payout Failed';
               message = `Your payout of ₹${amountInRupees} failed. Reason: ${failureReason}`;
             }

             await db.query(
               "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
               [ownerUserId, title, message, 'PAYMENT']
             );
          }
        } catch (notifErr) {
          console.error('Failed to send payout notification:', notifErr);
        }
      } else {
        console.warn(`Webhook received for payout ${payoutId} but it was not found in our database.`);
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('RazorpayX Webhook Error:', err);
    return res.status(500).send('Internal Server Error');
  }
};

module.exports = { razorpayxWebhook };
