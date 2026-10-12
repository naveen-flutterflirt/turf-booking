const db = require('../config/db');
const turfRepo = require('../repositories/turf.repository');
const ownerRepo = require('../repositories/owner.repository');
const userRepo = require('../repositories/user.repository');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createTurf = async (userId, body) => {
  const { name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time, sports, amenities, images } = body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ownerResult = await ownerRepo.findOwnerByUserIdClient(client, userId);
    if (ownerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Owner profile not found'); err.status = 404; throw err;
    }
    const ownerId = ownerResult.rows[0].id;

    const turfResult = await turfRepo.insertTurf(client, [ownerId, name, description, address, city, state, pincode, latitude || null, longitude || null, price_per_hour, opening_time, closing_time]);
    const newTurf = turfResult.rows[0];

    // Link sports
    let parsedSports = sports;
    if (typeof sports === 'string') {
      try { parsedSports = JSON.parse(sports); }
      catch (e) { parsedSports = sports.split(',').map(s => s.trim()).filter(Boolean); }
    }
    if (parsedSports && Array.isArray(parsedSports) && parsedSports.length > 0) {
      for (let sportItem of parsedSports) {
        if (typeof sportItem === 'object' && sportItem !== null) { sportItem = sportItem.id || sportItem.name; }
        if (typeof sportItem === 'string') sportItem = sportItem.trim();
        if (!sportItem) continue;

        let sportId = sportItem;
        if (!UUID_REGEX.test(sportItem)) {
          const sportResult = await turfRepo.findSportByName(client, sportItem);
          if (sportResult.rows.length > 0) {
            sportId = sportResult.rows[0].id;
          } else {
            const newSport = await turfRepo.insertSport(client, sportItem);
            sportId = newSport.rows[0].id;
          }
        }
        await turfRepo.linkTurfSport(client, newTurf.id, sportId);
      }
    }

    // Link amenities
    let parsedAmenities = amenities;
    if (typeof amenities === 'string') {
      try { parsedAmenities = JSON.parse(amenities); }
      catch (e) { parsedAmenities = amenities.split(',').map(a => a.trim()).filter(Boolean); }
    }
    if (parsedAmenities && Array.isArray(parsedAmenities) && parsedAmenities.length > 0) {
      for (let amenityItem of parsedAmenities) {
        if (typeof amenityItem === 'object' && amenityItem !== null) { amenityItem = amenityItem.id || amenityItem.name; }
        if (typeof amenityItem === 'string') amenityItem = amenityItem.trim();
        if (!amenityItem) continue;

        let amenityId = amenityItem;
        if (!UUID_REGEX.test(amenityItem)) {
          const amenityResult = await turfRepo.findAmenityByName(client, amenityItem);
          if (amenityResult.rows.length > 0) {
            amenityId = amenityResult.rows[0].id;
          } else {
            const newAmenity = await turfRepo.insertAmenity(client, amenityItem);
            amenityId = newAmenity.rows[0].id;
          }
        }
        await turfRepo.linkTurfAmenity(client, newTurf.id, amenityId);
      }
    }

    // Insert images
    let parsedImages = images;
    if (typeof images === 'string') { try { parsedImages = JSON.parse(images); } catch (e) { parsedImages = [images]; } }
    let sortOrder = 0;
    const uploadedImages = [];
    if (parsedImages && Array.isArray(parsedImages)) {
      for (const img of parsedImages) {
        if (sortOrder >= 10) break;
        const imgUrl = (typeof img === 'string' ? img : (img?.url || img?.image_url || '')).trim();
        const imgKey = typeof img === 'object' ? (img?.key || img?.s3_key || null) : null;
        if (!imgUrl) continue;
        const imgRes = await turfRepo.insertTurfImage(client, { turfId: newTurf.id, url: imgUrl, key: imgKey, sortOrder });
        uploadedImages.push(imgRes.rows[0]);
        sortOrder++;
      }
    }

    // Notify admin
    const adminRes = await userRepo.findAdminUser();
    if (adminRes.rows.length > 0) {
      await client.query("INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
        [adminRes.rows[0].id, 'New Turf Pending Approval', `${name} is waiting for your review.`, 'TURF_APPROVAL']);
    }

    await client.query('COMMIT');
    newTurf.sports = sports || [];
    newTurf.amenities = amenities || [];
    newTurf.images = uploadedImages;
    return newTurf;
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

const getOwnerTurfs = async (userId) => {
  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  const turfResult = await turfRepo.getOwnerTurfs(ownerResult.rows[0].id);
  return turfResult.rows;
};

const updateTurf = async (userId, turfId, body) => {
  const { name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time, is_open, images, sports, amenities } = body;

  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  const ownerId = ownerResult.rows[0].id;

  const turfCheck = await turfRepo.checkTurfOwnership(turfId, ownerId);
  if (turfCheck.rows.length === 0) { const err = new Error('Turf not found or you do not have permission to edit it'); err.status = 404; throw err; }

  await turfRepo.updateTurf(turfId, ownerId, { name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time, is_open });

  // Update sports
  let parsedSports = sports;
  if (typeof sports === 'string') {
    try { parsedSports = JSON.parse(sports); }
    catch (e) { parsedSports = sports.split(',').map(s => s.trim()).filter(Boolean); }
  }
  if (parsedSports && Array.isArray(parsedSports)) {
    await turfRepo.deleteTurfSports(turfId);
    for (let sportItem of parsedSports) {
      if (typeof sportItem === 'object' && sportItem !== null) { sportItem = sportItem.id || sportItem.name; }
      if (typeof sportItem === 'string') sportItem = sportItem.trim();
      if (!sportItem) continue;

      let sportId = sportItem;
      if (!UUID_REGEX.test(sportItem)) {
        const sportResult = await db.query('SELECT id FROM sports WHERE name ILIKE $1', [sportItem]);
        if (sportResult.rows.length > 0) {
          sportId = sportResult.rows[0].id;
        } else {
          const newSport = await db.query(
            'INSERT INTO sports (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
            [sportItem]
          );
          sportId = newSport.rows[0].id;
        }
      }
      await db.query('INSERT INTO turf_sports (turf_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [turfId, sportId]);
    }
  }

  // Update amenities
  let parsedAmenities = amenities;
  if (typeof amenities === 'string') {
    try { parsedAmenities = JSON.parse(amenities); }
    catch (e) { parsedAmenities = amenities.split(',').map(a => a.trim()).filter(Boolean); }
  }
  if (parsedAmenities && Array.isArray(parsedAmenities)) {
    await turfRepo.deleteTurfAmenities(turfId);
    for (let amenityItem of parsedAmenities) {
      if (typeof amenityItem === 'object' && amenityItem !== null) { amenityItem = amenityItem.id || amenityItem.name; }
      if (typeof amenityItem === 'string') amenityItem = amenityItem.trim();
      if (!amenityItem) continue;

      let amenityId = amenityItem;
      if (!UUID_REGEX.test(amenityItem)) {
        const amenityResult = await db.query('SELECT id FROM amenities WHERE name ILIKE $1', [amenityItem]);
        if (amenityResult.rows.length > 0) {
          amenityId = amenityResult.rows[0].id;
        } else {
          const newAmenity = await db.query(
            'INSERT INTO amenities (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
            [amenityItem]
          );
          amenityId = newAmenity.rows[0].id;
        }
      }
      await db.query('INSERT INTO turf_amenities (turf_id, amenity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [turfId, amenityId]);
    }
  }

  // Sync images
  let parsedImages = images;
  if (typeof images === 'string') {
    try { parsedImages = JSON.parse(images); } catch (e) { parsedImages = [images]; }
  }

  // Only sync if images was explicitly provided as a non-empty array
  if (parsedImages && Array.isArray(parsedImages) && parsedImages.length > 0) {
    const existingImagesRes = await db.query('SELECT * FROM turf_images WHERE turf_id = $1', [turfId]);
    const existingImages = existingImagesRes.rows;

    const incomingItems = parsedImages.map(img => {
      const url = (typeof img === 'string' ? img : (img?.url || img?.image_url || '')).trim();
      const id = (img && typeof img === 'object' && img.id) ? String(img.id) : null;
      const key = (img && typeof img === 'object') ? (img.key || img.s3_key || null) : null;
      return { id, url, key };
    }).filter(item => item.url || item.id);

    const incomingUrls = incomingItems.map(i => i.url).filter(Boolean);
    const incomingIds = incomingItems.map(i => i.id).filter(Boolean);

    // Check if incoming list includes any existing images (i.e. full gallery provided vs only appending new images)
    const hasExistingMatch = existingImages.some(extImg =>
      incomingIds.includes(String(extImg.id)) || incomingUrls.includes(extImg.image_url)
    );

    // If incoming images explicitly includes existing ones, delete existing images that were omitted
    if (hasExistingMatch) {
      const imagesToDelete = existingImages.filter(extImg =>
        !incomingIds.includes(String(extImg.id)) && !incomingUrls.includes(extImg.image_url)
      );

      if (imagesToDelete.length > 0) {
        for (const img of imagesToDelete) {
          if (img.s3_key) {
            try {
              const s3Client = new S3Client({
                region: process.env.AWS_REGION,
                credentials: {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
              });
              await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET || process.env.AWS_S3_AVATAR_BUCKET,
                Key: img.s3_key,
              }));
            } catch (e) {
              console.error('S3 Delete error:', e);
            }
          }
          await db.query('DELETE FROM turf_images WHERE id = $1', [img.id]);
        }
      }
    }

    // Insert new images
    const existingUrls = existingImages.map(img => img.image_url);
    const imagesToInsert = incomingItems.filter(item => item.url && !existingUrls.includes(item.url));

    if (imagesToInsert.length > 0) {
      const orderRes = await turfRepo.getImageMaxOrder(turfId);
      let currentOrder = parseInt(orderRes.rows[0].max_order, 10) + 1;
      for (const img of imagesToInsert) {
        if (!img.url) continue;
        await turfRepo.insertTurfImageSimple(turfId, { url: img.url, key: img.key || null, currentOrder });
        currentOrder++;
      }
    }
  }

  const fullTurf = await turfRepo.getFullTurf(turfId);
  return fullTurf.rows[0];
};

const deleteTurf = async (userId, turfId) => {
  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  const result = await turfRepo.deleteTurf(turfId, ownerResult.rows[0].id);
  if (result.rows.length === 0) { const err = new Error('Turf not found or you do not have permission to delete it'); err.status = 404; throw err; }
};

const addTurfImage = async (userId, turfId, { image_url, s3_key, sort_order }) => {
  const turfCheck = await turfRepo.checkTurfOwnershipByUser(turfId, userId);
  if (turfCheck.rows.length === 0) { const err = new Error('Turf not found or you do not have permission'); err.status = 404; throw err; }
  const countCheck = await turfRepo.countTurfImages(turfId);
  if (parseInt(countCheck.rows[0].count, 10) >= 10) { const err = new Error('Maximum 10 images allowed per turf'); err.status = 400; throw err; }
  const result = await db.query(
    'INSERT INTO turf_images (turf_id, image_url, s3_key, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
    [turfId, image_url, s3_key || null, sort_order || 0]
  );
  return result.rows[0];
};

const deleteTurfImage = async (userId, turfId, imageId) => {
  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  const turfCheck = await turfRepo.checkTurfOwnership(turfId, ownerResult.rows[0].id);
  if (turfCheck.rows.length === 0) { const err = new Error('Turf not found or you do not have permission'); err.status = 404; throw err; }
  const imageResult = await turfRepo.findTurfImage(imageId, turfId);
  if (imageResult.rows.length === 0) { const err = new Error('Image not found'); err.status = 404; throw err; }
  const s3Key = imageResult.rows[0].s3_key;
  if (s3Key) {
    const s3Client = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
    await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET || process.env.AWS_S3_AVATAR_BUCKET, Key: s3Key }));
  }
  await turfRepo.deleteTurfImage(imageId);
};

const getOwnerTurfById = async (userId, turfId) => {
  const ownerResult = await ownerRepo.findOwnerByUserId(userId);
  if (ownerResult.rows.length === 0) { const err = new Error('Owner profile not found'); err.status = 404; throw err; }
  
  const turfCheck = await turfRepo.checkTurfOwnership(turfId, ownerResult.rows[0].id);
  if (turfCheck.rows.length === 0) { const err = new Error('Turf not found or you do not have permission'); err.status = 404; throw err; }

  const fullTurf = await turfRepo.getFullTurf(turfId);
  return fullTurf.rows[0];
};

module.exports = { createTurf, getOwnerTurfs, updateTurf, deleteTurf, addTurfImage, deleteTurfImage, getOwnerTurfById };
