const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');
const { authenticateUser } = require('../middlewares/auth.middleware');

// Public or Customer Routes (requires authentication)
router.use(authenticateUser);

// Create a new split-cost event
router.post('/create', eventController.createEvent);

// Verify event payment
router.post('/verify-payment', eventController.verifyEventPayment);

// Update an event
router.put('/:id', eventController.updateEvent);

// Delete an event
router.delete('/:id', eventController.deleteEvent);

// Get all open events
router.get('/', eventController.getAllEvents);

// Get my events (created and joined)
router.get('/my-events', eventController.getMyEvents);

// Join an event
router.post('/:id/join', eventController.joinEvent);

// Get participants of an event (for creator)
router.get('/:eventId/participants', eventController.getEventParticipants);

// Creator approves a participant after verifying payment
router.put('/:eventId/participants/:participantId/approve', eventController.approveParticipant);

// Creator rejects a participant
router.put('/:eventId/participants/:participantId/reject', eventController.rejectParticipant);

// --- OWNER ROUTES ---
// Get all events for owner's turfs
router.get('/owner/all', eventController.getOwnerEvents);

// Owner approves or rejects an event
router.put('/owner/:id/status', eventController.ownerApproveEvent);

module.exports = router;
