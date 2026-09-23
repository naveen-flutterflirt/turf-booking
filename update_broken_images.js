const db = require('./src/config/db');

const updateImages = async () => {
  try {
    const turfsToUpdate = ['Turf Arena 1', 'Turf Arena 2', 'Turf Arena 3', 'Turf Arena 6'];
    
    // New reliable Unsplash image URLs
    const newImages = [
      'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=80', // replacement 1
      'https://images.unsplash.com/photo-1518605368461-1ee125225f16?auto=format&fit=crop&w=1000&q=80', // replacement 2 (maybe this worked before, let's pick another)
      'https://images.unsplash.com/photo-1529900965798-89b251216bc8?auto=format&fit=crop&w=1000&q=80', // replacement 3
      'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1000&q=80', // replacement 4
      'https://images.unsplash.com/photo-1624880357913-a8539238245b?auto=format&fit=crop&w=1000&q=80'  // replacement 5
    ];

    // Let's explicitly define 4 new unique images that are valid football turfs
    const replacementMap = {
      'Turf Arena 1': 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=80',
      'Turf Arena 2': 'https://images.unsplash.com/photo-1529900965798-89b251216bc8?auto=format&fit=crop&w=1000&q=80',
      'Turf Arena 3': 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1000&q=80',
      'Turf Arena 6': 'https://images.unsplash.com/photo-1589487391730-58f20eb2c308?auto=format&fit=crop&w=1000&q=80'
    };

    console.log('Fetching turfs 1, 2, 3, and 6...');
    const { rows: turfs } = await db.query(`
      SELECT id, name FROM turfs 
      WHERE name = ANY($1)
    `, [turfsToUpdate]);

    console.log(`Found ${turfs.length} turfs to update.`);

    let count = 0;
    for (const turf of turfs) {
      const newImageUrl = replacementMap[turf.name];
      
      // Update the image for this turf
      const result = await db.query(`
        UPDATE turf_images 
        SET image_url = $1
        WHERE turf_id = $2
      `, [newImageUrl, turf.id]);
      
      if (result.rowCount > 0) {
        console.log(`Updated image for ${turf.name}`);
        count++;
      } else {
        // If image didn't exist, insert it
        await db.query(`
          INSERT INTO turf_images (turf_id, image_url, sort_order)
          VALUES ($1, $2, $3)
        `, [turf.id, newImageUrl, 1]);
        console.log(`Inserted new image for ${turf.name}`);
        count++;
      }
    }

    console.log(`Successfully updated/inserted images for ${count} turfs!`);
  } catch (err) {
    console.error('Error updating images:', err);
  } finally {
    db.pool.end();
  }
};

updateImages();
