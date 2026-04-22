const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const socketHandler = require('./socket/socketHandler');
const path = require('path');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks',    require('./routes/tasks'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/ai',       require('./routes/ai'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/files',    require('./routes/files'));
app.use('/api/notifications', require('./routes/notifications'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

socketHandler(io);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    server.listen(process.env.PORT, () => {
      console.log(`🚀 Server running on port ${process.env.PORT}`);
    });
  })
  .catch(err => console.log('❌ DB Error:', err));