const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');

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

  async createOrder(amount, receipt, transfers = null) {
    if (!this.isConfigured()) {
      throw new Error('Payment gateway is not configured on this server.');
    }
    const options = {
      amount: amount * 100, // Razorpay works in paise
      currency: "INR",
      receipt: receipt
    };
    if (transfers && transfers.length > 0) {
      options.transfers = transfers;
    }
    return await this.razorpay.orders.create(options);
  }

  async createLinkedAccount({ name, email, accountHolderName, bankAccountNumber, ifsc }) {
    if (!this.isConfigured()) throw new Error('Payment gateway is not configured.');
    const authHeader = 'Basic ' + Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64');
    try {
      const response = await axios.post('https://api.razorpay.com/beta/accounts', {
        name: name || "Vendor",
        email: email || "vendor@example.com",
        tnc_accepted: true,
        account_details: {
          business_name: name || "Vendor Business",
          business_type: "individual"
        },
        bank_account: {
          ifsc_code: ifsc,
          beneficiary_name: accountHolderName,
          account_number: bankAccountNumber
        }
      }, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (err) {
      console.error('Razorpay Linked Account Error:', err.response ? err.response.data : err.message);
      throw new Error('Failed to create Razorpay Linked Account. Check bank details.');
    }
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
