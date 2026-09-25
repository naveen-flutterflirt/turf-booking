const bookingRepo = require('../repositories/booking.repository');
const notificationRepo = require('../repositories/notification.repository');
const adminRepo = require('../repositories/admin.repository');
const razorpayService = require('../services/razorpay.service');
const razorpayWebhook = async (req, res) => {
	const signature = req.headers['x-razorpay-signature'];
	if (!signature || !req.rawBody) return res.status(400).json({
		success: false,
		message: 'Missing signature or raw body'
	});
	try {
		const isValid = razorpayService.verifyWebhookSignature(req.rawBody, signature);
		if (!isValid) {
			console.warn('Webhook signature mismatch!');
			return res.status(400).json({
				success: false,
				message: 'Invalid signature'
			});
		}
		const event = req.body;
		if (event.event === 'order.paid' || event.event === 'payment.captured') {
			const paymentEntity = event.payload.payment.entity;
			const orderId = paymentEntity.order_id;
			const paymentId = paymentEntity.id;
			const paymentMethod = paymentEntity.method || 'unknown';
			if (!orderId) return res.status(200).send('OK');
			const result = await bookingRepo.confirmBookingsByOrderWebhook(orderId, paymentId, paymentMethod);
			if (result.rows.length > 0) {
				console.log(`Webhook successfully updated ${result.rows.length} bookings for order ${orderId} to CONFIRMED!`);
				// TODO: enable payout when ready
				// for (const row of result.rows) {
				// 	try {
				// 		const { payoutQueue } = require('../utils/payoutQueue');
				// 		await payoutQueue.add('processPayout', { bookingId: row.id }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
				// 		console.log(`Added booking ${row.id} to PayoutQueue`);
				// 	} catch (qErr) {
				// 		console.error(`Failed to add booking ${row.id} to PayoutQueue:`, qErr);
				// 	}
				// }
				try {
					const ownerRes = await bookingRepo.getOwnerByBookingOrder(orderId);
					if (ownerRes.rows.length > 0) {
						await notificationRepo.insertNotification(ownerRes.rows[0].user_id, 'Payment Received', `A new payment was received for order ${orderId}.`, 'PAYMENT');
					}
				} catch (notifErr) {
					console.error('Failed to send webhook notification:', notifErr);
				}
			} else {
				console.log(`Webhook processed order ${orderId}, but no pending bookings were found (may have been verified by app already).`);
			}
		}
		return res.status(200).send('OK');
	} catch (err) {
		console.error('Webhook Error:', err);
		return res.status(500).send('Internal Server Error');
	}
};
module.exports = {
	razorpayWebhook
};
