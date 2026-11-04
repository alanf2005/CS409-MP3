require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err.message));

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api', (req, res) => res.status(200).json({ message: 'OK', data: 'Llama.io API' }));
app.use('/api/users', require('./routes/users'));
app.use('/api/tasks', require('./routes/tasks'));

app.use((req, res) => res.status(404).json({ message: 'Endpoint not found', data: {} }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON', data: {} });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server', data: {} });
});

app.listen(port, () => console.log('Server running on port ' + port));