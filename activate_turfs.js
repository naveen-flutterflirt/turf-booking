const db = require('./src/config/db');

const activateTurfs = async () => {
  try {
    const result = await db.query(`
      UPDATE turfs 
      SET status = 'ACTIVE'
    `);
    console.log(`Updated ${result.rowCount} turfs to ACTIVE status.`);
  } catch (err) {
    console.error('Error updating turfs:', err);
  } finally {
    db.pool.end();
  }
};

activateTurfs();
