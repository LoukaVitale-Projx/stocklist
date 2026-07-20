/* Green Room — panel practice frontend.
   Vanilla JS. Every iOS/network landmine in the build spec is handled inline and commented. */

(() => {
  'use strict';

  // ---------- DOM ----------
  const greenRoom = document.getElementById('green-room');
  const chatScreen = document.getElementById('chat-screen');
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const coachBtn = document.getElementById('coach-btn');
  const endBtn = document.getElementById('end-btn');
  const backBtn = document.getElementById('back-btn');
  const voiceToggle = document.getElementById('voice-toggle');
  const timerEl = document.getElementById('timer');
  const liveDot = document.getElementById('live-dot');
  const modeLabel = document.getElementById('mode-label');

  const STORAGE_KEY = 'greenroom.session.v1';
  const VOICE_KEY = 'greenroom.voice.v1';

  // ---------- Mode kickoff messages (verbatim from spec) ----------
  const MODE_LABELS = { full: 'FULL RUN', rapid: 'RAPID FIRE', curveballs: 'CURVEBALLS' };
  const MODE_OPENERS = {
    full:
      'MODE: Full run. Work through the six official prompts roughly in order with natural follow-ups and occasional panellist beats. Open the panel now: one-sentence welcome, one-sentence theme intro, then your first question to Louka.',
    rapid:
      'MODE: Rapid fire. Random prompts and follow-ups, maximum pace, push for concision. Start immediately with a question, no preamble.',
    curveballs:
      'MODE: Curveballs. Ask realistic OFF-BRIEF questions: interest rates, construction costs, is the corridor boom a bubble, competitor dynamics, AI-hype scepticism, a simulated audience question, \'one prediction\'. Fair but probing. Start immediately.',
  };
  const COACH_MESSAGE =
    "[COACH] Step out of character. Give me candid coaching on my panel so far: what's landing, the three highest-impact fixes, my best line so far, whether the 70/30 property/tech balance is holding, and whether I've protected the apartment story. Be direct.";

  // ---------- State ----------
  // apiHistory: the strict user/assistant alternating array sent to the API.
  // uiLog: what we render (includes labels/types/durations). Kept in lockstep.
  const state = {
    mode: null,
    apiHistory: [],
    uiLog: [],
  };

  // Synchronous guard (NOT react state) so a double-tap can't fire two requests.
  let inFlight = false;

  let voiceOn = localStorage.getItem(VOICE_KEY) !== 'off';

  // ================= TIMER =================
  let timerInterval = null;
  let timerStart = 0;

  function clearTimerInterval() {
    // Always clear before starting — never stack intervals.
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function colorForSeconds(secs) {
    if (secs > 90) return 'red';
    if (secs >= 60) return 'amber';
    return '';
  }

  function renderTimer(secs) {
    timerEl.textContent = secs + 's';
    timerEl.classList.remove('amber', 'red');
    const c = colorForSeconds(secs);
    if (c) timerEl.classList.add(c);
  }

  function startTimer() {
    clearTimerInterval();
    timerStart = Date.now();
    renderTimer(0);
    liveDot.classList.add('running');
    timerInterval = setInterval(() => {
      renderTimer(Math.floor((Date.now() - timerStart) / 1000));
    }, 250);
  }

  function stopTimer() {
    clearTimerInterval();
    liveDot.classList.remove('running');
    if (!timerStart) return 0;
    const secs = Math.floor((Date.now() - timerStart) / 1000);
    timerStart = 0;
    return secs;
  }

  // ================= SPEECH (TTS) =================
  const synth = window.speechSynthesis;
  const speechSupported = typeof synth !== 'undefined';
  let chosenVoice = null;
  let primed = false; // audio-unlock guard — only prime once.

  function pickVoice() {
    if (!speechSupported) return null;
    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return null; // getVoices() is [] on first call.

    const byLang = (re) => voices.filter((v) => re.test(v.lang || ''));

    // en-AU male first (name match), then any en-AU, then en-GB, then any en-*.
    const au = byLang(/en[-_]AU/i);
    const auMale = au.find((v) => /lee|james|russell/i.test(v.name || ''));
    if (auMale) return auMale;
    if (au.length) return au[0];

    const gb = byLang(/en[-_]GB/i);
    if (gb.length) return gb[0];

    const anyEn = byLang(/^en/i);
    if (anyEn.length) return anyEn[0];

    return voices[0] || null;
  }

  function refreshVoice() {
    const v = pickVoice();
    if (v) chosenVoice = v; // never permanently cache a null decision.
  }

  if (speechSupported) {
    refreshVoice();
    // Voices load asynchronously on Chrome/Safari.
    synth.onvoiceschanged = refreshVoice;
  }

  // iOS only allows speech chains started from a user gesture. Prime a silent
  // utterance synchronously on the first tap so later async speech is permitted.
  function primeAudio() {
    if (!speechSupported || primed) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
      primed = true;
    } catch (_) {
      /* ignore */
    }
  }

  // Convert Adam's text to something natural to speak aloud.
  function speechText(raw) {
    let t = raw;
    // "— Rebekah:" / "- Rebekah:" panellist labels -> "Rebekah says:"
    t = t.replace(/[—–-]\s*([A-Z][a-zA-Z]+):/g, '$1 says:');
    // Strip common markdown symbols.
    t = t.replace(/[*_`#>]/g, '');
    // Collapse whitespace.
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  // Split into sentence-level chunks so iOS/desktop-Chrome don't truncate long speech.
  function chunkSentences(text) {
    const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  function speak(raw) {
    if (!speechSupported || !voiceOn) return;
    const text = speechText(raw);
    if (!text) return;

    const doSpeak = () => {
      // In case voices only just became available.
      if (!chosenVoice) refreshVoice();
      const chunks = chunkSentences(text);
      chunks.forEach((chunk) => {
        const u = new SpeechSynthesisUtterance(chunk);
        if (chosenVoice) u.voice = chosenVoice;
        // Explicit lang as a fallback even when a voice is chosen.
        u.lang = (chosenVoice && chosenVoice.lang) || 'en-AU';
        u.rate = 1.02;
        u.pitch = 0.95;
        synth.speak(u);
      });
    };

    // cancel()-then-speak() silently drops the utterance on iOS: wait ≥100ms.
    synth.cancel();
    setTimeout(doSpeak, 120);
  }

  // ================= RENDERING =================
  function scrollToBottomSoon() {
    // Let layout settle after keyboard open/close before scrolling.
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 120);
  }

  // Render one Adam message card. Returns nothing.
  function renderAdam(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg adam';

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = 'ADAM DI MARCO · MODERATOR';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text; // textContent — never innerHTML (XSS-safe).

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const play = document.createElement('button');
    play.className = 'play-btn';
    play.type = 'button';
    play.textContent = '▶ Play';
    play.addEventListener('click', () => {
      primeAudio();
      speak(text);
    });
    meta.appendChild(play);

    wrap.append(label, bubble, meta);
    messagesEl.appendChild(wrap);
  }

  function renderUser(text, seconds) {
    const wrap = document.createElement('div');
    wrap.className = 'msg user';

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = 'YOU · PROJX';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    wrap.append(label, bubble);

    if (typeof seconds === 'number') {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      const secs = document.createElement('span');
      secs.className = 'answer-secs';
      const c = colorForSeconds(seconds);
      if (c) secs.classList.add(c);
      secs.textContent = seconds + 's';
      meta.appendChild(secs);
      wrap.appendChild(meta);
    }

    messagesEl.appendChild(wrap);
  }

  function renderCoach(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg coach';

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = "COACH'S NOTES";

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    wrap.append(label, bubble);
    messagesEl.appendChild(wrap);
  }

  // Re-render everything from uiLog (used on restore).
  function renderAll() {
    messagesEl.textContent = '';
    for (const item of state.uiLog) {
      if (item.role === 'adam') renderAdam(item.text);
      else if (item.role === 'user') renderUser(item.text, item.seconds);
      else if (item.role === 'coach') renderCoach(item.text);
    }
    scrollToBottomSoon();
  }

  // Transient typing indicator (removable).
  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg adam typing';
    wrap.id = 'typing-indicator';
    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = 'ADAM DI MARCO · MODERATOR';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = 'Adam is thinking…';
    wrap.append(label, bubble);
    messagesEl.appendChild(wrap);
    scrollToBottomSoon();
  }

  function removeTyping() {
    const t = document.getElementById('typing-indicator');
    if (t) t.remove();
  }

  function showError(message) {
    removeTyping();
    const note = document.createElement('div');
    note.className = 'error-note';
    note.textContent = message;
    messagesEl.appendChild(note);
    scrollToBottomSoon();
  }

  // ================= PERSISTENCE =================
  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: state.mode, apiHistory: state.apiHistory, uiLog: state.uiLog })
      );
    } catch (_) {
      /* storage full / disabled — non-fatal */
    }
  }

  function restore() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_) {
      saved = null;
    }
    if (!saved || !Array.isArray(saved.apiHistory) || saved.apiHistory.length === 0) return false;
    state.mode = saved.mode;
    state.apiHistory = saved.apiHistory;
    state.uiLog = Array.isArray(saved.uiLog) ? saved.uiLog : [];
    modeLabel.textContent = MODE_LABELS[state.mode] || 'PANEL';
    showChat();
    renderAll();
    return true;
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
    state.mode = null;
    state.apiHistory = [];
    state.uiLog = [];
    messagesEl.textContent = '';
    if (speechSupported) synth.cancel();
    stopTimer();
    renderTimer(0);
  }

  // ================= NETWORK =================
  // POST the full history to the backend. One auto-retry for network/529. 60s abort.
  async function callApi(messages) {
    const attempt = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        let data = null;
        try {
          data = await res.json();
        } catch (_) {
          data = null;
        }

        if (!res.ok) {
          const msg = (data && data.error) || `Request failed (${res.status})`;
          const err = new Error(msg);
          err.httpStatus = res.status;
          err.retryable = res.status === 529 || res.status >= 500;
          throw err;
        }

        const text = data && typeof data.text === 'string' ? data.text.trim() : '';
        // Never render an empty reply — treat it as a failure.
        if (!text) {
          const err = new Error('Adam went silent — empty reply');
          err.httpStatus = res.status;
          err.retryable = true;
          throw err;
        }
        return text;
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          const e = new Error('Request timed out after 60s (timeout)');
          e.retryable = true;
          throw e;
        }
        if (typeof err.httpStatus === 'undefined') {
          // Network-level failure (fetch rejected).
          err.retryable = true;
          err.networkLevel = true;
        }
        throw err;
      }
    };

    try {
      return await attempt();
    } catch (err) {
      if (err.retryable) {
        // One automatic retry after 1.4s.
        await new Promise((r) => setTimeout(r, 1400));
        return await attempt();
      }
      throw err;
    }
  }

  function errorSuffix(err) {
    if (typeof err.httpStatus === 'number') return `HTTP ${err.httpStatus}`;
    if (err.networkLevel) return 'network';
    return err.message || 'error';
  }

  // ================= TURN FLOW =================
  // Send a user-role message to the API and render Adam's reply.
  // `display` controls how the outgoing message shows in the UI:
  //   { kind: 'user', seconds } | { kind: 'coach' } | { kind: 'hidden' } (mode opener)
  async function sendTurn(userText, display) {
    if (inFlight) return;
    inFlight = true;
    sendBtn.disabled = true;

    // Build the outgoing history (strict alternation — last entry must be user).
    const outgoing = state.apiHistory.concat([{ role: 'user', content: userText }]);

    // Optimistic UI for a real answer / coach request.
    let optimisticItem = null;
    if (display.kind === 'user') {
      optimisticItem = { role: 'user', text: userText, seconds: display.seconds };
      state.uiLog.push(optimisticItem);
      renderUser(userText, display.seconds);
    } else if (display.kind === 'coach') {
      optimisticItem = { role: 'coach', text: 'Asking the coach…', pending: true };
      // We don't render the raw [COACH] prompt; just show the incoming notes after.
    }
    showTyping();
    scrollToBottomSoon();

    try {
      const reply = await callApi(outgoing);
      removeTyping();

      // Commit history only on success.
      state.apiHistory = outgoing.concat([{ role: 'assistant', content: reply }]);

      // Render + log Adam's reply. Coach turns render as coach notes.
      if (display.kind === 'coach') {
        renderCoach(reply);
        state.uiLog.push({ role: 'coach', text: reply });
      } else {
        renderAdam(reply);
        state.uiLog.push({ role: 'adam', text: reply });
      }

      persist();
      scrollToBottomSoon();

      // Adam speaks; then the answer timer restarts for the next reply.
      speak(reply);
      startTimer();
    } catch (err) {
      removeTyping();
      // Restore-on-failure: remove the optimistic bubble and give typed text back.
      if (display.kind === 'user' && optimisticItem) {
        const idx = state.uiLog.indexOf(optimisticItem);
        if (idx !== -1) state.uiLog.splice(idx, 1);
        // Remove the last rendered user bubble.
        const userMsgs = messagesEl.querySelectorAll('.msg.user');
        if (userMsgs.length) userMsgs[userMsgs.length - 1].remove();
        inputEl.value = userText; // never lose typed input.
        autoGrow();
        // Timer was running for this answer — resume it so timing isn't lost.
        startTimer();
      }
      showError(`${err.message} (${errorSuffix(err)})`);
    } finally {
      inFlight = false;
      sendBtn.disabled = false;
    }
  }

  // ================= EVENT HANDLERS =================
  function showChat() {
    greenRoom.classList.add('hidden');
    chatScreen.classList.remove('hidden');
  }

  function showGreenRoom() {
    chatScreen.classList.add('hidden');
    greenRoom.classList.remove('hidden');
  }

  function startMode(mode) {
    primeAudio(); // user gesture — unlock audio.
    state.mode = mode;
    state.apiHistory = [];
    state.uiLog = [];
    messagesEl.textContent = '';
    modeLabel.textContent = MODE_LABELS[mode] || 'PANEL';
    showChat();
    // Opener is a hidden user message; Adam's first question is the first thing shown.
    sendTurn(MODE_OPENERS[mode], { kind: 'hidden' });
  }

  document.querySelectorAll('.mode-card').forEach((card) => {
    card.addEventListener('click', () => startMode(card.dataset.mode));
  });

  function handleSend() {
    primeAudio(); // every tap re-primes-safe (guarded), keeps iOS audio alive.
    if (inFlight) return;
    const text = inputEl.value.trim();
    if (!text) return;
    const seconds = stopTimer();
    inputEl.value = '';
    autoGrow();
    sendTurn(text, { kind: 'user', seconds });
  }

  sendBtn.addEventListener('click', handleSend);

  // Enter to send on desktop; Shift+Enter for newline. On mobile the Send button is primary.
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch()) {
      e.preventDefault();
      handleSend();
    }
  });

  function isTouch() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  coachBtn.addEventListener('click', () => {
    primeAudio();
    if (inFlight) return;
    if (state.apiHistory.length === 0) return; // nothing to coach yet.
    sendTurn(COACH_MESSAGE, { kind: 'coach' });
  });

  endBtn.addEventListener('click', () => {
    if (!confirm('End this session and clear the transcript?')) return;
    clearSession();
    showGreenRoom();
  });

  backBtn.addEventListener('click', () => {
    // Leave without clearing — session persists for restore.
    if (speechSupported) synth.cancel();
    stopTimer();
    showGreenRoom();
  });

  voiceToggle.addEventListener('click', () => {
    voiceOn = !voiceOn;
    localStorage.setItem(VOICE_KEY, voiceOn ? 'on' : 'off');
    applyVoiceToggle();
    if (!voiceOn && speechSupported) synth.cancel();
  });

  function applyVoiceToggle() {
    voiceToggle.textContent = voiceOn ? 'Voice on' : 'Voice off';
    voiceToggle.classList.toggle('on', voiceOn);
    voiceToggle.setAttribute('aria-pressed', String(voiceOn));
  }

  // Auto-grow textarea.
  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  }
  inputEl.addEventListener('input', autoGrow);

  // ================= INIT =================
  applyVoiceToggle();
  // Restore an in-progress session if one exists; if restored, keep the timer stopped
  // until the user acts (they're reading Adam's last message).
  const restored = restore();
  if (restored) {
    renderTimer(0);
  }
})();
