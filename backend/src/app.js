const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');

const app = express();
app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json({ limit: '10kb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use((error, _req, res, _next) => res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message }));

module.exports = app;
