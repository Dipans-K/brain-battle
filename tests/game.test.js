'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: makeClient } = require('socket.io-client');
const { createGame, makeRoomCode, safeName } = require('../server/game');
const { questions } = require('../server/questions');

function ack(socket, event, payload = {}) {
  return new Promise((resolve, reject) => socket.timeout(2500).emit(event, payload, (err, response) => err ? reject(err) : resolve(response)));
}
async function setup(options = {}) {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  const game = createGame(io, { questionDurationMs: 600, revealDurationMs: 35, roomExpiryMs: 1500, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  const connect = () => new Promise((resolve, reject) => {
    const socket = makeClient(url, { transports: ['websocket'], reconnection: false, timeout: 1500 });
    clients.push(socket); socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
  async function cleanup() {
    for (const client of clients) client.disconnect();
    game.closeAll();
    await new Promise(resolve => io.close(() => server.close(() => resolve())));
  }
  return { io, game, connect, cleanup };
}

test('question bank has 15 questions, four options, and valid answer indices', () => {
  assert.equal(questions.length, 15);
  assert.equal(new Set(questions.map(q => q.category)).size, 3);
  for (const q of questions) {
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  }
});
test('room codes are unique and player names are cleaned and capped', () => {
  const used = new Set(['ABC234']);
  for (let i = 0; i < 100; i++) { const code = makeRoomCode(used); assert.equal(code.length, 6); assert.ok(!used.has(code)); used.add(code); }
  assert.equal(safeName('  <Alex>\n  '), 'Alex');
  assert.equal(safeName('A'.repeat(40)).length, 20);
});
test('two players create/join, host starts, correct answer awards 100 only once, game syncs', async t => {
  const env = await setup(); t.after(env.cleanup);
  const a = await env.connect(), b = await env.connect();
  const created = await ack(a, 'room:create', { name: 'Alice' }); assert.equal(created.ok, true);
  const joined = await ack(b, 'room:join', { name: 'Bob', code: created.code }); assert.equal(joined.ok, true);
  assert.equal((await ack(b, 'game:start', { code: created.code })).ok, false, 'non-host must not start');
  const updatePromise = new Promise(resolve => a.once('room:update', resolve));
  assert.equal((await ack(a, 'game:start', { code: created.code })).ok, true);
  const q = await updatePromise;
  // room:update could be the playing state; validate server state directly as well.
  assert.equal(env.game.rooms.get(created.code).status, 'playing');
  const correctIndex = questions[0].answer;
  const answer = await ack(a, 'answer:submit', { code: created.code, answerIndex: correctIndex });
  assert.equal(answer.ok, true); assert.equal(answer.pointsAwarded, 100);
  const duplicate = await ack(a, 'answer:submit', { code: created.code, answerIndex: correctIndex });
  assert.equal(duplicate.ok, false);
  assert.equal(env.game.rooms.get(created.code).players.get(created.playerId).score, 100);
  assert.ok(q.question || q.status === 'playing');
});
test('room rejects fewer than two players and duplicate names', async t => {
  const env = await setup(); t.after(env.cleanup);
  const a = await env.connect(); const created = await ack(a, 'room:create', { name: 'Solo' });
  assert.equal((await ack(a, 'game:start', { code: created.code })).ok, false);
  const b = await env.connect(); assert.equal((await ack(b, 'room:join', { code: created.code, name: 'sOLO' })).ok, false);
});
test('player can reconnect with their resume token and retain score', async t => {
  const env = await setup(); t.after(env.cleanup);
  const a = await env.connect(), b = await env.connect();
  const created = await ack(a, 'room:create', { name: 'Alice' }); await ack(b, 'room:join', { name: 'Bob', code: created.code });
  await ack(a, 'game:start', { code: created.code });
  await ack(a, 'answer:submit', { code: created.code, answerIndex: questions[0].answer });
  a.disconnect(); await new Promise(resolve => setTimeout(resolve, 30));
  const replacement = await env.connect();
  const resumed = await ack(replacement, 'room:resume', { code: created.code, playerId: created.playerId, resumeToken: created.resumeToken });
  assert.equal(resumed.ok, true);
  assert.equal(env.game.rooms.get(created.code).players.get(created.playerId).score, 100);
  assert.equal(env.game.rooms.get(created.code).players.get(created.playerId).connected, true);
});
test('wrong answers score zero and deadline advances the question', async t => {
  const env = await setup({ questionDurationMs: 140, revealDurationMs: 20 }); t.after(env.cleanup);
  const a = await env.connect(), b = await env.connect();
  const created = await ack(a, 'room:create', { name: 'Alice' }); await ack(b, 'room:join', { name: 'Bob', code: created.code });
  await ack(a, 'game:start', { code: created.code });
  const wrongIndex = (questions[0].answer + 1) % 4;
  const result = await ack(a, 'answer:submit', { code: created.code, answerIndex: wrongIndex });
  assert.equal(result.ok, true); assert.equal(result.pointsAwarded, 0);
  await new Promise(resolve => setTimeout(resolve, 210));
  assert.equal(env.game.rooms.get(created.code).questionIndex, 1);
});
