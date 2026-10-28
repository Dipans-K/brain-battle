'use strict';
const crypto = require('node:crypto');
const { questions } = require('./questions');

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoomCode(existing) {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)];
    if (!existing.has(code)) return code;
  }
  throw new Error('Could not allocate a room code. Please try again.');
}
function safeName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 20);
}
function publicQuestion(q, index) {
  return { number: index + 1, category: q.category, question: q.question, options: q.options };
}
function createGame(io, options = {}) {
  const rooms = new Map();
  const timers = new Map();
  const expiryTimers = new Map();
  const questionDurationMs = options.questionDurationMs ?? 15000;
  const revealDurationMs = options.revealDurationMs ?? 2500;
  const roomExpiryMs = options.roomExpiryMs ?? 30 * 60 * 1000;

  function cancelTimer(code) {
    const timer = timers.get(code);
    if (timer) clearTimeout(timer);
    timers.delete(code);
  }
  function roomFor(socket, code) {
    const normalized = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room || !room.players.has(socket.data.playerId)) return null;
    return { code: normalized, room, player: room.players.get(socket.data.playerId) };
  }
  function leaderboard(room) {
    return [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, isHost: p.id === room.hostId, answered: room.answers.has(p.id) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }
  function emitState(code) {
    const room = rooms.get(code);
    if (!room) return;
    io.to(code).emit('room:update', {
      code, status: room.status, hostId: room.hostId, players: leaderboard(room),
      round: room.status === 'playing' || room.status === 'reveal' ? Math.floor(room.questionIndex / 5) + 1 : 0,
      questionNumber: room.status === 'playing' || room.status === 'reveal' ? room.questionIndex + 1 : 0,
      totalQuestions: questions.length, maxPlayers: 8,
      deadline: room.deadline || null,
      answeredCount: room.answers.size,
      question: room.status === 'playing' || room.status === 'reveal' ? publicQuestion(questions[room.questionIndex], room.questionIndex) : null
    });
  }
  function removeRoom(code) {
    cancelTimer(code); clearExpiry(code);
    const room = rooms.get(code);
    if (room) for (const player of room.players.values()) if (player.socketId) {
      const s = io.sockets.sockets.get(player.socketId);
      if (s) s.leave(code);
    }
    rooms.delete(code);
  }
  function clearExpiry(code) { const timer = expiryTimers.get(code); if (timer) clearTimeout(timer); expiryTimers.delete(code); }
  function scheduleRoomExpiry(code) {
    clearExpiry(code);
    const timer = setTimeout(() => { expiryTimers.delete(code); const room = rooms.get(code); if (room && ![...room.players.values()].some(p => p.connected)) removeRoom(code); }, roomExpiryMs);
    timer.unref?.(); expiryTimers.set(code, timer);
  }
  function beginQuestion(code) {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    if (room.questionIndex >= questions.length) return finishGame(code);
    room.answers = new Map();
    room.deadline = Date.now() + questionDurationMs;
    emitState(code);
    cancelTimer(code);
    const timer = setTimeout(() => closeQuestion(code), questionDurationMs);
    timer.unref?.();
    timers.set(code, timer);
  }
  function closeQuestion(code) {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    cancelTimer(code);
    room.status = 'reveal';
    room.deadline = null;
    const q = questions[room.questionIndex];
    io.to(code).emit('question:result', {
      questionNumber: room.questionIndex + 1,
      correctIndex: q.answer,
      explanation: q.explanation,
      answers: [...room.answers.entries()].map(([playerId, result]) => ({ playerId, correct: result.correct, selectedIndex: result.selectedIndex })),
      leaderboard: leaderboard(room)
    });
    emitState(code);
    const timer = setTimeout(() => {
      const current = rooms.get(code);
      if (!current || current.status !== 'reveal') return;
      current.questionIndex++;
      if (current.questionIndex >= questions.length) finishGame(code);
      else { current.status = 'playing'; beginQuestion(code); }
    }, revealDurationMs);
    timer.unref?.();
    timers.set(code, timer);
  }
  function finishGame(code) {
    const room = rooms.get(code);
    if (!room) return;
    cancelTimer(code);
    room.status = 'finished';
    room.deadline = null;
    const scores = leaderboard(room);
    const top = scores.length ? scores[0].score : 0;
    io.to(code).emit('game:finished', { leaderboard: scores, winners: scores.filter(p => p.score === top).map(p => p.name), totalQuestions: questions.length });
    emitState(code);
  }
  function error(socket, message) { socket.emit('game:error', { message }); }

  io.on('connection', socket => {
    socket.on('room:create', (payload = {}, ack = () => {}) => {
      const name = safeName(payload.name);
      if (!name) return ack({ ok: false, error: 'Enter a player name (up to 20 characters).' });
      const code = makeRoomCode(rooms);
      const playerId = crypto.randomUUID();
      const room = { code, hostId: playerId, players: new Map(), status: 'lobby', questionIndex: 0, answers: new Map(), deadline: null, createdAt: Date.now() };
      room.players.set(playerId, { id: playerId, name, score: 0, connected: true, socketId: socket.id, resumeToken: crypto.randomBytes(24).toString('hex') });
      rooms.set(code, room);
      socket.data.playerId = playerId; socket.data.roomCode = code; socket.join(code);
      ack({ ok: true, code, playerId, resumeToken: room.players.get(playerId).resumeToken, host: true });
      emitState(code);
    });
    socket.on('room:join', (payload = {}, ack = () => {}) => {
      const code = String(payload.code || '').trim().toUpperCase();
      const name = safeName(payload.name);
      const room = rooms.get(code);
      if (!name) return ack({ ok: false, error: 'Enter a player name (up to 20 characters).' });
      if (!room) return ack({ ok: false, error: 'Room not found. Check the code and try again.' });
      if (room.status !== 'lobby') return ack({ ok: false, error: 'This game has already started.' });
      if (room.players.size >= 8) return ack({ ok: false, error: 'This room is full (8 players maximum).' });
      if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return ack({ ok: false, error: 'That name is already in this room. Choose another.' });
      const playerId = crypto.randomUUID();
      const player = { id: playerId, name, score: 0, connected: true, socketId: socket.id, resumeToken: crypto.randomBytes(24).toString('hex') };
      room.players.set(playerId, player); socket.data.playerId = playerId; socket.data.roomCode = code; socket.join(code);
      clearExpiry(code);
      ack({ ok: true, code, playerId, resumeToken: player.resumeToken, host: false });
      emitState(code);
    });
    socket.on('room:resume', (payload = {}, ack = () => {}) => {
      const code = String(payload.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      const player = room && room.players.get(String(payload.playerId || ''));
      if (!room || !player || !payload.resumeToken || payload.resumeToken !== player.resumeToken) return ack({ ok: false, error: 'Your reconnect session could not be found. Please rejoin the room.' });
      if (player.socketId && player.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(player.socketId);
        if (oldSocket) { oldSocket.leave(code); oldSocket.data.playerId = null; oldSocket.data.roomCode = null; }
      }
      player.connected = true; player.socketId = socket.id;
      socket.data.playerId = player.id; socket.data.roomCode = code; socket.join(code);
      clearExpiry(code);
      ack({ ok: true, code, playerId: player.id, resumeToken: player.resumeToken, host: player.id === room.hostId });
      emitState(code);
      if (room.status === 'playing') socket.emit('question:sync', { question: publicQuestion(questions[room.questionIndex], room.questionIndex), deadline: room.deadline, answered: room.answers.has(player.id) });
      if (room.status === 'reveal') socket.emit('question:result', { questionNumber: room.questionIndex + 1, correctIndex: questions[room.questionIndex].answer, explanation: questions[room.questionIndex].explanation, answers: [...room.answers.entries()].map(([id, result]) => ({ playerId: id, correct: result.correct, selectedIndex: result.selectedIndex })), leaderboard: leaderboard(room) });
      if (room.status === 'finished') socket.emit('game:finished', { leaderboard: leaderboard(room), winners: leaderboard(room).filter(p => p.score === leaderboard(room)[0]?.score).map(p => p.name), totalQuestions: questions.length });
    });
    socket.on('game:start', (payload = {}, ack = () => {}) => {
      const info = roomFor(socket, payload.code);
      if (!info) return ack({ ok: false, error: 'Join a room first.' });
      const { code, room, player } = info;
      if (player.id !== room.hostId) return ack({ ok: false, error: 'Only the host can start the game.' });
      if (room.status !== 'lobby') return ack({ ok: false, error: 'This game has already started.' });
      if (room.players.size < 2) return ack({ ok: false, error: 'At least 2 players are needed to start.' });
      room.status = 'playing'; room.questionIndex = 0;
      for (const p of room.players.values()) p.score = 0;
      ack({ ok: true }); beginQuestion(code);
    });
    socket.on('answer:submit', (payload = {}, ack = () => {}) => {
      const info = roomFor(socket, payload.code);
      if (!info) return ack({ ok: false, error: 'You are not in this room.' });
      const { code, room, player } = info;
      if (room.status !== 'playing') return ack({ ok: false, error: 'This question is not accepting answers.' });
      if (Date.now() >= room.deadline) { closeQuestion(code); return ack({ ok: false, error: 'Time is up!' }); }
      if (!Number.isInteger(payload.answerIndex) || payload.answerIndex < 0 || payload.answerIndex > 3) return ack({ ok: false, error: 'Choose one of the four answers.' });
      if (room.answers.has(player.id)) return ack({ ok: false, error: 'Your answer has already been submitted.' });
      const correct = payload.answerIndex === questions[room.questionIndex].answer;
      room.answers.set(player.id, { correct, selectedIndex: payload.answerIndex });
      if (correct) player.score += 100;
      ack({ ok: true, correct, pointsAwarded: correct ? 100 : 0 });
      io.to(code).emit('score:update', { leaderboard: leaderboard(room), answeredCount: room.answers.size, totalPlayers: room.players.size });
      if (room.answers.size === room.players.size) closeQuestion(code);
    });
    socket.on('room:leave', (payload = {}, ack = () => {}) => {
      const info = roomFor(socket, payload.code);
      if (!info) return ack({ ok: false, error: 'You are not in this room.' });
      const { code, room, player } = info;
      room.players.delete(player.id); socket.leave(code); socket.data.playerId = null; socket.data.roomCode = null;
      if (room.players.size === 0) removeRoom(code);
      else {
        if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
        emitState(code);
      }
      ack({ ok: true });
    });
    socket.on('disconnect', () => {
      const code = socket.data.roomCode; const room = code && rooms.get(code);
      const player = room && room.players.get(socket.data.playerId);
      if (!room || !player || player.socketId !== socket.id) return;
      player.connected = false; player.socketId = null;
      if (room.hostId === player.id) {
        const connectedHost = [...room.players.values()].find(p => p.connected);
        if (connectedHost) room.hostId = connectedHost.id;
      }
      emitState(code);
      if (![...room.players.values()].some(p => p.connected)) scheduleRoomExpiry(code);
      else {
        // Keep disconnected player slots for reconnect, but clean up an idle room later.
        scheduleRoomExpiry(code);
      }
    });
  });

  return { rooms, closeAll: () => { for (const code of [...rooms.keys()]) removeRoom(code); for (const timer of expiryTimers.values()) clearTimeout(timer); expiryTimers.clear(); } };
}
module.exports = { createGame, makeRoomCode, safeName };
