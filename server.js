require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const authRoutes = require('./src/routes/auth.routes');
const ownerRoutes = require('./src/routes/owner.routes');
const adminRoutes = require('./src/routes/admin.routes');
const customerRoutes = require('./src/routes/customer.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const feedbackRoutes = require('./src/routes/feedback.routes');
const communityRoutes = require('./src/routes/community.routes');
const {
	initSocket
} = require('./src/config/socket');
const http = require('http');
// Initialize background workers
require('./src/utils/notificationWorker');
// require('./src/utils/payoutWorker'); // TODO: enable when payout is ready
require('./src/utils/bookingCron');
const app = express();
// Set security HTTP headers
app.use(helmet());
// Global API Rate Limiting: Max 150 requests per minute per IP
const globalLimiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 150,
	message: {
		success: false,
		message: 'Too many requests from this IP, please try again after a minute.'
	},
	standardHeaders: true,
	legacyHeaders: false,
});
app.use(globalLimiter);
const httpServer = http.createServer(app);
// Initialize Socket.io
initSocket(httpServer);
// Secure CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'https://turf-admin-dashboard-six.vercel.app']; // default local dev ports and production admin panel
app.use(cors({
	origin: function(origin, callback) {
		// Allow requests with no origin (like your Mobile App, Postman, or curl)
		if (!origin) return callback(null, true);
		// Allow if the origin is in our list, or if we are not in production
		if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
			callback(null, true);
		} else {
			callback(new Error('Blocked by CORS Policy: This domain is not allowed'));
		}
	},
	credentials: true
}));
app.use(compression());
app.use(express.urlencoded({
	extended: true
}));
// Capture raw body for Razorpay webhooks before parsing JSON
app.use(express.json({
	verify: (req, res, buf) => {
		req.rawBody = buf;
	}
}));
// --- ROUTES ---
// Health check
app.get('/health', (req, res) => {
	res.json({
		success: true,
		message: 'Server is running'
	});
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
// --- GLOBAL ERROR HANDLER ---
// Catch all unhandled errors so Express doesn't leak HTML stack traces
app.use((err, req, res, next) => {
	console.error('Unhandled Global Error:', err);
	res.status(err.status || 500).json({
		success: false,
		message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
	});
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
