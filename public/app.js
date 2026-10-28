'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const views = { home: $('homeView'), panels: $('homePanels'), rules: document.querySelector('.rules-strip'), lobby: $('lobbyView'), quiz: $('quizView'), results: $('resultsView') };
  let savedSession = null;
  try { savedSession = JSON.parse(sessionStorage.getItem('brainBattleSession') || 'null'); } catch (_) { savedSession = null; }
  const state = { socket: null, roomCode: savedSession?.roomCode || null, playerId: savedSession?.playerId || null, resumeToken: savedSession?.resumeToken || null, isHost: false, playerName: savedSession?.playerName || '', status: 'home', deadline: null, question: null, questionIndex: 0, answered: false, selectedIndex: null, lastResult: null, sound: true, toastTimer: null, countdownFrame: null, connectAttempts: 0 };
  const letters = ['A', 'B', 'C', 'D'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

  function showToast(message, kind = 'info') {
    const toast = $('toast'); toast.textContent = message; toast.className = `toast show ${kind}`;
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
  }
  function showView(name) {
    views.home.classList.toggle('hidden', name !== 'home');
    views.panels.classList.toggle('hidden', name !== 'home');
    views.rules.classList.toggle('hidden', name !== 'home');
    views.lobby.classList.toggle('hidden', name !== 'lobby');
    views.quiz.classList.toggle('hidden', name !== 'quiz');
    views.results.classList.toggle('hidden', name !== 'results');
    state.status = name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function socketScriptUrl() {
    const base = (window.BRAIN_BATTLE_CONFIG && window.BRAIN_BATTLE_CONFIG.serverUrl || '').trim().replace(/\/$/, '');
    return { base, script: `${base}/socket.io/socket.io.js` };
  }
  function setConnection(connected, text) {
    $('connectionDot').classList.toggle('connected', !!connected);
    $('connectionText').textContent = text || (connected ? 'Connected' : 'Connecting…');
  }
  function loadSocketClient() {
    return new Promise((resolve, reject) => {
      if (window.io) return resolve();
      const { script } = socketScriptUrl();
      const tag = document.createElement('script'); tag.src = script; tag.onload = resolve; tag.onerror = () => reject(new Error('Could not load the multiplayer client. Check your game server URL and internet connection.'));
      document.head.appendChild(tag);
    });
  }
  async function connect() {
    setConnection(false, 'Connecting…');
    try {
      await loadSocketClient();
      const { base } = socketScriptUrl();
      state.socket = window.io(base || undefined, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, timeout: 10000 });
      const s = state.socket;
      s.on('connect', () => {
        state.connectAttempts = 0; setConnection(true, 'Connected');
        if (state.roomCode && state.playerId && state.resumeToken) {
          s.emit('room:resume', { code: state.roomCode, playerId: state.playerId, resumeToken: state.resumeToken }, response => {
            if (response && response.ok) { state.isHost = response.host; showToast('Reconnected to your battle.', 'success'); }
            else if (response && response.error) showToast(response.error, 'error');
          });
        }
      });
      s.on('disconnect', reason => { setConnection(false, 'Reconnecting…'); if (state.roomCode) showToast('Connection lost. Trying to reconnect…'); });
      s.on('connect_error', () => { setConnection(false, 'Server unavailable'); });
      s.on('room:update', handleRoomUpdate);
      s.on('question:sync', payload => { if (state.status === 'quiz') { state.question = payload.question; state.deadline = payload.deadline; state.answered = !!payload.answered; renderQuestion(payload.question); startCountdown(); } });
      s.on('score:update', payload => { renderScores(payload.leaderboard, 'quizScores'); $('answeredCount').textContent = `${payload.answeredCount} / ${payload.totalPlayers} ANSWERED`; });
      s.on('question:result', handleQuestionResult);
      s.on('game:finished', handleGameFinished);
      s.on('game:error', payload => showToast(payload.message || 'Something went wrong.', 'error'));
    } catch (error) {
      setConnection(false, 'Server not configured'); showToast(error.message, 'error');
    }
  }
  function emitAck(event, payload) {
    return new Promise(resolve => {
      if (!state.socket || !state.socket.connected) return resolve({ ok: false, error: 'Not connected to the game server. Please wait and try again.' });
      state.socket.timeout(6000).emit(event, payload, (err, response) => resolve(err ? { ok: false, error: 'The server did not respond. Please try again.' } : response || { ok: false, error: 'Unexpected server response.' }));
    });
  }
  function enterRoom(response, name) {
    state.roomCode = response.code; state.playerId = response.playerId; state.resumeToken = response.resumeToken; state.isHost = response.host; state.playerName = name;
    try { sessionStorage.setItem('brainBattleSession', JSON.stringify({ roomCode: state.roomCode, playerId: state.playerId, resumeToken: state.resumeToken, playerName: state.playerName })); } catch (_) {}
    showView('lobby'); $('roomCode').textContent = response.code; $('joinCode').value = '';
    if (state.socket) state.socket.emit('room:resume', { code: response.code, playerId: response.playerId, resumeToken: response.resumeToken }, () => {});
  }
  function handleRoomUpdate(room) {
    if (!state.roomCode || room.code !== state.roomCode) return;
    if (room.status === 'lobby' && state.status === 'home') showView('lobby');
    state.isHost = room.hostId === state.playerId;
    $('roomCode').textContent = room.code;
    $('playerCount').textContent = `${room.players.length} / 8`;
    $('capacityBar').style.width = `${room.players.length / 8 * 100}%`;
    $('lobbyPlayers').innerHTML = room.players.map((p, i) => `<div class="player-row"><div class="avatar avatar-${i % 5}">${esc(p.name.slice(0,1).toUpperCase())}</div><div class="player-name"><strong>${esc(p.name)}${p.id === state.playerId ? ' <span class="you-tag">YOU</span>' : ''}</strong><span>${p.isHost ? 'HOST' : p.connected ? 'READY TO PLAY' : 'RECONNECTING…'}</span></div>${p.isHost ? '<span class="host-crown">♛</span>' : `<span class="player-position">#${i + 1}</span>`}</div>`).join('');
    $('startButton').classList.toggle('hidden', !state.isHost);
    $('startButton').disabled = room.players.length < 2 || room.status !== 'lobby';
    $('startHint').textContent = room.players.length < 2 ? 'At least 2 players are needed to start.' : state.isHost ? 'Everyone ready? Let the battle begin.' : 'Waiting for the host to start the battle.';
    if (room.status === 'playing' || room.status === 'reveal') {
      if (state.status !== 'quiz') showView('quiz');
      if (room.question && (!state.question || state.question.number !== room.question.number)) {
        state.question = room.question; state.deadline = room.deadline; state.questionIndex = room.questionNumber - 1; state.answered = false; state.selectedIndex = null; renderQuestion(room.question); startCountdown();
      }
      renderScores(room.players, 'quizScores'); $('answeredCount').textContent = `${room.answeredCount} / ${room.players.length} ANSWERED`;
    }
    if (room.status === 'finished' && state.status !== 'results') showView('results');
  }
  function renderQuestion(question) {
    if (!question) return;
    state.question = question; state.questionIndex = question.number - 1;
    $('roundChip').innerHTML = `ROUND ${Math.ceil(question.number / 5)} <span>•</span> ${esc(question.category.toUpperCase())}`;
    $('questionCount').textContent = `QUESTION ${String(question.number).padStart(2, '0')} / 15`;
    $('questionProgress').style.width = `${question.number / 15 * 100}%`;
    $('questionCategory').textContent = question.category.toUpperCase(); $('questionText').textContent = question.question;
    $('answerGrid').innerHTML = question.options.map((option, i) => `<button class="answer-option" data-answer="${i}" ${state.answered ? 'disabled' : ''}><span class="answer-letter">${letters[i]}</span><span>${esc(option)}</span><span class="answer-check">${i === state.selectedIndex ? '✓' : ''}</span></button>`).join('');
    $('answerFeedback').textContent = state.answered ? 'Answer locked in. Good luck!' : 'Choose your answer before the timer runs out.';
    $('answerFeedback').className = 'answer-feedback';
    $('answerGrid').querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => submitAnswer(Number(button.dataset.answer))));
    if (state.answered) $('answerGrid').querySelectorAll('button').forEach(b => b.disabled = true);
  }
  async function submitAnswer(answerIndex) {
    if (state.answered || !state.roomCode) return;
    state.answered = true; state.selectedIndex = answerIndex;
    $('answerGrid').querySelectorAll('button').forEach((button, i) => { button.disabled = true; if (i === answerIndex) button.classList.add('selected'); });
    $('answerFeedback').textContent = 'Answer submitted! Waiting for everyone…';
    const response = await emitAck('answer:submit', { code: state.roomCode, answerIndex });
    if (!response.ok) {
      if (response.error === 'Time is up!') { $('answerFeedback').textContent = 'Time is up! Get ready for the next question.'; return; }
      if (response.error === 'Your answer has already been submitted.') return;
      state.answered = false; state.selectedIndex = null; $('answerGrid').querySelectorAll('button').forEach(b => { b.disabled = false; b.classList.remove('selected'); }); showToast(response.error, 'error');
    } else {
      $('answerFeedback').textContent = response.correct ? 'Correct! +100 points. ✦' : 'Answer locked. Keep going!';
      $('answerFeedback').classList.add(response.correct ? 'correct' : '');
      if (state.sound) playTone(response.correct ? 720 : 240, 0.09);
    }
  }
  function startCountdown() {
    if (state.countdownFrame) cancelAnimationFrame(state.countdownFrame);
    const tick = () => {
      if (!state.deadline || state.status !== 'quiz') return;
      const remaining = Math.max(0, (state.deadline - Date.now()) / 1000);
      const rounded = Math.ceil(remaining);
      $('timerValue').innerHTML = `${rounded}<span>s</span>`; $('ringNumber').textContent = rounded;
      $('timerRing').classList.toggle('urgent', remaining <= 5);
      $('ringFill').style.strokeDashoffset = String(270 - (remaining / 15) * 270);
      if (remaining > 0) state.countdownFrame = requestAnimationFrame(tick);
      else { $('answerGrid').querySelectorAll('button').forEach(b => b.disabled = true); if (!state.answered) $('answerFeedback').textContent = 'Time is up! Waiting for the next question…'; }
    };
    tick();
  }
  function renderScores(players, targetId) {
    const target = $(targetId); if (!target) return;
    target.innerHTML = players.map((p, i) => `<div class="score-row ${p.id === state.playerId ? 'is-you' : ''}"><span class="rank rank-${i+1}">${i === 0 ? '♛' : String(i+1).padStart(2,'0')}</span><span class="score-avatar avatar-${i%5}">${esc(p.name.slice(0,1).toUpperCase())}</span><span class="score-name">${esc(p.name)}${p.id === state.playerId ? '<small>YOU</small>' : ''}</span><strong class="score-value">${p.score}<small>PTS</small></strong></div>`).join('');
  }
  function handleQuestionResult(result) {
    if (state.status !== 'quiz') return;
    state.deadline = null;
    $('answerGrid').querySelectorAll('button').forEach((button, i) => {
      button.disabled = true;
      if (i === result.correctIndex) button.classList.add('correct-answer');
      if (i === state.selectedIndex && i !== result.correctIndex) button.classList.add('wrong-answer');
    });
    const mine = result.answers.find(a => a.playerId === state.playerId);
    $('answerFeedback').textContent = `${mine ? (mine.correct ? 'Correct — 100 points earned!' : 'Not quite this time.') : 'You did not answer in time.'} ${result.explanation}`;
    $('answerFeedback').className = `answer-feedback ${mine && mine.correct ? 'correct' : 'reveal'}`;
    renderScores(result.leaderboard, 'quizScores');
  }
  function handleGameFinished(result) {
    state.deadline = null; if (state.countdownFrame) cancelAnimationFrame(state.countdownFrame);
    showView('results');
    const winners = result.winners || [];
    $('winnerTitle').textContent = winners.length > 1 ? 'It’s a tie!' : `${winners[0] || 'A champion'} wins!`;
    $('winnerSubtitle').textContent = winners.length > 1 ? `${winners.join(' and ')} share the top spot. What a battle!` : `${winners[0] || 'The winner'} takes the crown. What a battle!`;
    const list = result.leaderboard || [];
    const podiumOrder = list.slice(0, 3);
    $('podium').innerHTML = podiumOrder.map((p, i) => `<div class="podium-place place-${i+1}"><div class="podium-avatar avatar-${i%5}">${esc(p.name.slice(0,1).toUpperCase())}<span>${i === 0 ? '♛' : i === 1 ? '✦' : '★'}</span></div><strong>${esc(p.name)}</strong><span class="podium-points">${p.score.toLocaleString()} pts</span><div class="podium-block"><span>${i+1}</span></div></div>`).join('');
    $('finalScores').innerHTML = list.map((p,i) => `<div class="final-score-row"><span class="final-rank">${String(i+1).padStart(2,'0')}</span><span class="score-avatar avatar-${i%5}">${esc(p.name.slice(0,1).toUpperCase())}</span><span class="score-name">${esc(p.name)}${p.id === state.playerId ? '<small>YOU</small>' : ''}</span><strong class="score-value">${p.score}<small>PTS</small></strong></div>`).join('');
    if (state.sound) playTone(880, .2);
  }
  function playTone(frequency, duration) {
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; const ctx = new Audio(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'sine'; gain.gain.setValueAtTime(.045, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + duration); oscillator.onended = () => ctx.close(); } catch (_) { /* Audio is optional. */ }
  }
  async function leaveRoom() {
    if (state.socket && state.roomCode) await emitAck('room:leave', { code: state.roomCode });
    state.roomCode = null; state.playerId = null; state.resumeToken = null; state.isHost = false; state.question = null; state.deadline = null; state.answered = false;
    try { sessionStorage.removeItem('brainBattleSession'); } catch (_) {}
    if (state.countdownFrame) cancelAnimationFrame(state.countdownFrame);
    showView('home');
  }
  $('createForm').addEventListener('submit', async event => {
    event.preventDefault(); const name = $('createName').value.trim(); if (!name) return;
    const response = await emitAck('room:create', { name }); if (!response.ok) return showToast(response.error, 'error'); enterRoom(response, name);
  });
  $('joinForm').addEventListener('submit', async event => {
    event.preventDefault(); const name = $('joinName').value.trim(); const code = $('joinCode').value.trim().toUpperCase();
    if (!name || !code) return showToast('Enter your name and room code.', 'error');
    const response = await emitAck('room:join', { name, code }); if (!response.ok) return showToast(response.error, 'error'); enterRoom(response, name);
  });
  $('joinCode').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,6); });
  $('startButton').addEventListener('click', async () => { const response = await emitAck('game:start', { code: state.roomCode }); if (!response.ok) showToast(response.error, 'error'); });
  $('copyCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.roomCode); $('copyCode').textContent = '✓ Code copied!'; setTimeout(() => $('copyCode').textContent = '▣ Copy invite code', 2000); } catch (_) { showToast(`Share room code: ${state.roomCode}`); } });
  $('lobbyLeave').addEventListener('click', leaveRoom); $('quizLeave').addEventListener('click', () => { if (confirm('Leave this game? You will lose your place in this match.')) leaveRoom(); });
  $('homeButton').addEventListener('click', leaveRoom); $('playAgain').addEventListener('click', leaveRoom);
  $('soundButton').addEventListener('click', () => { state.sound = !state.sound; $('soundButton').classList.toggle('muted', !state.sound); $('soundButton').textContent = state.sound ? '♪' : '×'; $('soundButton').setAttribute('aria-label', state.sound ? 'Mute sound' : 'Enable sound'); });
  window.addEventListener('online', () => { if (!state.socket || !state.socket.connected) connect(); });
  connect();
})();
