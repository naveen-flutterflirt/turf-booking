const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/owner.controller');
const {
	authenticateUser
} = require('../middlewares/auth.middleware');
const {
	authorizeRole
} = require('../middlewares/role.middleware');
// All routes here require authentication and the OWNER role
router.use(authenticateUser);
router.use(authorizeRole(['OWNER', 'ADMIN']));
router.post('/turfs', ownerController.createTurf);
router.get('/turfs', ownerController.getOwnerTurfs);
router.post('/turfs/:id/images', ownerController.addTurfImage);
router.put('/turfs/:id', ownerController.updateTurf);
router.delete('/turfs/:id', ownerController.deleteTurf);
router.delete('/turfs/:id/images/:imageId', ownerController.deleteTurfImage);
router.get('/bookings', ownerController.getOwnerBookings);
router.get('/dashboard', ownerController.getOwnerDashboardStats);
router.get('/profile', ownerController.getOwnerProfile);
router.put('/profile', ownerController.updateOwnerProfile);
router.post('/queries', ownerController.submitQuery);
router.get('/queries', ownerController.getQueries);
router.get('/account-details', ownerController.getAccountDetails);
router.post('/account-details', ownerController.updateAccountDetails);
router.put('/account-details', ownerController.updateAccountDetails);
module.exports = router;
