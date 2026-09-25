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
    if (sports && Array.isArray(sports) && sports.length > 0) {
      for (const sportItem of sports) {
        let sportId = sportItem;
        if (!UUID_REGEX.test(sportItem)) {
          const sportResult = await turfRepo.findSportByName(client, sportItem);
          if (sportResult.rows.length > 0) { sportId = sportResult.rows[0].id; } else { continue; }
        }
        await turfRepo.linkTurfSport(client, newTurf.id, sportId);
      }
    }

    // Link amenities
    if (amenities && Array.isArray(amenities) && amenities.length > 0) {
      for (const amenityItem of amenities) {
        let amenityId = amenityItem;
        if (!UUID_REGEX.test(amenityItem)) {
          const amenityResult = await turfRepo.findAmenityByName(client, amenityItem);
          if (amenityResult.rows.length > 0) { amenityId = amenityResult.rows[0].id; }
          else { const newAmenity = await turfRepo.insertAmenity(client, amenityItem); amenityId = newAmenity.rows[0].id; }
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
        if (!img || typeof img.url !== 'string' || !img.url.trim()) continue;
        const imgRes = await turfRepo.insertTurfImage(client, { turfId: newTurf.id, url: img.url, key: img.key || null, sortOrder });
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
  if (sports && Array.isArray(sports)) {
    await turfRepo.deleteTurfSports(turfId);
    for (let sportItem of sports) {
      if (typeof sportItem === 'object' && sportItem !== null) { sportItem = sportItem.id || sportItem.name; }
      let sportId = sportItem;
      if (!UUID_REGEX.test(sportItem)) {
        const sportResult = await db.query('SELECT id FROM sports WHERE name ILIKE $1', [sportItem]);
        if (sportResult.rows.length > 0) { sportId = sportResult.rows[0].id; } else { continue; }
      }
      await db.query('INSERT INTO turf_sports (turf_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [turfId, sportId]);
    }
  }

  // Update amenities
  if (amenities && Array.isArray(amenities)) {
    await turfRepo.deleteTurfAmenities(turfId);
    for (let amenityItem of amenities) {
      if (typeof amenityItem === 'object' && amenityItem !== null) { amenityItem = amenityItem.id || amenityItem.name; }
      let amenityId = amenityItem;
      if (!UUID_REGEX.test(amenityItem)) {
        const amenityResult = await db.query('SELECT id FROM amenities WHERE name ILIKE $1', [amenityItem]);
        if (amenityResult.rows.length > 0) { amenityId = amenityResult.rows[0].id; }
        else { const newAmenity = await db.query('INSERT INTO amenities (name) VALUES ($1) RETURNING id', [amenityItem]); amenityId = newAmenity.rows[0].id; }
      }
      await db.query('INSERT INTO turf_amenities (turf_id, amenity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [turfId, amenityId]);
    }
  }

  // Append images
  let parsedImages = images;
  if (typeof images === 'string') { try { parsedImages = JSON.parse(images); } catch (e) { parsedImages = [images]; } }
  if (parsedImages && Array.isArray(parsedImages) && parsedImages.length > 0) {
    const orderRes = await turfRepo.getImageMaxOrder(turfId);
    let currentOrder = parseInt(orderRes.rows[0].max_order) + 1;
    for (const img of parsedImages) {
      if (!img || typeof img.url !== 'string' || !img.url.trim()) continue;
      await turfRepo.insertTurfImageSimple(turfId, { url: img.url, key: img.key || null, currentOrder });
      currentOrder++;
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

module.exports = { createTurf, getOwnerTurfs, updateTurf, deleteTurf, addTurfImage, deleteTurfImage };
