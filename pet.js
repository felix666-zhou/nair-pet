/**
 * 奈儿 · 网页桌宠主程序
 *
 * 设计要点：
 *  · 纯前端、零依赖、零服务端：双击 index.html 或用任意静态服务器都能跑；
 *  · 复用 DSH 桌宠的共享组件（shared-core.js）——右键菜单、聊天气泡/输入框、物理参数同一套，观感与桌面版一致；
 *  · API Key / 模型 / 人设由每位使用者自己填，只存在浏览器 localStorage，请求直接从浏览器发往使用者填的接口；
 *  · 不存在任何第三方中转：她没有"云端"，页面关掉她就消失。
 */
(() => {
  'use strict';

  const S = window.PetShared;
  const CFG = window.NAI_CONFIG;
  if (!S || !CFG) {
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f88">缺少 shared-core.js 或 config.js</pre>');
    return;
  }

  // ---------------------------------------------------------------- 设置与记忆

  const SETTINGS_KEY = 'nai-web-settings-v1';
  const MEMORY_KEY = 'nai-web-memory-v1';
  const realFetch = window.fetch.bind(window);

  const DEFAULT_PROMPT = CFG.whisperPrompt || '你是主人桌面上的Q版蓝发小女仆，说话调皮可爱、句子短。';
  const DEFAULTS = {
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: '',
    size: 0,
    speak: false,
    bubble: true,
    prompt: DEFAULT_PROMPT,
  };

  function loadSettings() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch {
      return { ...DEFAULTS };
    }
  }
  const settings = loadSettings();
  function persistSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* 隐身模式等场景忽略 */
    }
  }

  function loadMemory() {
    try {
      const list = JSON.parse(window.localStorage.getItem(MEMORY_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function pushMemory(userText, reply) {
    const rounds = Math.max(0, Number(CFG.chatMemoryRounds) || 5);
    const list = loadMemory();
    list.push({ role: 'user', content: userText }, { role: 'assistant', content: reply });
    try {
      window.localStorage.setItem(MEMORY_KEY, JSON.stringify(list.slice(-rounds * 2)));
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 模型调用

  const cleanForSpeech = (t) =>
    String(t || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/[*_`#>|]/g, '')
      .trim();

  function apiBase() {
    return String(settings.baseURL || '').replace(/\/+$/, '');
  }

  async function llm(messages, opts = {}) {
    if (!settings.apiKey) throw new Error('还没填 API Key：点左下角齿轮');
    if (!apiBase()) throw new Error('还没填接口地址');
    const body = { model: settings.model || 'deepseek-chat', messages, temperature: 1, stream: false };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    const res = await realFetch(apiBase() + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.apiKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + text.slice(0, 160));
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('接口返回的不是 JSON：' + text.slice(0, 120));
    }
    const reply = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!reply || !String(reply).trim()) throw new Error('模型没有返回内容');
    return String(reply).trim();
  }

  async function chatReply(userText) {
    const history = loadMemory().map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    const messages = [{ role: 'system', content: settings.prompt || DEFAULT_PROMPT }, ...history, { role: 'user', content: userText }];
    const reply = await llm(messages);
    pushMemory(userText, reply);
    return reply;
  }

  async function whisperLine() {
    return llm(
      [
        { role: 'system', content: settings.prompt || DEFAULT_PROMPT },
        { role: 'user', content: '随便说一句此刻的碎碎念。' },
      ],
      { maxTokens: 200 },
    );
  }

  async function queryBalance() {
    if (!settings.apiKey) {
      return { ok: false, provider: '-', reason: 'credential-missing', title: '还没填 API Key', message: '点左下角齿轮，填上你自己接口的 Key' };
    }
    try {
      const res = await realFetch(apiBase() + '/user/balance', { headers: { authorization: 'Bearer ' + settings.apiKey } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const info = json && Array.isArray(json.balance_infos) ? json.balance_infos[0] : null;
      if (!info) throw new Error('该接口没有余额信息');
      return {
        ok: true,
        provider: 'deepseek',
        kind: 'deepseek',
        currency: info.currency,
        total: info.total_balance,
        granted: info.granted_balance,
        toppedUp: info.top_up_balance || info.topped_up_balance,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        provider: apiBase().replace(/^https?:\/\//, ''),
        reason: 'fetch-error',
        title: '余额查询失败',
        message: String(error && error.message) + '（只有 DeepSeek 官方接口支持查余额）',
      };
    }
  }

  // 让共享组件（聊天输入框）能走我们自己的逻辑：拦截虚拟接口
  window.fetch = function patchedFetch(url, init) {
    const u = String(url);
    if (u.indexOf('__nai/') < 0) return realFetch(url, init);
    if (u.indexOf('/chat') >= 0) {
      let text = '';
      try {
        text = JSON.parse((init && init.body) || '{}').text || '';
      } catch {
        /* ignore */
      }
      return chatReply(text)
        .then((reply) => jsonResponse({ ok: true, reply, ts: Date.now() }))
        .catch((error) => jsonResponse({ ok: false, reason: 'generate-error', message: String(error && error.message) }));
    }
    return jsonResponse({ ok: false, reason: 'bad-request', message: '未知虚拟接口' }, 404);
  };
  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
  }

  // ---------------------------------------------------------------- 朗读（浏览器语音）

  let voicePick = null;
  function pickChineseVoice() {
    if (voicePick) return voicePick;
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    voicePick = voices.find((v) => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Xiaoyi|Huihui|Yaoyao|晓|慧|瑶/i.test(v.name))
      || voices.find((v) => /^zh/i.test(v.lang))
      || null;
    return voicePick;
  }
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { voicePick = null; pickChineseVoice(); };

  function speak(text) {
    if (!settings.speak || !window.speechSynthesis) return;
    const say = cleanForSpeech(text);
    if (!say) return;
    try {
      const u = new SpeechSynthesisUtterance(say);
      u.lang = 'zh-CN';
      u.rate = 1.02;
      u.pitch = 1.18;
      const v = pickChineseVoice();
      if (v) u.voice = v;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 桌宠引擎

  const petEl = document.getElementById('nai-pet');
  const stageEl = document.getElementById('nai-stage');
  const hitEl = document.getElementById('nai-hit');
  const bubbleEl = document.getElementById('nai-bubble');
  const videos = Array.from(petEl.querySelectorAll('video'));

  const anim = CFG.animations;
  const weights = CFG.animationWeights || { idle: 10, turn: 5, move: 5 };
  const moveDef = (anim.moves && anim.moves.default) || { minDist: 60, maxDist: 240, margin: 20, leadSec: 2, tailSec: 2 };

  const pet = {
    size: settings.size > 0 ? settings.size : CFG.pet.size,
    x: 0,
    y: 0,
    facing: 'left',
    anim: '',
    animUntil: 0,
    busy: false,
    dragging: false,
    walking: false,
    walking2: false,
    paused: false,
    vx: 0,
    vy: 0,
    tossing: false,
  };

  function petHeight() {
    return Math.round(pet.size * 9 / 16);
  }

  function applyPetSize() {
    document.documentElement.style.setProperty('--pet-size', pet.size + 'px');
    const h = petHeight();
    // 身体命中区（比例取自桌面版实测：人物在画面中央偏下）
    hitEl.style.left = Math.round(pet.size * 0.2) + 'px';
    hitEl.style.top = Math.round(h * 0.14) + 'px';
    hitEl.style.width = Math.round(pet.size * 0.3) + 'px';
    hitEl.style.height = Math.round(h * 0.58) + 'px';
    bubbleEl.style.bottom = h + 6 + 'px';
    petEl.style.width = pet.size + 'px';
    petEl.style.height = h + 'px';
  }

  function clampPosition() {
    const w = pet.size;
    const h = petHeight();
    pet.x = Math.max(4, Math.min(pet.x, window.innerWidth - w - 4));
    pet.y = Math.max(4, Math.min(pet.y, window.innerHeight - h - 4));
  }

  function render() {
    petEl.style.transform = `translate3d(${Math.round(pet.x)}px, ${Math.round(pet.y)}px, 0)`;
  }

  function applyFacing() {
    stageEl.style.transform = pet.facing === 'right' ? 'scaleX(-1)' : 'none';
  }

  /** 双缓冲交叉淡入播放动画（与桌面版同一套做法） */
  function playAnim(name, opts = {}) {
    if (!name) return null;
    if (pet.anim === name && opts.loop) return null;
    const back = videos.find((v) => !v.classList.contains('is-front')) || videos[1];
    const front = videos.find((v) => v !== back);
    back.loop = !!opts.loop;
    back.muted = true;
    back.src = './assets/webm/' + encodeURIComponent(name) + '.webm';
    const p = back.play();
    if (p && p.catch) p.catch(() => {});
    back.classList.add('is-front');
    if (front) front.classList.remove('is-front');
    pet.anim = name;
    return back;
  }

  function showBubble(textOrRows, ms = 4200) {
    if (!settings.bubble) return;
    const rows = Array.isArray(textOrRows) ? textOrRows : [{ role: 'label', text: String(textOrRows) }];
    bubbleEl.innerHTML = '';
    let multi = false;
    for (const r of rows) {
      if (!r || !r.text) continue;
      const div = document.createElement('div');
      if (r.role === 'sub') div.className = 'row-sub';
      else if (r.role === 'error') div.className = 'row-err';
      else if (r.role === 'tier') div.className = 'row-tier-' + r.tier;
      else if (rows.length > 1) multi = true;
      div.textContent = r.text;
      bubbleEl.appendChild(div);
    }
    bubbleEl.classList.toggle('rows', multi || rows.length > 1);
    bubbleEl.classList.add('is-on');
    window.clearTimeout(showBubble.timer);
    showBubble.timer = window.setTimeout(() => bubbleEl.classList.remove('is-on'), ms);
  }

  function randomOf(list) {
    return list && list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
  function between(a, b) {
    return a + Math.random() * (b - a);
  }

  function pickKind() {
    const items = [
      { kind: 'idle', w: Number(weights.idle) || 10 },
      { kind: 'turn', w: Number(weights.turn) || 5 },
      { kind: 'move', w: Number(weights.move) || 5 },
    ];
    for (const c of anim.categories || []) {
      if (c.actions && c.actions.length) items.push({ kind: 'cat', cat: c, w: Number(c.weight) || 10 });
    }
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = Math.random() * total;
    for (const i of items) {
      r -= i.w;
      if (r <= 0) return i;
    }
    return items[0];
  }

  function durationOf(video, fallback = 3) {
    const d = video && isFinite(video.duration) ? video.duration : NaN;
    return isNaN(d) || d <= 0.2 ? fallback : d;
  }

  /** 主行为循环：待机 / 转向 / 走路 / 分类动作，按权重随机 */
  function nextBehavior() {
    if (pet.paused || pet.dragging || pet.tossing) return;
    const pick = pickKind();

    if (pick.kind === 'idle') {
      const name = randomOf(anim.idle) || randomOf(anim.idle);
      playAnim(name, { loop: true });
      pet.busy = false;
      window.setTimeout(nextBehavior, between(4200, 9000));
      return;
    }

    if (pick.kind === 'turn') {
      const name = randomOf(anim.turn);
      if (!name) return window.setTimeout(nextBehavior, 800);
      pet.facing = Math.random() < 0.5 ? 'left' : 'right';
      applyFacing();
      const v = playAnim(name, { loop: false });
      const wait = (durationOf(v, 2.5) + 0.4) * 1000;
      window.setTimeout(nextBehavior, wait);
      return;
    }

    if (pick.kind === 'move') {
      startWalk();
      return;
    }

    // 分类动作（小动作/玩耍/吃什么/时节/文字…）
    const name = randomOf(pick.cat.actions);
    if (!name) return window.setTimeout(nextBehavior, 800);
    if (pick.cat.noMirror && pet.facing === 'right') {
      pet.facing = 'left';
      applyFacing();
    }
    playAnim(name, { loop: false });
    if (pet.anim === name && pick.cat.id === '文字') { /* 文字类动画保持朝向 */ }
    const wait = between(3200, 6200);
    window.setTimeout(nextBehavior, wait);
  }

  function startWalk() {
    const actions = (anim.moves && anim.moves.actions) || [];
    const act = randomOf(actions) || { name: randomOf(anim.idle) };
    const params = act.params || {};
    const minD = Number(params.minDist) || moveDef.minDist;
    const maxD = Number(params.maxDist) || moveDef.maxDist;
    const leadSec = Number(params.leadSec) || moveDef.leadSec;
    const tailSec = Number(params.tailSec) || moveDef.tailSec;

    let dir = Math.random() < 0.5 ? -1 : 1;
    const dist = between(minD, maxD);
    const targetX = pet.x + dir * dist;
    if (targetX < 6 || targetX > window.innerWidth - pet.size - 6) dir = -dir;

    pet.facing = dir > 0 ? 'right' : 'left';
    applyFacing();
    const v = playAnim(act.name, { loop: false });
    const total = durationOf(v, 3);
    const walkMs = Math.max(600, (total - leadSec - tailSec) * 1000);
    const fromX = pet.x;
    const toX = Math.max(6, Math.min(fromX + dir * dist, window.innerWidth - pet.size - 6));
    const t0 = performance.now();

    pet.busy = true;
    function step(now) {
      if (pet.dragging || pet.tossing) return;
      const k = Math.min(1, (now - t0 - leadSec * 1000) / walkMs);
      if (k > 0) {
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        pet.x = fromX + (toX - fromX) * eased;
        render();
      }
      if (now - t0 < total * 1000) window.requestAnimationFrame(step);
      else {
        pet.busy = false;
        window.setTimeout(nextBehavior, between(1200, 3000));
      }
    }
    window.requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- 拖拽 / 甩飞

  let drag = null;
  hitEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    hitEl.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pet.x, oy: pet.y, moved: false, samples: [], t0: performance.now() };
    pet.walking = false;
  });
  hitEl.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      pet.dragging = true;
      hitEl.classList.add('dragging');
      if (anim.drag && anim.drag.length) playAnim(randomOf(anim.drag), { loop: true });
    }
    if (!drag.moved) return;
    pet.x = drag.ox + dx;
    pet.y = drag.oy + dy;
    clampPosition();
    render();
    const now = performance.now();
    drag.samples.push({ t: now, x: pet.x, y: pet.y });
    drag.samples = drag.samples.filter((s) => now - s.t < 160);
  });
  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const wasDrag = drag.moved;
    const samples = drag.samples;
    drag = null;
    hitEl.classList.remove('dragging');
    pet.dragging = false;
    if (!wasDrag) {
      onClick();
      return;
    }
    // 估算甩出速度 → 抛物线飞行 + 落地反弹
    let vx = 0;
    let vy = 0;
    if (samples.length >= 2) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(0.03, (b.t - a.t) / 1000);
      vx = ((b.x - a.x) / dt) * 0.9;
      vy = ((b.y - a.y) / dt) * 0.9;
    }
    const speed = Math.hypot(vx, vy);
    if (speed < 200) {
      // 温柔放下：回到待机
      window.setTimeout(nextBehavior, 300);
      return;
    }
    pet.tossing = true;
    pet.vx = Math.max(-2600, Math.min(2600, vx));
    pet.vy = Math.max(-2600, Math.min(2600, vy)) - 260;
    let last = performance.now();
    function fly(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pet.vy += 2000 * dt;
      pet.x += pet.vx * dt;
      pet.y += pet.vy * dt;
      const w = pet.size;
      const h = petHeight();
      if (pet.x < 4) {
        pet.x = 4;
        pet.vx = -pet.vx * 0.55;
      }
      if (pet.x > window.innerWidth - w - 4) {
        pet.x = window.innerWidth - w - 4;
        pet.vx = -pet.vx * 0.55;
      }
      const groundY = window.innerHeight - h - 4;
      if (pet.y >= groundY) {
        pet.y = groundY;
        if (Math.abs(pet.vy) > 260) {
          pet.vy = -pet.vy * 0.45;
        } else {
          pet.vy = 0;
        }
        pet.vx *= 0.86;
      }
      if (pet.y < 4) {
        pet.y = 4;
        pet.vy = Math.abs(pet.vy) * 0.4;
      }
      render();
      const done = pet.y >= groundY - 0.5 && Math.abs(pet.vy) < 40 && Math.abs(pet.vx) < 40;
      if (done) {
        pet.tossing = false;
        pet.vx = pet.vy = 0;
        pet.anim = '';
        window.setTimeout(nextBehavior, 500);
      } else {
        window.requestAnimationFrame(fly);
      }
    }
    window.requestAnimationFrame(fly);
  }
  hitEl.addEventListener('pointerup', endDrag);
  hitEl.addEventListener('pointercancel', endDrag);

  function onClick() {
    const name = randomOf(anim.clicks);
    if (name) playAnim(name, { loop: false });
    if (!settings.apiKey) {
      showBubble('第一次用的话，点左下角齿轮填上你的 API Key，就能和我聊天啦~', 5200);
      return;
    }
    const line = randomOf([
      '诶嘿~ 戳我干嘛呀？',
      '主人今天心情好不好呀？',
      '哼，再戳我就要生气啦（并不是）',
      '我在这儿呢，一直都在~',
      '嘻嘻，被你发现我在偷懒了',
    ]);
    showBubble(line, 3200);
    speak(line);
    window.setTimeout(nextBehavior, 2600);
  }

  // ---------------------------------------------------------------- 右键菜单

  const toolItems = [
    { label: '对话', action: 'chat' },
    { label: '碎碎念', action: 'whisper' },
    { label: '查看余额', action: 'balance' },
    { label: '回到初始位置', action: 'home' },
    { label: '设置（填 API Key）', action: 'settings' },
  ];
  const menuTree = [{ label: '常用', items: toolItems }, ...S.buildMenuTree(anim)];

  let menuHandle = null;
  hitEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (menuHandle) {
      menuHandle.close();
      menuHandle = null;
    }
    pet.paused = true;
    const rect = petEl.getBoundingClientRect();
    menuHandle = S.mountContextMenu({
      tree: menuTree,
      x: e.clientX,
      y: e.clientY,
      clamp: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
      onAction: (leaf) => handleMenuAction(leaf),
      onClose: () => {
        menuHandle = null;
        pet.paused = false;
        window.setTimeout(nextBehavior, 600);
      },
    });
    if (rect.width < 0) {
      /* 保持引用，避免被 GC */
    }
  });

  function handleMenuAction(leaf) {
    if (!leaf) return;
    if (leaf.action === 'chat') return openChat();
    if (leaf.action === 'whisper') return doWhisper();
    if (leaf.action === 'balance') return doBalance();
    if (leaf.action === 'home') return goHome();
    if (leaf.action === 'settings') return openSettings();
    const name = leaf.anim || leaf.label;
    if (name) {
      const isMove = ((anim.moves && anim.moves.actions) || []).some((m) => m.name === name);
      if (isMove) startWalkNamed(name);
      else playAnim(name, { loop: false });
      window.setTimeout(nextBehavior, 4200);
    }
  }

  function startWalkNamed(name) {
    const actions = (anim.moves && anim.moves.actions) || [];
    const fake = { name };
    const idx = actions.findIndex((a) => a.name === name);
    if (idx >= 0) {
      const real = actions[idx];
      const keep = actions[idx];
      actions[idx] = real;
    }
    const act = actions.find((a) => a.name === name) || fake;
    const minD = (act.params && act.params.minDist) || moveDef.minDist;
    const maxD = (act.params && act.params.maxDist) || moveDef.maxDist;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const dist = between(minD, maxD);
    pet.facing = dir > 0 ? 'right' : 'left';
    applyFacing();
    const v = playAnim(name, { loop: false });
    const total = durationOf(v, 3);
    const fromX = pet.x;
    const toX = Math.max(6, Math.min(fromX + dir * dist, window.innerWidth - pet.size - 6));
    const t0 = performance.now();
    pet.busy = true;
    function step(now) {
      const k = Math.min(1, (now - t0) / (total * 1000));
      pet.x = fromX + (toX - fromX) * k;
      render();
      if (k < 1) window.requestAnimationFrame(step);
      else {
        pet.busy = false;
        window.setTimeout(nextBehavior, 1500);
      }
    }
    window.requestAnimationFrame(step);
  }

  function goHome() {
    const corner = (CFG.pet && CFG.pet.corner) || 'bottom-right';
    const mx = (CFG.pet && CFG.pet.marginX) || 24;
    const my = (CFG.pet && CFG.pet.marginY) || 24;
    const h = petHeight();
    if (/right/.test(corner)) pet.x = window.innerWidth - pet.size - mx;
    else pet.x = mx;
    if (/bottom/.test(corner)) pet.y = window.innerHeight - h - my;
    else pet.y = my;
    clampPosition();
    render();
    showBubble('我回来啦~', 2000);
  }

  // ---------------------------------------------------------------- 对话 / 碎碎念 / 余额

  let chatHandle = null;
  function openChat() {
    if (chatHandle) {
      chatHandle.close();
      chatHandle = null;
      return;
    }
    if (!settings.apiKey) {
      showBubble('先点左下角齿轮填上你的 API Key 吧~', 4200);
      openSettings();
      return;
    }
    const r = hitEl.getBoundingClientRect();
    chatHandle = S.mountChatDialog({
      petId: 'main',
      baseUrl: './__nai/chat',
      x: Math.min(window.innerWidth - 340, r.right + 8),
      y: Math.max(8, r.top),
      clamp: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
      onReply: (reply) => {
        showBubble(reply, 8000);
        speak(reply);
      },
      onClose: () => {
        chatHandle = null;
      },
    });
  }

  async function doWhisper() {
    if (!settings.apiKey) {
      showBubble('先填 API Key 我才能碎碎念呀~', 3600);
      openSettings();
      return;
    }
    showBubble('让我想想…', 3000);
    try {
      const line = await whisperLine();
      showBubble(line, 8000);
      speak(line);
      const name = randomOf((anim.events && anim.events.whisper) || anim.clicks);
      if (name) playAnim(name, { loop: false });
    } catch (error) {
      showBubble([{ role: 'error', text: '碎碎念失败' }, { role: 'sub', text: String(error && error.message) }], 6000);
    }
  }

  async function doBalance() {
    showBubble('查一下余额…', 3000);
    const state = await queryBalance();
    let rows;
    try {
      rows = S.balanceBubbleView(state);
    } catch {
      rows = [{ role: 'label', text: JSON.stringify(state) }];
    }
    showBubble(rows, 8000);
    const idx = state.ok ? S.balanceEventIndex(S.balancePercent(state)) : 2;
    const pool = (anim.events && anim.events.balance) || [];
    const name = pool[idx] || randomOf(pool);
    if (name) playAnim(name, { loop: false });
  }

  // ---------------------------------------------------------------- 设置面板

  const panel = document.getElementById('nai-panel');
  const note = document.getElementById('panel-note');
  const fBase = document.getElementById('f-base');
  const fModel = document.getElementById('f-model');
  const fKey = document.getElementById('f-key');
  const fSize = document.getElementById('f-size');
  const fPrompt = document.getElementById('f-prompt');
  const fSpeak = document.getElementById('f-speak');
  const fBubble = document.getElementById('f-bubble');

  function fillPanel() {
    fBase.value = settings.baseURL;
    fModel.value = settings.model;
    fKey.value = settings.apiKey;
    fPrompt.value = settings.prompt || DEFAULT_PROMPT;
    fSpeak.checked = !!settings.speak;
    fBubble.checked = settings.bubble !== false;
    fSize.innerHTML = '';
    const sizes = (CFG.pet && CFG.pet.displaySize) || [280, 340, 420, 462, 560];
    for (const s of sizes) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = s + ' px';
      if (Number(s) === Number(pet.size)) opt.selected = true;
      fSize.appendChild(opt);
    }
  }

  function openSettings() {
    fillPanel();
    panel.classList.add('is-open');
  }
  function closeSettings() {
    panel.classList.remove('is-open');
  }

  document.getElementById('nai-gear').addEventListener('click', () => {
    if (panel.classList.contains('is-open')) closeSettings();
    else openSettings();
  });
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('open-settings').addEventListener('click', openSettings);

  document.getElementById('save-settings').addEventListener('click', () => {
    settings.baseURL = fBase.value.trim() || DEFAULTS.baseURL;
    settings.model = fModel.value.trim() || DEFAULTS.model;
    settings.apiKey = fKey.value.trim();
    settings.prompt = fPrompt.value.trim() || DEFAULT_PROMPT;
    settings.speak = fSpeak.checked;
    settings.bubble = fBubble.checked;
    settings.size = Number(fSize.value) || 0;
    persistSettings();
    pet.size = settings.size > 0 ? settings.size : CFG.pet.size;
    applyPetSize();
    clampPosition();
    render();
    note.textContent = '已保存 ✓';
    note.className = 'panel-note ok';
    showBubble('设置好啦~', 2200);
  });

  document.getElementById('test-settings').addEventListener('click', async () => {
    settings.baseURL = fBase.value.trim() || DEFAULTS.baseURL;
    settings.model = fModel.value.trim() || DEFAULTS.model;
    settings.apiKey = fKey.value.trim();
    settings.prompt = fPrompt.value.trim() || DEFAULT_PROMPT;
    persistSettings();
    note.textContent = '测试中…';
    note.className = 'panel-note';
    try {
      const reply = await llm([{ role: 'user', content: '回复两个字：收到' }], { maxTokens: 20 });
      note.textContent = '连接正常 ✓ 模型回：' + reply.slice(0, 40);
      note.className = 'panel-note ok';
    } catch (error) {
      note.textContent = '失败：' + String(error && error.message);
      note.className = 'panel-note err';
    }
  });

  document.getElementById('clear-memory').addEventListener('click', () => {
    try {
      window.localStorage.removeItem(MEMORY_KEY);
    } catch {
      /* ignore */
    }
    note.textContent = '对话记忆已清空 ✓';
    note.className = 'panel-note ok';
  });

  document.getElementById('say-hi').addEventListener('click', () => {
    const line = '我是奈儿呀，你连点我、拖我、右键我都可以玩~';
    showBubble(line, 5000);
    speak(line);
    const name = randomOf(anim.clicks);
    if (name) playAnim(name, { loop: false });
  });

  document.getElementById('toggle-walk').addEventListener('click', (e) => {
    pet.paused = !pet.paused;
    e.target.textContent = pet.paused ? '让她继续走动' : '让她停下 / 继续走动';
    if (!pet.paused) nextBehavior();
    else playAnim(randomOf(anim.idle), { loop: true });
  });

  const dlBtn = document.getElementById('download-desktop');
  if (dlBtn) {
    dlBtn.addEventListener('click', () => {
      const url = window.NAI_DESKTOP_URL;
      if (url) {
        window.open(url, '_blank');
        return;
      }
      showBubble('桌面版是 Windows 的绿色包（462MB，含本地语音识别，双击就能用）——找发这个链接的人要一份就行~', 6500);
    });
  }

  // ---------------------------------------------------------------- 启动

  function boot() {
    // 注入共享组件自带的样式（右键菜单 + 配图气泡）——菜单 DOM 来自 shared-core，样式也必须一起注入
    try {
      const style = document.createElement('style');
      style.dataset.nai = 'shared';
      style.textContent = (S.MENU_CSS || '') + (S.MEME_BUBBLE_CSS || '');
      document.head.appendChild(style);
    } catch (error) {
      console.warn('注入共享样式失败', error);
    }
    applyPetSize();
    goHome();
    render();
    playAnim(randomOf(anim.idle), { loop: true });
    window.setTimeout(nextBehavior, 6000);

    window.addEventListener('resize', () => {
      clampPosition();
      render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        videos.forEach((v) => v.pause());
        void 0;
      } else {
        playAnim(pet.anim || randomOf(anim.idle), { loop: false });
        playAnim(randomOf(anim.idle), { loop: true });
      }
    });

    if (!settings.apiKey) {
      window.setTimeout(() => {
        showBubble('第一次见我？点左下角齿轮填上你的 API Key，我就能陪你聊天啦~', 7000);
        const name = randomOf(anim.clicks);
        if (name) playAnim(name, { loop: false });
      }, 1800);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
