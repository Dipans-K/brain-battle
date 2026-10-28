'use strict';
require('dotenv').config();
const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const { createGame } = require('./game');

const app = express();
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true, service: 'brain-battle-server', time: new Date().toISOString() }));
app.get('/', (_req, res) => res.json({ service: 'Brain Battle multiplayer server', health: '/health', socketPath: '/socket.io' }));
const server = http.createServer(app);
const origins = [process.env.CLIENT_ORIGIN, ...(process.env.ADDITIONAL_CLIENT_ORIGINS || '').split(',')]
  .map(s => (s || '').trim()).filter(Boolean);
const io = new Server(server, {
  cors: { origin: (origin, callback) => {
    if (!origin || origins.includes('*') || origins.includes(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return callback(null, true);
    return callback(new Error('Origin is not allowed by Brain Battle server CORS policy.'));
  }, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e5
});
createGame(io);
const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Brain Battle server listening on port ${port}`));
function shutdown() { io.close(() => server.close(() => process.exit(0))); setTimeout(() => process.exit(1), 5000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
