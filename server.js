require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');

const authRoutes = require('./src/routes/auth.routes');
const ownerRoutes = require('./src/routes/owner.routes');
const adminRoutes = require('./src/routes/admin.routes');
const customerRoutes = require('./src/routes/customer.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const feedbackRoutes = require('./src/routes/feedback.routes');
const communityRoutes = require('./src/routes/community.routes');
const { initSocket } = require('./src/config/socket');
const http = require('http');

// Initialize background workers
require('./src/utils/notificationWorker');
// require('./src/utils/payoutWorker'); // TODO: enable when payout is ready
require('./src/utils/bookingCron');

const app = express();

const httpServer = http.createServer(app);

// Initialize Socket.io
initSocket(httpServer);

app.use(cors());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
// Capture raw body for Razorpay webhooks before parsing JSON
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// --- ROUTES ---

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Dummy test API
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test API is working perfectly!',
    timestamp: new Date().toISOString()
  });
});

// Mount modular routes
app.use('/auth', authRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/customer', customerRoutes);
app.use('/customer/feedback', feedbackRoutes);
app.use('/upload', uploadRoutes);
app.use('/notifications', notificationRoutes);
app.use('/owner', ownerRoutes);
app.use('/admin', adminRoutes);
app.use('/community', communityRoutes);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
