const { Worker } = require('bullmq');
const { connection } = require('./payoutQueue');
const db = require('../config/db');
const razorpayxService = require('../services/razorpayx.service');

const payoutWorker = new Worker('PayoutQueue', async (job) => {
  const { bookingId } = job.data;

  const client = await db.pool.connect();
  try {
    // 1. Get booking and owner details
    const bookingQuery = `
      SELECT b.id, b.total_price, b.status as payment_status, b.razorpay_payment_id,
             t.owner_id, o.account_holder_name, o.bank_account_number, o.ifsc, o.payout_details_completed, o.user_id as owner_user_id
      FROM bookings b
      JOIN turfs t ON b.turf_id = t.id
      JOIN owners o ON t.owner_id = o.id
      WHERE b.id = $1
    `;
    const bookingRes = await client.query(bookingQuery, [bookingId]);
    
    if (bookingRes.rows.length === 0) {
      console.warn(`Payout: Booking ${bookingId} not found`);
      return;
    }
    
    const b = bookingRes.rows[0];

    // Check if payout already processed (Idempotency check)
    const existingPayout = await client.query('SELECT * FROM payouts WHERE booking_id = $1', [bookingId]);
    if (existingPayout.rows.length > 0) {
      console.log(`Payout: Payout for booking ${bookingId} already exists. Skipping.`);
      return;
    }

    if (b.payment_status !== 'CONFIRMED') {
       console.warn(`Payout: Booking ${bookingId} is not confirmed. Skipping payout.`);
       return;
    }

    if (!b.payout_details_completed || !b.account_holder_name || !b.bank_account_number || !b.ifsc) {
      console.warn(`Payout: Owner ${b.owner_id} has incomplete payout details. Creating FAILED payout record.`);
      await client.query(`
        INSERT INTO payouts (booking_id, owner_id, total_amount, platform_commission, owner_amount, status, failure_reason, idempotency_key)
        VALUES ($1, $2, 0, 0, 0, 'FAILED', 'Owner payout details incomplete', $3)
      `, [bookingId, b.owner_id, `payout_${bookingId}`]);
      return;
    }

    // Calculations
    const totalAmountPaise = Math.round(parseFloat(b.total_price) * 100);
    const commissionPercentage = 10;
    const platformCommissionPaise = Math.round((totalAmountPaise * commissionPercentage) / 100);
    const ownerAmountPaise = totalAmountPaise - platformCommissionPaise;

    // Insert INITIAL PROCESSING RECORD
    const idempotencyKey = `payout_${bookingId}`;
    const insertPayout = await client.query(`
      INSERT INTO payouts (booking_id, owner_id, total_amount, platform_commission, owner_amount, razorpay_payment_id, status, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', $7)
      RETURNING id
    `, [bookingId, b.owner_id, totalAmountPaise, platformCommissionPaise, ownerAmountPaise, b.razorpay_payment_id, idempotencyKey]);
    
    const payoutId = insertPayout.rows[0].id;

    // RazorpayX Payout
    try {
      const rxResponse = await razorpayxService.createCompositePayout({
        accountHolderName: b.account_holder_name,
        bankAccountNumber: b.bank_account_number,
        ifsc: b.ifsc,
        amount: ownerAmountPaise,
        referenceId: bookingId,
        narration: `Turf Booking ${bookingId.substring(0,8)}`
      });

      // Update payout with rx tracking ids
      await client.query(`
        UPDATE payouts 
        SET razorpay_payout_id = $1, razorpay_fund_account_id = $2, razorpay_contact_id = $3
        WHERE id = $4
      `, [rxResponse.id, rxResponse.fund_account_id, rxResponse.fund_account?.contact_id, payoutId]);

      console.log(`Payout: Successfully initiated payout for booking ${bookingId}`);
    } catch (rxError) {
      // Mark as failed
      await client.query(`
        UPDATE payouts 
        SET status = 'FAILED', failure_reason = $1
        WHERE id = $2
      `, [JSON.stringify(rxError), payoutId]);
      
      // We don't re-throw because we don't want BullMQ to endlessly retry API errors (like bad bank account).
      // Manual retry will be needed from admin panel
      console.error(`Payout: Failed to initiate payout for booking ${bookingId}`, rxError);
    }

  } catch (error) {
    console.error(`Payout Worker Error for booking ${bookingId}:`, error);
    throw error; // Re-throw to allow BullMQ to retry the job on systemic DB errors
  } finally {
    client.release();
  }
}, { connection });

payoutWorker.on('failed', (job, err) => {
  console.error(`Payout Job ${job.id} failed with error: ${err.message}`);
});

module.exports = payoutWorker;
