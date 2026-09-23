const db = require('./src/config/db');

const seedImages = async () => {
  try {
    console.log('Fetching turfs...');
    // We fetch the 10 turfs recently added for the specific owner ID
    const { rows: turfs } = await db.query(`
      SELECT id, name FROM turfs 
      WHERE owner_id = '543a1560-0691-410d-9338-441822d292d0'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (turfs.length === 0) {
      console.log('No turfs found for this owner.');
      return;
    }

    const imageUrls = [
      'https://images.unsplash.com/photo-1552318965-6e6be348d52e?auto=format&fit=crop&w=1000&q=80', // turf 1
      'https://images.unsplash.com/photo-1518605368461-1ee125225f16?auto=format&fit=crop&w=1000&q=80', // turf 2
      'https://images.unsplash.com/photo-1524015368236-bbf6f72745b6?auto=format&fit=crop&w=1000&q=80', // turf 3
      'https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?auto=format&fit=crop&w=1000&q=80', // turf 4
      'https://images.unsplash.com/photo-1508344928928-7165b67de128?auto=format&fit=crop&w=1000&q=80', // turf 5
      'https://images.unsplash.com/photo-1431324155629-1a6fc1ac5e73?auto=format&fit=crop&w=1000&q=80', // turf 6
      'https://images.unsplash.com/photo-1624880357913-a8539238245b?auto=format&fit=crop&w=1000&q=80', // turf 7
      'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1000&q=80', // turf 8
      'https://images.unsplash.com/photo-1600679472829-3044539ce8ed?auto=format&fit=crop&w=1000&q=80', // turf 9
      'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1000&q=80'  // turf 10
    ];

    console.log(`Found ${turfs.length} turfs. Adding images...`);

    let count = 0;
    for (let i = 0; i < turfs.length; i++) {
      const turf = turfs[i];
      // Pick 1 or 2 images per turf based on the index to provide some variety
      // I'll add 1 main image for each turf using the predefined list above
      const mainImage = imageUrls[i % imageUrls.length];
      
      await db.query(`
        INSERT INTO turf_images (turf_id, image_url, sort_order)
        VALUES ($1, $2, $3)
      `, [turf.id, mainImage, 1]);
      
      count++;
    }

    console.log(`Successfully inserted ${count} images across all turfs!`);
  } catch (err) {
    console.error('Error inserting images:', err);
  } finally {
    db.pool.end();
  }
};

seedImages();
