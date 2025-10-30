import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:8081", "http://localhost:8082", "http://localhost:8083", "http://localhost:8084", "https://your-frontend-domain.com"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }
});

// Add CORS headers for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const PORT = process.env.PORT || 8088;
const COMMENTS_FILE = path.join(__dirname, 'src', 'comments.yaml');

// Ensure comments.yaml exists
if (!fs.existsSync(COMMENTS_FILE)) {
  fs.writeFileSync(COMMENTS_FILE, yaml.dump({}, { indent: 2 }));
}

// Load comments from file
function loadComments() {
  try {
    const data = fs.readFileSync(COMMENTS_FILE, 'utf8');
    return yaml.load(data) || {};
  } catch (error) {
    console.error('Error loading comments:', error);
    return {};
  }
}

// Save comments to file
function saveComments(comments) {
  try {
    fs.writeFileSync(COMMENTS_FILE, yaml.dump(comments, { indent: 2 }));
  } catch (error) {
    console.error('Error saving comments:', error);
  }
}

app.use(express.json());

// API endpoint to get comments
app.get('/api/comments/:articleId', (req, res) => {
  const { articleId } = req.params;
  const comments = loadComments();
  res.json(comments[articleId] || []);
});

// API endpoint to post comment
app.post('/api/comments/:articleId', (req, res) => {
  const { articleId } = req.params;
  const { author, content, email, website } = req.body;

  if (!author || !content) {
    return res.status(400).json({ error: 'Author and content are required' });
  }

  const comments = loadComments();
  if (!comments[articleId]) {
    comments[articleId] = [];
  }

  const newComment = {
    id: Date.now().toString(),
    author,
    email: email || '',
    website: website || '',
    content,
    date: new Date().toLocaleString(),
    replies: []
  };

  comments[articleId].push(newComment);
  saveComments(comments);

  // Broadcast to all connected clients
  io.emit('newComment', { articleId, comment: newComment });

  res.json(newComment);
});

// API endpoint to post reply
app.post('/api/comments/:articleId/reply/:commentId', (req, res) => {
  const { articleId, commentId } = req.params;
  const { author, content, email, website } = req.body;

  if (!author || !content) {
    return res.status(400).json({ error: 'Author and content are required' });
  }

  const comments = loadComments();
  if (!comments[articleId]) {
    return res.status(404).json({ error: 'Article not found' });
  }

  const commentIndex = comments[articleId].findIndex(c => c.id === commentId);
  if (commentIndex === -1) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const newReply = {
    id: Date.now().toString(),
    author,
    email: email || '',
    website: website || '',
    content,
    date: new Date().toLocaleString()
  };

  if (!comments[articleId][commentIndex].replies) {
    comments[articleId][commentIndex].replies = [];
  }

  comments[articleId][commentIndex].replies.push(newReply);
  saveComments(comments);

  // Broadcast to all connected clients
  io.emit('newReply', { articleId, commentId, reply: newReply });

  res.json(newReply);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});