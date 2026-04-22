const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String },
  size: { type: Number },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('File', fileSchema);
