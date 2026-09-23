const db = require('./src/config/db');

const getOwners = async () => {
  try {
    const res = await db.query('SELECT * FROM owners LIMIT 5');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    db.pool.end();
  }
};

getOwners();
