const axios = require('axios');

class RazorpayXService {
  constructor() {
    this.baseUrl = 'https://api.razorpay.com/v1';
  }

  isConfigured() {
    return process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER;
  }

  getAuthHeader() {
    return 'Basic ' + Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64');
  }

  // Composite API for Payouts
  async createCompositePayout({ accountHolderName, bankAccountNumber, ifsc, amount, referenceId, narration }) {
    if (!this.isConfigured()) {
      throw new Error('RazorpayX is not configured (missing RAZORPAYX_ACCOUNT_NUMBER or API keys).');
    }

    const payload = {
      account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
      amount: amount, // amount in paise
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      fund_account: {
        account_type: "bank_account",
        bank_account: {
          name: accountHolderName,
          ifsc: ifsc,
          account_number: bankAccountNumber
        },
        contact: {
          name: accountHolderName,
          type: "vendor",
          reference_id: referenceId,
          notes: {
            "type": "turf_owner"
          }
        }
      },
      queue_if_low_balance: true,
      reference_id: referenceId,
      narration: narration || "Turf Booking Payout"
    };

    try {
      const response = await axios.post(`${this.baseUrl}/payouts`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader()
        }
      });
      return response.data;
    } catch (error) {
      console.error('RazorpayX Payout Error:', error.response ? error.response.data : error.message);
      throw error;
    }
  }
}

module.exports = new RazorpayXService();
