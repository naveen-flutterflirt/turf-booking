const db = require('../config/db');
const findOwnerByUserId = (userId) => db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
const findOwnerByUserIdClient = (client, userId) => client.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
const findOwnerUserIdById = (id) => db.query('SELECT user_id FROM owners WHERE id = $1', [id]);
const insertOwner = (client, userId, business_name) => client.query(`INSERT INTO owners (user_id, business_name) VALUES ($1, $2)`, [userId, business_name]);
const getOwnerProfile = (userId) => db.query(`SELECT u.id as user_id, o.id as owner_id, u.name, u.email, u.phone, o.business_name
     FROM users u JOIN owners o ON u.id = o.user_id WHERE u.id = $1`,
	[userId]);
const getOwnerProfileClient = (client, userId) => client.query(`SELECT u.id as user_id, o.id as owner_id, u.name, u.email, u.phone, o.business_name
     FROM users u JOIN owners o ON u.id = o.user_id WHERE u.id = $1`,
	[userId]);
const updateOwnerBusinessName = (client, business_name, userId) => client.query('UPDATE owners SET business_name = $1 WHERE user_id = $2', [business_name, userId]);
const getPayoutDetails = (userId) => db.query(`SELECT account_holder_name, bank_account_number, ifsc, bank_verification_status, payout_details_completed
     FROM owners WHERE user_id = $1`,
	[userId]);
const updatePayoutDetails = (userId, {
	accountHolderName,
	bankAccountNumber,
	ifsc,
	razorpayLinkedAccountId
}) => db.query(`UPDATE owners
     SET account_holder_name = $1, bank_account_number = $2, ifsc = $3,
         razorpay_linked_account_id = $4,
         payout_details_completed = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $5 RETURNING *`,
	[accountHolderName, bankAccountNumber, ifsc, razorpayLinkedAccountId, userId]);
const getAllOwners = () => db.query(`SELECT o.id AS owner_id, o.business_name, o.created_at AS owner_created_at,
            u.id AS user_id, u.name, u.email, u.phone, COUNT(t.id) AS turf_count
     FROM owners o JOIN users u ON o.user_id = u.id
     LEFT JOIN turfs t ON o.id = t.owner_id
     GROUP BY o.id, u.id ORDER BY o.created_at DESC`);
const submitOwnerQuery = (ownerId, subject, message) => db.query(`INSERT INTO owner_queries (owner_id, subject, message) VALUES ($1, $2, $3) RETURNING *`,
	[ownerId, subject, message]);
const getOwnerQueries = (ownerId) => db.query(`SELECT id, subject, message, admin_reply, status, created_at, updated_at
     FROM owner_queries WHERE owner_id = $1 ORDER BY created_at DESC`,
	[ownerId]);
module.exports = {
	findOwnerByUserId,
	findOwnerByUserIdClient,
	findOwnerUserIdById,
	insertOwner,
	getOwnerProfile,
	getOwnerProfileClient,
	updateOwnerBusinessName,
	getPayoutDetails,
	updatePayoutDetails,
	getAllOwners,
	submitOwnerQuery,
	getOwnerQueries,
};
