const cron = require('node-cron');
const db = require('../config/db');

// Run every hour to check for past bookings
cron.schedule('0 * * * *', async () => {
    try {
        console.log('[Cron Job] Checking for past CONFIRMED bookings to mark as COMPLETED...');
        
        // Find bookings where status is 'CONFIRMED' and the booking time has passed
        // We compare the booking_date + start_time with CURRENT_TIMESTAMP
        const query = `
            UPDATE bookings
            SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
            WHERE status = 'CONFIRMED' 
            AND (booking_date + start_time) <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            RETURNING id;
        `;
        
        const result = await db.query(query);
        if (result.rows.length > 0) {
            console.log(`[Cron Job] Marked ${result.rows.length} bookings as COMPLETED.`);
        } else {
            console.log('[Cron Job] No bookings to update.');
        }
    } catch (error) {
        console.error('[Cron Job] Error updating past bookings:', error);
    }
});

console.log('Booking Cron Job initialized.');
