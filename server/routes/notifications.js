const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const protect = require('../middleware/authMiddleware');

// Get all notifications for the logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .populate('sender', 'name')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark a notification as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    notification.isRead = true;
    await notification.save();
    
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark all as read
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
