const db = require('./src/config/db');

const updateTurf2 = async () => {
  try {
    const turfName = 'Turf Arena 2';
    // Using a very reliable football turf image
    const newImageUrl = 'https://images.unsplash.com/photo-1552318965-6e6be348d52e?auto=format&fit=crop&w=1000&q=80';

    const { rows: turfs } = await db.query(`
      SELECT id FROM turfs WHERE name = $1
    `, [turfName]);

    if (turfs.length > 0) {
      for (const turf of turfs) {
        await db.query(`
          UPDATE turf_images 
          SET image_url = $1
          WHERE turf_id = $2
        `, [newImageUrl, turf.id]);
        console.log(`Updated image for ${turfName}`);
      }
    } else {
      console.log(`${turfName} not found.`);
    }
  } catch (err) {
    console.error('Error updating image:', err);
  } finally {
    db.pool.end();
  }
};

updateTurf2();
