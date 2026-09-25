const adminRepo = require('../repositories/admin.repository');
const notificationRepo = require('../repositories/notification.repository');
const ownerRepo = require('../repositories/owner.repository');
const razorpayService = require('../services/razorpay.service');

const razorpayxWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature || !req.rawBody) return res.status(400).json({ success: false, message: 'Missing signature or raw body' });
  try {
    const isValid = razorpayService.verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) { console.warn('RazorpayX Webhook signature mismatch!'); return res.status(400).json({ success: false, message: 'Invalid signature' }); }

    const event = req.body;
    console.log(`Received verified RazorpayX Webhook Event: ${event.event}`);

    if (['payout.processed', 'payout.failed', 'payout.reversed'].includes(event.event)) {
      const payoutEntity = event.payload.payout.entity;
      const payoutId = payoutEntity.id;
      let newStatus = 'PROCESSING', failureReason = null;
      if (event.event === 'payout.processed') { newStatus = 'SUCCESS'; }
      else if (event.event === 'payout.failed' || event.event === 'payout.reversed') {
        newStatus = 'FAILED';
        failureReason = payoutEntity.failure_reason || payoutEntity.status_details?.reason || 'Unknown failure';
      }

      const result = await adminRepo.updatePayout(payoutId, newStatus, failureReason);
      if (result.rows.length > 0) {
        console.log(`Updated payout ${payoutId} status to ${newStatus}`);
        try {
          const payoutData = result.rows[0];
          const ownerRes = await ownerRepo.findOwnerUserIdById(payoutData.owner_id);
          if (ownerRes.rows.length > 0) {
            const amountInRupees = payoutData.owner_amount / 100;
            const title = newStatus === 'SUCCESS' ? 'Payout Successful' : 'Payout Failed';
            const message = newStatus === 'SUCCESS'
              ? `Your payout of ₹${amountInRupees} has been successfully processed to your bank account.`
              : `Your payout of ₹${amountInRupees} failed. Reason: ${failureReason}`;
            await notificationRepo.insertNotification(ownerRes.rows[0].user_id, title, message, 'PAYMENT');
          }
        } catch (notifErr) { console.error('Failed to send payout notification:', notifErr); }
      } else { console.warn(`Webhook received for payout ${payoutId} but it was not found in our database.`); }
    }
    return res.status(200).send('OK');
  } catch (err) {
    console.error('RazorpayX Webhook Error:', err);
    return res.status(500).send('Internal Server Error');
  }
};

module.exports = { razorpayxWebhook };
