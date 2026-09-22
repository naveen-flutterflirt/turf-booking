const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayService {
  constructor() {
    this.razorpay = null;
    this.init();
  }

  init() {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      this.razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
    }
  }

  isConfigured() {
    return this.razorpay !== null;
  }

  async createOrder(amount, receipt) {
    if (!this.isConfigured()) {
      throw new Error('Payment gateway is not configured on this server.');
    }
    const options = {
      amount: amount * 100, // Razorpay works in paise
      currency: "INR",
      receipt: receipt
    };
    return await this.razorpay.orders.create(options);
  }

  verifyPaymentSignature(orderId, paymentId, signature) {
    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  }

  async fetchPaymentDetails(paymentId) {
    if (!this.isConfigured()) return null;
    try {
      return await this.razorpay.payments.fetch(paymentId);
    } catch (apiErr) {
      console.warn('Could not fetch payment details from Razorpay API:', apiErr);
      return null;
    }
  }

  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return false;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody) // MUST use the raw buffer, not the parsed JSON string
      .digest('hex');

    return expectedSignature === signature;
  }
}

module.exports = new RazorpayService();
