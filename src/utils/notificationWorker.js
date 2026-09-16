const { Worker } = require('bullmq');
const { app, getMessaging } = require('./firebase');
const { connection } = require('./notificationQueue');

const notificationWorker = new Worker(
  'NotificationQueue',
  async (job) => {
    const { tokens, payload, adminId, turfId } = job.data;
    
    if (!tokens || tokens.length === 0) {
      console.log(`Job ${job.id}: No tokens to process.`);
      return { success: true, count: 0 };
    }

    try {
      console.log(`Job ${job.id}: Sending push notification to ${tokens.length} devices...`);
      
      // Multicast limit is 500 tokens per call. The controller should ideally pre-chunk,
      // but if not, firebase sendEachForMulticast can handle an array up to 500.
      const messaging = getMessaging(app);
      const response = await messaging.sendEachForMulticast({
        tokens: tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
      });

      console.log(`Job ${job.id}: Success: ${response.successCount}, Failed: ${response.failureCount}`);
      
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`Token ${tokens[idx]} failed: ${resp.error}`);
            // Logic to remove dead tokens from DB can be added here
          }
        });
      }

      return { success: true, successCount: response.successCount };
    } catch (err) {
      console.error(`Job ${job.id} Error:`, err);
      // Re-throw to allow BullMQ to retry the job
      throw err;
    }
  },
  { 
    connection,
    // Add simple exponential backoff for failed jobs
    settings: {
      backoffStrategies: {
        exponential: function (attemptsMade, err) {
          return Math.pow(2, attemptsMade) * 1000;
        }
      }
    }
  }
);

notificationWorker.on('completed', (job) => {
  console.log(`Notification Job ${job.id} completed successfully`);
});

notificationWorker.on('failed', (job, err) => {
  console.log(`Notification Job ${job.id} failed with error ${err.message}`);
});

module.exports = notificationWorker;
