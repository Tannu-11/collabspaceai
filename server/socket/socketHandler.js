const Message = require('../models/Message');
const Project = require('../models/Project');
const Notification = require('../models/Notification');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a project room
    socket.on('joinRoom', (projectId) => {
      socket.join(projectId);
    });

    // Join personal user room for direct notifications
    socket.on('joinUserRoom', (userId) => {
      socket.join(userId);
    });

    // Send message
    socket.on('sendMessage', async ({ content, senderId, senderName, projectId }) => {
      const message = await Message.create({
        content,
        sender: senderId,
        project: projectId
      });

      io.to(projectId).emit('receiveMessage', {
        _id: message._id,
        content,
        sender: { _id: senderId, name: senderName },
        createdAt: message.createdAt,
        reactions: []
      });

      // Process mentions
      try {
        const project = await Project.findById(projectId).populate('members', 'name _id');
        if (project) {
          for (const member of project.members) {
            if (member._id.toString() !== senderId.toString() && content.includes(`@${member.name}`)) {
              const notif = await Notification.create({
                recipient: member._id,
                sender: senderId,
                project: projectId,
                type: 'mention',
                message: content.substring(0, 50) + (content.length > 50 ? '...' : '')
              });
              
              const popNotif = await Notification.findById(notif._id)
                .populate('sender', 'name')
                .populate('project', 'name');
                
              io.to(member._id.toString()).emit('notification', popNotif);
            }
          }
        }
      } catch (err) {
        console.error('Mention processing error:', err);
      }
    });

    // React to message
    socket.on('reactMessage', async ({ messageId, emoji, userId, projectId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        let react = msg.reactions.find(r => r.emoji === emoji);
        if (react) {
          const idx = react.users.findIndex(u => u.toString() === userId.toString());
          if (idx > -1) react.users.splice(idx, 1);
          else react.users.push(userId);
          if (react.users.length === 0) {
            msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          msg.reactions.push({ emoji, users: [userId] });
        }
        await msg.save();
        io.to(projectId).emit('messageReacted', { messageId, reactions: msg.reactions });
      } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};

module.exports = socketHandler;