'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createGame } = require('../server/game');
const { questions } = require('../server/questions');

class FakeSocket {
  constructor(io, id) { this.io = io; this.id = id; this.data = {}; this.rooms = new Set(); this.handlers = new Map(); this.clientEvents = new EventEmitter(); this.connected = true; }
  on(event, handler) { if (!this.handlers.has(event)) this.handlers.set(event, []); this.handlers.get(event).push(handler); return this; }
  emit(event, payload) { this.clientEvents.emit(event, payload); return true; }
  join(room) { this.rooms.add(room); this.io.rooms.set(room, (this.io.rooms.get(room) || new Set()).add(this)); }
  leave(room) { this.rooms.delete(room); this.io.rooms.get(room)?.delete(this); }
  clientOn(event, handler) { this.clientEvents.on(event, handler); return this; }
  clientSend(event, payload = {}) { return new Promise(resolve => { const handlers = this.handlers.get(event) || []; let responded = false; const ack = value => { if (!responded) { responded = true; resolve(value); } }; for (const handler of handlers) handler(payload, ack); if (!handlers.length) resolve(undefined); }); }
  disconnect() { if (!this.connected) return; this.connected = false; for (const handler of this.handlers.get('disconnect') || []) handler('client disconnect'); this.io.sockets.sockets.delete(this.id); for (const room of this.rooms) this.io.rooms.get(room)?.delete(this); }
}
class FakeIo extends EventEmitter {
  constructor() { super(); this.rooms = new Map(); this.sockets = { sockets: new Map() }; }
  createClient(id) { const socket = new FakeSocket(this, id); this.sockets.sockets.set(id, socket); this.emit('connection', socket); return socket; }
  to(room) { return { emit: (event, payload) => { for (const socket of this.rooms.get(room) || []) socket.emit(event, payload); } }; }
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

test('simulated multiplayer: room creation, join, host-only start, live score and duplicate answer protection', async t => {
  const io = new FakeIo(); const game = createGame(io, { questionDurationMs: 500, revealDurationMs: 25 }); t.after(() => game.closeAll());
  const alice = io.createClient('a'), bob = io.createClient('b');
  const created = await alice.clientSend('room:create', { name: 'Alice' });
  assert.equal(created.ok, true); assert.match(created.code, /^[A-Z2-9]{6}$/);
  const joined = await bob.clientSend('room:join', { name: 'Bob', code: created.code }); assert.equal(joined.ok, true);
  assert.equal((await bob.clientSend('game:start', { code: created.code })).ok, false);
  assert.equal((await alice.clientSend('game:start', { code: created.code })).ok, true);
  const room = game.rooms.get(created.code); assert.equal(room.status, 'playing');
  const right = await alice.clientSend('answer:submit', { code: created.code, answerIndex: questions[0].answer });
  assert.deepEqual({ ok: right.ok, pointsAwarded: right.pointsAwarded }, { ok: true, pointsAwarded: 100 });
  const duplicate = await alice.clientSend('answer:submit', { code: created.code, answerIndex: questions[0].answer }); assert.equal(duplicate.ok, false);
  assert.equal(room.players.get(created.playerId).score, 100);
  const wrong = await bob.clientSend('answer:submit', { code: created.code, answerIndex: (questions[0].answer + 1) % 4 });
  assert.equal(wrong.ok, true); assert.equal(wrong.pointsAwarded, 0);
  await wait(50); assert.equal(room.status, 'playing'); assert.equal(room.questionIndex, 1);
});
test('simulated multiplayer: rejects one-player start, duplicate names, and more than 8 players', async t => {
  const io = new FakeIo(); const game = createGame(io); t.after(() => game.closeAll());
  const first = io.createClient('p0'); const created = await first.clientSend('room:create', { name: 'Player 0' });
  assert.equal((await first.clientSend('game:start', { code: created.code })).ok, false);
  const duplicate = io.createClient('duplicate'); assert.equal((await duplicate.clientSend('room:join', { code: created.code, name: 'player 0' })).ok, false);
  for (let i = 1; i < 8; i++) { const client = io.createClient(`p${i}`); assert.equal((await client.clientSend('room:join', { code: created.code, name: `Player ${i}` })).ok, true); }
  const ninth = io.createClient('p8'); assert.equal((await ninth.clientSend('room:join', { code: created.code, name: 'Player 8' })).ok, false);
});
test('simulated multiplayer: valid resume token restores a disconnected player', async t => {
  const io = new FakeIo(); const game = createGame(io, { questionDurationMs: 900 }); t.after(() => game.closeAll());
  const alice = io.createClient('a'), bob = io.createClient('b');
  const created = await alice.clientSend('room:create', { name: 'Alice' }); await bob.clientSend('room:join', { name: 'Bob', code: created.code });
  await alice.clientSend('game:start', { code: created.code }); await alice.clientSend('answer:submit', { code: created.code, answerIndex: questions[0].answer });
  alice.disconnect(); await wait(5);
  const replacement = io.createClient('a2');
  const resumed = await replacement.clientSend('room:resume', { code: created.code, playerId: created.playerId, resumeToken: created.resumeToken });
  assert.equal(resumed.ok, true); assert.equal(game.rooms.get(created.code).players.get(created.playerId).score, 100);
  assert.equal(game.rooms.get(created.code).players.get(created.playerId).connected, true);
});
test('simulated multiplayer: all 15 questions finish and final winner is announced', async t => {
  const io = new FakeIo(); const game = createGame(io, { questionDurationMs: 1000, revealDurationMs: 2 }); t.after(() => game.closeAll());
  const alice = io.createClient('winner-a'), bob = io.createClient('winner-b');
  const created = await alice.clientSend('room:create', { name: 'Ace' }); await bob.clientSend('room:join', { code: created.code, name: 'Brain' });
  let finalResult = null; alice.clientOn('game:finished', result => { finalResult = result; });
  await alice.clientSend('game:start', { code: created.code });
  for (let index = 0; index < 15; index++) {
    assert.equal(game.rooms.get(created.code).questionIndex, index);
    await alice.clientSend('answer:submit', { code: created.code, answerIndex: questions[index].answer });
    await bob.clientSend('answer:submit', { code: created.code, answerIndex: questions[index].answer });
    const until = Date.now() + 150;
    while (Date.now() < until && game.rooms.get(created.code).status !== 'finished' && game.rooms.get(created.code).questionIndex === index) await wait(2);
  }
  assert.equal(game.rooms.get(created.code).status, 'finished');
  assert.ok(finalResult, 'server should emit final winner result');
  assert.equal(finalResult.totalQuestions, 15);
  assert.deepEqual(finalResult.winners.sort(), ['Ace', 'Brain']);
  assert.deepEqual(finalResult.leaderboard.map(p => p.score).sort((a,b) => a-b), [1500, 1500]);
});
