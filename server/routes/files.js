const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const protect = require('../middleware/authMiddleware');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// GET files for a project
router.get('/:projectId', protect, async (req, res) => {
  try {
    const files = await File.find({ project: req.params.projectId })
      .populate('uploader', 'name email')
      .sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST upload file
router.post('/:projectId', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileDoc = await File.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      project: req.params.projectId,
      uploader: req.user.id
    });

    const populatedFile = await File.findById(fileDoc._id).populate('uploader', 'name email');
    req.app.get('io').to(req.params.projectId).emit('fileUploaded', populatedFile);
    res.json(populatedFile);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE file
router.delete('/:id', protect, async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ message: 'File not found' });

    // Ensure user has permission (uploader or leader, simplified to just exist for now)
    
    // Delete from filesystem
    if (fs.existsSync(fileDoc.path)) {
      fs.unlinkSync(fileDoc.path);
    }

    await File.findByIdAndDelete(req.params.id);
    req.app.get('io').to(fileDoc.project.toString()).emit('fileDeleted', req.params.id);
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
