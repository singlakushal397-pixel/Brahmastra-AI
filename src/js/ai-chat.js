/**
 * Per-Character Streaming OpenAI Chat Controller.
 * - Never handles or stores secret OpenAI API keys in browser JS.
 * - Communicates exclusively with /api/chat/stream via SSE.
 * - Isolates conversation history per character and session.
 */
export class CharacterAIChat {
  constructor({
    messagesEl,
    promptsEl,
    formEl,
    inputEl,
    sendBtnEl,
    stopBtnEl,
    statusBadgeEl,
    clearBtnEl,
    newChatBtnEl,
    persistToggleEl,
    privacyBtnEl,
    privacyModalEl,
    privacyCloseEl,
    deleteAllBtnEl,
    onSpeakingChange,
  }) {
    this.messagesEl = messagesEl;
    this.promptsEl = promptsEl;
    this.formEl = formEl;
    this.inputEl = inputEl;
    this.sendBtnEl = sendBtnEl;
    this.stopBtnEl = stopBtnEl;
    this.statusBadgeEl = statusBadgeEl;
    this.clearBtnEl = clearBtnEl;
    this.newChatBtnEl = newChatBtnEl;
    this.persistToggleEl = persistToggleEl;
    this.privacyBtnEl = privacyBtnEl;
    this.privacyModalEl = privacyModalEl;
    this.privacyCloseEl = privacyCloseEl;
    this.deleteAllBtnEl = deleteAllBtnEl;
    this.onSpeakingChange = onSpeakingChange || (() => {});

    this.apiBase = this._resolveApiBase();
    this.sessionId = this._getOrCreateSessionId();
    this.optInPersist = localStorage.getItem('ff_chat_opt_in_persist') === 'true';
    this.conversations = this._loadOptInConversations();
    this.activeChar = null;
    this.abortController = null;
    this.isStreaming = false;
    this.lastFailedMessage = null;

    this._bindEvents();
    this.checkHealth();
  }

  _resolveApiBase() {
    if (window.location.port === '5500') {
      return `${window.location.protocol}//${window.location.hostname}:8080`;
    }
    return '';
  }

  _getOrCreateSessionId() {
    let sid = sessionStorage.getItem('ff_ai_session_id');
    if (!sid || !/^[A-Za-z0-9_-]{8,128}$/.test(sid)) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      sid = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('ff_ai_session_id', sid);
    }
    return sid;
  }

  _loadOptInConversations() {
    if (!this.optInPersist) return {};
    try {
      const raw = localStorage.getItem('ff_ai_conversations_v2');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _saveOptInConversations() {
    if (!this.optInPersist) return;
    try {
      localStorage.setItem('ff_ai_conversations_v2', JSON.stringify(this.conversations));
    } catch {
      // Ignore storage quota errors
    }
  }

  _bindEvents() {
    if (this.persistToggleEl) {
      this.persistToggleEl.checked = this.optInPersist;
      this.persistToggleEl.onchange = () => {
        this.optInPersist = this.persistToggleEl.checked;
        localStorage.setItem('ff_chat_opt_in_persist', String(this.optInPersist));
        if (this.optInPersist) {
          this._saveOptInConversations();
        } else {
          localStorage.removeItem('ff_ai_conversations_v2');
        }
      };
    }

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.formEl.requestSubmit();
      }
    });

    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = `${Math.min(110, this.inputEl.scrollHeight)}px`;
    });

    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.inputEl.value.trim();
      if (!text || this.isStreaming) return;
      this.sendMessage(text);
    });

    if (this.stopBtnEl) {
      this.stopBtnEl.onclick = () => this.cancelStream();
    }

    if (this.clearBtnEl) {
      this.clearBtnEl.onclick = () => this.clearActiveCharacter();
    }
    if (this.newChatBtnEl) {
      this.newChatBtnEl.onclick = () => this.clearActiveCharacter();
    }

    if (this.privacyBtnEl && this.privacyModalEl) {
      this.privacyBtnEl.onclick = () => {
        this.privacyModalEl.hidden = false;
      };
    }
    if (this.privacyCloseEl && this.privacyModalEl) {
      this.privacyCloseEl.onclick = () => {
        this.privacyModalEl.hidden = true;
      };
    }
    if (this.deleteAllBtnEl) {
      this.deleteAllBtnEl.onclick = () => this.deleteAllData();
    }
  }

  async checkHealth() {
    if (!this.statusBadgeEl) return;
    try {
      const res = await fetch(`${this.apiBase}/api/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Health check failed');
      const data = await res.json();
      if (data.openaiConfigured) {
        this.statusBadgeEl.textContent = `● AI READY (${data.model})`;
        this.statusBadgeEl.dataset.state = 'ready';
      } else {
        this.statusBadgeEl.textContent = '● ADD OPENAI_API_KEY IN .ENV';
        this.statusBadgeEl.dataset.state = 'warn';
      }
    } catch {
      this.statusBadgeEl.textContent = '● BACKEND OFFLINE (RUN SERVER.PY)';
      this.statusBadgeEl.dataset.state = 'error';
    }
  }

  setCharacter(char) {
    if (this.isStreaming) {
      this.cancelStream();
    }
    this.activeChar = char;
    if (!this.conversations[char.id]) {
      this.conversations[char.id] = [
        {
          role: 'bot',
          text: this._welcomeGreeting(char),
          timestamp: new Date().toISOString(),
        },
      ];
    }
    this.renderPrompts();
    this.renderMessages();
  }

  _welcomeGreeting(char) {
    if (char.id === 'alok') {
      return `Hey! I'm DJ Alok — ready to drop the beat and lift the squad. Ask me about music, teamwork, motivation, or my ${char.skill} aura!`;
    }
    if (char.id === 'chrono') {
      return `Chrono online. Time Turner systems calibrated. State your tactical objective or ask anything about strategy, protection, and technology.`;
    }
    if (char.id === 'k') {
      return `I am K — Captain Booyah. Whether you want to explore Jiu-jitsu and Psychology modes or build mental discipline, let's begin.`;
    }
    if (char.id === 'kelly') {
      return `Hey there! I'm Kelly! Ready to pick up the pace? Ask me about Deadly Velocity, staying motivated, or outrunning every obstacle!`;
    }
    if (char.id === 'orion') {
      return `I am Orion. Crimson Energy runs sharp today — ask what you will about Crimson Crush, resilience, or mastering what is inside you.`;
    }
    if (char.status === 'configurable_placeholder') {
      return `${char.displayName} slot initialized. Canonical Free Fire biography and 3D model assets are currently pending configuration.`;
    }
    return `Yo, I'm ${char.displayName}. Ask me about ${char.skill}, Free Fire tactics, or anything on your mind.`;
  }

  renderPrompts() {
    if (!this.promptsEl || !this.activeChar) return;
    const prompts = this.activeChar.suggestedPrompts || [];
    this.promptsEl.innerHTML = '';
    prompts.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-prompt-chip';
      btn.textContent = p;
      btn.onclick = () => {
        if (!this.isStreaming) this.sendMessage(p);
      };
      this.promptsEl.appendChild(btn);
    });
  }

  renderMessages() {
    if (!this.activeChar) return;
    const list = this.conversations[this.activeChar.id] || [];
    this.messagesEl.innerHTML = '';

    list.forEach((msg, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = `chat-msg-row ${msg.role === 'user' ? 'user' : 'bot'}`;

      if (msg.role !== 'user') {
        const header = document.createElement('div');
        header.className = 'chat-msg-meta';
        header.innerHTML = `
          <span class="chat-avatar-badge" style="border-color:${this.activeChar.accentHex};color:${this.activeChar.accentHex}">
            ${this._escape(this.activeChar.displayName.slice(0, 2).toUpperCase())}
          </span>
          <span class="chat-sender-name">${this._escape(this.activeChar.displayName)}</span>
          <span class="chat-time">${this._formatTime(msg.timestamp)}</span>
        `;
        wrapper.appendChild(header);
      } else {
        const header = document.createElement('div');
        header.className = 'chat-msg-meta user';
        header.innerHTML = `<span class="chat-sender-name">You</span><span class="chat-time">${this._formatTime(msg.timestamp)}</span>`;
        wrapper.appendChild(header);
      }

      const bubble = document.createElement('div');
      bubble.className = `chat-msg ${msg.role}${msg.isError ? ' error' : ''}`;
      if (msg.streaming && !msg.text) {
        bubble.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
      } else {
        bubble.innerHTML = this._escape(msg.text).replace(/\n/g, '<br>');
        if (msg.streaming) {
          bubble.innerHTML += '<span class="stream-cursor">▌</span>';
        }
      }
      wrapper.appendChild(bubble);

      if (msg.role !== 'user' && !msg.streaming) {
        const actions = document.createElement('div');
        actions.className = 'chat-msg-actions';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'chat-mini-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(msg.text);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
          } catch {}
        };
        actions.appendChild(copyBtn);

        if (msg.isError && index === list.length - 1 && this.lastFailedMessage) {
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'chat-mini-btn retry';
          retryBtn.textContent = '↻ Retry';
          retryBtn.onclick = () => {
            const retryText = this.lastFailedMessage;
            // Remove error + failed user message before retrying cleanly
            list.pop();
            if (list.length && list[list.length - 1].role === 'user') list.pop();
            this.sendMessage(retryText);
          };
          actions.appendChild(retryBtn);
        }

        wrapper.appendChild(actions);
      }

      this.messagesEl.appendChild(wrapper);
    });

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  async sendMessage(text) {
    if (!this.activeChar) return;
    const charId = this.activeChar.id;
    const list = this.conversations[charId];

    this.lastFailedMessage = text;
    list.push({ role: 'user', text, timestamp: new Date().toISOString() });
    const botMsg = { role: 'bot', text: '', timestamp: new Date().toISOString(), streaming: true, isError: false };
    list.push(botMsg);

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this._setStreamingState(true);
    this.renderMessages();

    this.abortController = new AbortController();

    try {
      const res = await fetch(`${this.apiBase}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: charId,
          sessionId: this.sessionId,
          message: text,
        }),
        signal: this.abortController.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('text/event-stream')) {
        let errMsg = `Server error (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          this._processSseFrame(frame, botMsg);
        }
        this.renderMessages();
      }
      if (buffer.trim()) {
        this._processSseFrame(buffer, botMsg);
      }

      botMsg.streaming = false;
      if (!botMsg.text && !botMsg.isError) {
        botMsg.text = 'No response received from AI provider.';
        botMsg.isError = true;
      } else if (!botMsg.isError) {
        this.lastFailedMessage = null;
      }
    } catch (err) {
      botMsg.streaming = false;
      if (err.name === 'AbortError') {
        botMsg.text = botMsg.text || '[Generation stopped]';
      } else {
        botMsg.isError = true;
        botMsg.text = err.message || 'Failed to connect to AI backend.';
      }
    } finally {
      this._setStreamingState(false);
      this.abortController = null;
      this.renderMessages();
      this._saveOptInConversations();
    }
  }

  _processSseFrame(frame, botMsg) {
    let eventName = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (!dataLines.length) return;
    let payload;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    if (eventName === 'delta' && payload.content) {
      botMsg.text += payload.content;
    } else if (eventName === 'done') {
      botMsg.streaming = false;
      if (payload.timestamp) botMsg.timestamp = payload.timestamp;
    } else if (eventName === 'error') {
      botMsg.streaming = false;
      botMsg.isError = true;
      botMsg.text = payload.message || 'Upstream AI error.';
    }
  }

  _setStreamingState(streaming) {
    this.isStreaming = streaming;
    this.onSpeakingChange(streaming);
    if (this.sendBtnEl) this.sendBtnEl.disabled = streaming;
    if (this.stopBtnEl) this.stopBtnEl.hidden = !streaming;
  }

  cancelStream() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async clearActiveCharacter() {
    if (!this.activeChar) return;
    if (this.isStreaming) this.cancelStream();

    try {
      await fetch(`${this.apiBase}/api/chat/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          characterId: this.activeChar.id,
        }),
      });
    } catch {}

    this.conversations[this.activeChar.id] = [
      {
        role: 'bot',
        text: this._welcomeGreeting(this.activeChar),
        timestamp: new Date().toISOString(),
      },
    ];
    this._saveOptInConversations();
    this.renderMessages();
  }

  async deleteAllData() {
    if (this.isStreaming) this.cancelStream();
    try {
      await fetch(`${this.apiBase}/api/chat/session`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
    } catch {}
    this.conversations = {};
    localStorage.removeItem('ff_ai_conversations_v2');
    if (this.activeChar) this.setCharacter(this.activeChar);
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}
