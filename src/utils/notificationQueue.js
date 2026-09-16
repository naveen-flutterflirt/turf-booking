const {
	Queue
} = require('bullmq');
const Redis = require('ioredis');
// Connect using REDIS_URL if available (for Cloud Redis like Upstash), otherwise use local fallback
const connection = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: null
}) : new Redis({
	host: process.env.REDIS_HOST,
	port: process.env.REDIS_PORT,
	maxRetriesPerRequest: null
});
const notificationQueue = new Queue('NotificationQueue', {
	connection
});
module.exports = {
	notificationQueue,
	connection
};
