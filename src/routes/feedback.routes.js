const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

// All feedback routes are for CUSTOMER role
router.use(authenticateUser);
router.use(authorizeRole(['CUSTOMER']));

// Add feedback
router.post('/', feedbackController.createFeedback);

// Update feedback
router.put('/:id', feedbackController.updateFeedback);

// Delete feedback
router.delete('/:id', feedbackController.deleteFeedback);

module.exports = router;
