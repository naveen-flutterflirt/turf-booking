const { connection: redisClient } = require('../utils/notificationQueue');

const cacheMiddleware = (durationInSeconds) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    // Use the URL as the cache key. e.g., /customer/app-settings
    const key = `cache:${req.originalUrl || req.url}`;
    
    try {
      const cachedResponse = await redisClient.get(key);
      if (cachedResponse) {
        return res.status(200).json(JSON.parse(cachedResponse));
      } else {
        // Intercept res.json to save the response to Redis
        const originalJson = res.json;
        res.json = function (body) {
          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            redisClient.set(key, JSON.stringify(body), 'EX', durationInSeconds);
          }
          return originalJson.call(this, body);
        };
        next();
      }
    } catch (err) {
      console.error('Redis Cache Error:', err);
      // If Redis fails, just proceed normally without crashing
      next();
    }
  };
};

module.exports = { cacheMiddleware };
