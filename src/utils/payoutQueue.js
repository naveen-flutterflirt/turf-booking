const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: null
}) : new Redis({
	host: process.env.REDIS_HOST,
	port: process.env.REDIS_PORT,
	maxRetriesPerRequest: null
});

const payoutQueue = new Queue('PayoutQueue', {
	connection
});

module.exports = {
	payoutQueue,
	connection
};
