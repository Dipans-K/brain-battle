'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRoomCode, safeName } = require('../server/game');
const { questions } = require('../server/questions');

test('question bank contains exactly 15 questions across three rounds/categories', () => {
  assert.equal(questions.length, 15);
  assert.deepEqual([...new Set(questions.map(q => q.category))], ['General Knowledge', 'Science & Technology', 'Logic & Brain Teasers']);
  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4);
    assert.ok(question.question.length > 10);
  }
});
test('room codes are six characters and do not collide with existing rooms', () => {
  const existing = new Set(['ABC234']);
  for (let i = 0; i < 200; i++) {
    const code = makeRoomCode(existing);
    assert.equal(code.length, 6);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(existing.has(code), false);
    existing.add(code);
  }
});
test('player names are trimmed, stripped of markup/control characters, and limited to 20 chars', () => {
  assert.equal(safeName('  <Alex>\n  '), 'Alex');
  assert.equal(safeName('A'.repeat(30)).length, 20);
  assert.equal(safeName('   '), '');
  assert.equal(safeName(null), '');
});
