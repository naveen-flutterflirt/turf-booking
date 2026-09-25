const db = require('../config/db');

const insertTurf = (client, values) =>
  client.query(
    `INSERT INTO turfs (owner_id, name, description, address, city, state, pincode, latitude, longitude, price_per_hour, opening_time, closing_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    values
  );

const findSportByName = (client, name) =>
  client.query('SELECT id FROM sports WHERE name ILIKE $1', [name]);

const findAmenityByName = (client, name) =>
  client.query('SELECT id FROM amenities WHERE name ILIKE $1', [name]);

const insertAmenity = (client, name) =>
  client.query('INSERT INTO amenities (name) VALUES ($1) RETURNING id', [name]);

const linkTurfSport = (client, turfId, sportId) =>
  client.query(
    'INSERT INTO turf_sports (turf_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [turfId, sportId]
  );

const linkTurfAmenity = (client, turfId, amenityId) =>
  client.query(
    'INSERT INTO turf_amenities (turf_id, amenity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [turfId, amenityId]
  );

const insertTurfImage = (client, { turfId, url, key, sortOrder }) =>
  client.query(
    'INSERT INTO turf_images (turf_id, image_url, s3_key, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
    [turfId, url, key || null, sortOrder]
  );

const insertTurfImageSimple = (turfId, { url, key, currentOrder }) =>
  db.query(
    'INSERT INTO turf_images (turf_id, image_url, s3_key, sort_order) VALUES ($1, $2, $3, $4)',
    [turfId, url, key || null, currentOrder]
  );

const getOwnerTurfs = (ownerId) =>
  db.query(
    `SELECT t.*,
       COALESCE((SELECT COUNT(b.id) FROM bookings b WHERE b.turf_id = t.id AND b.status = 'CONFIRMED'), 0)::int AS bookings_count,
       COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name)) FROM turf_sports ts JOIN sports s ON ts.sport_id = s.id WHERE ts.turf_id = t.id), '[]') AS sports,
       COALESCE((SELECT json_agg(json_build_object('id', a.id, 'name', a.name)) FROM turf_amenities ta JOIN amenities a ON ta.amenity_id = a.id WHERE ta.turf_id = t.id), '[]') AS amenities,
       COALESCE((SELECT json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 's3_key', ti.s3_key, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC) FROM turf_images ti WHERE ti.turf_id = t.id), '[]') AS images
     FROM turfs t WHERE t.owner_id = $1 ORDER BY t.created_at DESC`,
    [ownerId]
  );

const checkTurfOwnership = (turfId, ownerId) =>
  db.query('SELECT id FROM turfs WHERE id = $1 AND owner_id = $2', [turfId, ownerId]);

const checkTurfOwnershipByUser = (turfId, userId) =>
  db.query(
    `SELECT t.id FROM turfs t JOIN owners o ON t.owner_id = o.id WHERE t.id = $1 AND o.user_id = $2`,
    [turfId, userId]
  );

const updateTurf = (id, ownerId, fields) =>
  db.query(
    `UPDATE turfs SET name = COALESCE($1, name), description = COALESCE($2, description),
       address = COALESCE($3, address), city = COALESCE($4, city), state = COALESCE($5, state),
       pincode = COALESCE($6, pincode), latitude = COALESCE($7, latitude), longitude = COALESCE($8, longitude),
       price_per_hour = COALESCE($9, price_per_hour), opening_time = COALESCE($10, opening_time),
       closing_time = COALESCE($11, closing_time), is_open = COALESCE($12, is_open), updated_at = CURRENT_TIMESTAMP
     WHERE id = $13 AND owner_id = $14 RETURNING *`,
    [...Object.values(fields), id, ownerId]
  );

const deleteTurfSports = (turfId) =>
  db.query('DELETE FROM turf_sports WHERE turf_id = $1', [turfId]);

const deleteTurfAmenities = (turfId) =>
  db.query('DELETE FROM turf_amenities WHERE turf_id = $1', [turfId]);

const getFullTurf = (turfId) =>
  db.query(
    `SELECT t.*,
       (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name)), '[]') FROM turf_sports ts JOIN sports s ON ts.sport_id = s.id WHERE ts.turf_id = t.id) AS sports,
       (SELECT COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)), '[]') FROM turf_amenities ta JOIN amenities a ON ta.amenity_id = a.id WHERE ta.turf_id = t.id) AS amenities,
       (SELECT COALESCE(json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 's3_key', ti.s3_key, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC), '[]') FROM turf_images ti WHERE ti.turf_id = t.id) AS images
     FROM turfs t WHERE t.id = $1`,
    [turfId]
  );

const deleteTurf = (id, ownerId) =>
  db.query('DELETE FROM turfs WHERE id = $1 AND owner_id = $2 RETURNING id', [id, ownerId]);

const deleteTurfAdmin = (id) =>
  db.query('DELETE FROM turfs WHERE id = $1 RETURNING id', [id]);

const countTurfImages = (turfId) =>
  db.query('SELECT COUNT(*) FROM turf_images WHERE turf_id = $1', [turfId]);

const getImageMaxOrder = (turfId) =>
  db.query('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM turf_images WHERE turf_id = $1', [turfId]);

const findTurfImage = (imageId, turfId) =>
  db.query('SELECT s3_key FROM turf_images WHERE id = $1 AND turf_id = $2', [imageId, turfId]);

const deleteTurfImage = (imageId) =>
  db.query('DELETE FROM turf_images WHERE id = $1', [imageId]);

const getTurfCoordinates = (turfId) =>
  db.query('SELECT latitude, longitude FROM turfs WHERE id = $1', [turfId]);

const getTurfTimings = (turfId) =>
  db.query('SELECT opening_time, closing_time FROM turfs WHERE id = $1', [turfId]);

const lockTurfForUpdate = (client, turfId) =>
  client.query(`
    SELECT t.price_per_hour, t.opening_time, t.closing_time, o.razorpay_linked_account_id 
    FROM turfs t 
    JOIN owners o ON t.owner_id = o.id 
    WHERE t.id = $1 FOR UPDATE OF t`, [turfId]);

const getAllTurfs = () =>
  db.query(
    `SELECT t.*, o.business_name,
       (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name)), '[]') FROM turf_sports ts JOIN sports s ON ts.sport_id = s.id WHERE ts.turf_id = t.id) AS sports,
       (SELECT COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)), '[]') FROM turf_amenities ta JOIN amenities a ON ta.amenity_id = a.id WHERE ta.turf_id = t.id) AS amenities,
       (SELECT COALESCE(json_agg(json_build_object('id', ti.id, 'image_url', ti.image_url, 'sort_order', ti.sort_order) ORDER BY ti.sort_order ASC), '[]') FROM turf_images ti WHERE ti.turf_id = t.id) AS images
     FROM turfs t JOIN owners o ON t.owner_id = o.id ORDER BY t.created_at DESC`
  );

const approveTurf = (id) =>
  db.query(`UPDATE turfs SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`, [id]);

const rejectTurf = (id) =>
  db.query(`UPDATE turfs SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`, [id]);

const toggleFeatured = (id, is_featured) =>
  db.query(`UPDATE turfs SET is_featured = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`, [is_featured, id]);

const getTurfStats = (ownerId) =>
  db.query(`SELECT COUNT(id) AS count FROM turfs WHERE owner_id = $1`, [ownerId]);

const getActiveTurfStats = (ownerId) =>
  db.query(`SELECT COUNT(id) AS count FROM turfs WHERE owner_id = $1 AND status = 'ACTIVE' AND is_open = TRUE`, [ownerId]);

const checkSportInTurf = (turfId, sportId) =>
  db.query('SELECT 1 FROM turf_sports WHERE turf_id = $1 AND sport_id = $2', [turfId, sportId]);

module.exports = {
  insertTurf, findSportByName, findAmenityByName, insertAmenity,
  linkTurfSport, linkTurfAmenity, insertTurfImage, insertTurfImageSimple,
  getOwnerTurfs, checkTurfOwnership, checkTurfOwnershipByUser,
  updateTurf, deleteTurfSports, deleteTurfAmenities, getFullTurf,
  deleteTurf, deleteTurfAdmin, countTurfImages, getImageMaxOrder,
  findTurfImage, deleteTurfImage, getTurfCoordinates, getTurfTimings,
  lockTurfForUpdate, getAllTurfs, approveTurf, rejectTurf, toggleFeatured,
  getTurfStats, getActiveTurfStats, checkSportInTurf,
};
