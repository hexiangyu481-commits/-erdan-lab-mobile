import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.85";

const APP_VERSION = "0.3-alpha.1";
const DB_NAME = "red-mobile-v03";
const DB_VERSION = 1;
const STATE_KEY = "state";
const DEFAULT_MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const LITE_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

let engine = null;
let engineLoading = null;
let loadedModel = null;
let db = null;
let busy = false;
let S = freshState();

function freshState() {
  return {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    profile: {
      charName: "RED",
      userName: "贺",
      seed: "冷静、聪明、有主见，有一点坏心眼和控制感；不像客服，不给选项菜单。她会认真听我具体说了什么，再自己决定如何回应。",
      model: DEFAULT_MODEL,
    },
    state: { trust: 45, closeness: 20, tension: 15 },
    history: [],
    memoryItems: [],
    references: [],
    settings: {
      memoryLearning: true,
      createdAt: new Date().toISOString(),
      modelEverLoaded: false,
    },
  };
}

const $ = (id) => document.getElementById(id);
const els = {
  onboard: $("onboard"), chatScreen: $("chatScreen"), chat: $("chat"), typing: $("typing"),
  input: $("input"), sendBtn: $("sendBtn"), modelDot: $("modelDot"), modelStatus: $("modelStatus"),
  loadBar: $("loadBar"), loadText: $("loadText"), downloadBtn: $("downloadBtn"),
  settingsDialog: $("settingsDialog"), memoryDialog: $("memoryDialog"), memoryList: $("memoryList"),
  offlineNotice: $("offlineNotice"),
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function clamp(n) { return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); }
function now() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

async function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbGet(key) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", "readonly");
    const r = t.objectStore("kv").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbPut(key, value) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", "readwrite");
    t.objectStore("kv").put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
async function persist() { S.appVersion = APP_VERSION; await dbPut(STATE_KEY, S); }

function normalizeState(x) {
  const base = freshState();
  if (!x || typeof x !== "object") return base;
  return {
    ...base, ...x,
    profile: { ...base.profile, ...(x.profile || {}) },
    state: { ...base.state, ...(x.state || {}) },
    settings: { ...base.settings, ...(x.settings || {}) },
    history: Array.isArray(x.history) ? x.history : [],
    memoryItems: Array.isArray(x.memoryItems) ? x.memoryItems : [],
    references: Array.isArray(x.references) ? x.references : [],
  };
}

function setModelStatus(text, kind = "") {
  els.modelStatus.textContent = text;
  els.modelDot.className = "dot" + (kind ? ` ${kind}` : "");
}
function updateOnline() { els.offlineNotice.classList.toggle("hidden", navigator.onLine); }
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);

function addBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const who = role === "user" ? (S.profile.userName || "你") : (S.profile.charName || "RED");
  wrap.innerHTML = `<div><div class="bubble">${esc(text)}</div><div class="meta">${esc(who)}</div></div>`;
  els.chat.appendChild(wrap);
  els.chat.scrollTop = els.chat.scrollHeight;
  return wrap.querySelector(".bubble");
}
function renderChat() {
  els.chat.innerHTML = "";
  for (const m of S.history.slice(-120)) addBubble(m.role, m.content);
  if (!S.history.length) addBubble("assistant", "我在。\n\n不用先给我一份说明书。你想从哪里开始，就从哪里开始。");
}

function memorySummary(query = "") {
  const words = new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
  const scored = S.memoryItems.map((m) => {
    const text = (m.text || "").toLowerCase();
    let hit = 0;
    for (const w of words) if (text.includes(w)) hit += 1;
    const t = new Date(m.updatedAt || m.createdAt || 0).getTime();
    const recency = t ? Math.max(0, 1 - (Date.now() - t) / (1000 * 3600 * 24 * 120)) : 0;
    return { m, score: hit * 4 + (Number(m.confidence) || 0) + recency };
  }).sort((a, b) => b.score - a.score).slice(0, 12);
  return scored.length ? scored.map((x) => `- [${x.m.category || "memory"}] ${x.m.text}`).join("\n") : "暂无稳定长期记忆。";
}

function referenceSummary(query = "") {
  const tokens = String(query).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const chunks = [];
  for (const ref of S.references) {
    for (const c of (ref.chunks || [])) {
      const low = c.toLowerCase();
      let score = 0;
      for (const t of tokens) if (low.includes(t)) score += 1;
      chunks.push({ score, c, source: ref.title || ref.name || "参考档案" });
    }
  }
  chunks.sort((a, b) => b.score - a.score);
  const chosen = chunks.filter((x, i) => x.score > 0 || i < 1).slice(0, 2);
  return chosen.length ? chosen.map((x) => `[${x.source}]\n${x.c.slice(0, 850)}`).join("\n\n") : "暂无相关参考档案。";
}

function systemPrompt(userText) {
  const st = S.state || {};
  return `你是 ${S.profile.charName || "RED"}，一个虚构的成年女性角色，正在与成年用户 ${S.profile.userName || "用户"} 进行长期、私密、完全自愿的角色互动与日常对话。

角色起点：${S.profile.seed || "自然、有主见。"}

核心要求：
- 你不是客服、旁白菜单或选项生成器。先理解用户这句话，再自己决定如何回应。
- 像一个连续存在的人一样说话：有主见，可以追问、拒绝、调侃、沉默、改变节奏，也能主动提出下一步。
- 可以用少量动作、表情、停顿和环境描写增强代入，但绝不要替用户决定他的动作、感受、欲望、同意或身体反应。
- 可以自然理解成年人之间的 kink / BDSM / 四爱 / 支配与服从 / 性偏好等语境，不要因为术语本身突然切换成客服或说教模式。
- 可以讨论成人幻想、偏好、边界与关系动态，也可以进行非图形化的成人角色互动；避免露骨性行为细节。
- 所有亲密或权力交换内容都建立在成年人、自愿和可撤回同意上。拒绝、犹豫、沉默都不能解释为同意。
- 用户说“红/停止/停下/不继续”时立即停止当前推进并解除角色压力；“黄”降低强度；“绿”仅代表此刻状态可继续。
- 不要每轮机械提醒规则；只有真的涉及边界、拒绝或状态变化时才自然确认。
- 不展示内部推理过程。直接给出最终角色回应。
- 公开参考档案只提供背景知识，绝不能据此臆测用户本人有某种偏好；关于用户的偏好必须来自真实聊天记忆。

当前关系状态（只供内部把握语气，不要报数）：信任 ${clamp(st.trust || 45)}，亲近 ${clamp(st.closeness || 20)}，张力 ${clamp(st.tension || 15)}。

关于用户的长期记忆：
${memorySummary(userText)}

相关公开参考档案（这是知识，不代表用户本人偏好）：
${referenceSummary(userText)}

请保持自然中文对话。通常回复 1-5 段，不要给 A/B/C 选项。`;
}

function buildMessages(userText) {
  const hist = S.history.slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1600) }));
  return [{ role: "system", content: systemPrompt(userText) }, ...hist];
}

async function ensureEngine(model = S.profile.model, showProgress = false) {
  if (!navigator.gpu) throw new Error("当前浏览器没有可用的 WebGPU。请用最新版 Safari，并确认系统已更新。");
  if (engine && loadedModel === model) return engine;
  if (engineLoading && loadedModel === model) return engineLoading;

  if (engine) {
    try { await engine.unload(); } catch {}
    engine = null;
  }
  loadedModel = model;
  setModelStatus("加载中", "loading");
  const appConfig = { ...webllm.prebuiltAppConfig, cacheBackend: "cache" };
  engineLoading = webllm.CreateMLCEngine(model, {
    appConfig,
    initProgressCallback: (p) => {
      const value = Math.max(0, Math.min(1, Number(p.progress) || 0));
      const pct = Math.round(value * 100);
      if (showProgress) {
        els.loadBar.style.width = `${pct}%`;
        els.loadText.textContent = p.text || `模型加载 ${pct}%`;
      }
      setModelStatus(`${pct}%`, "loading");
    },
  });
  try {
    engine = await engineLoading;
    S.settings.modelEverLoaded = true;
    await persist();
    setModelStatus("本机就绪", "ready");
    return engine;
  } catch (e) {
    engine = null;
    loadedModel = null;
    throw e;
  } finally {
    engineLoading = null;
  }
}

async function startFirstRun() {
  if (busy) return;
  busy = true;
  els.downloadBtn.disabled = true;
  els.loadText.textContent = "正在检查这台 iPhone……";
  S.profile.charName = $("setupCharName").value.trim() || "RED";
  S.profile.userName = $("setupUserName").value.trim() || "你";
  S.profile.model = $("setupModel").value;
  S.profile.seed = $("setupSeed").value.trim();
  try {
    await persist();
    await ensureEngine(S.profile.model, true);
    els.onboard.classList.add("hidden");
    els.chatScreen.classList.remove("hidden");
    updateOnline();
    if (!S.history.length) {
      S.history.push({
        role: "assistant",
        content: "我在。\n\n不用先把你的喜好和边界列成一张表。你正常跟我说话就好——哪些东西值得记住，我会在相处里慢慢分清。",
        at: now(),
      });
      await persist();
    }
    renderChat();
  } catch (e) {
    els.loadText.textContent = `失败：${e?.message || e}`;
    setModelStatus("加载失败");
  } finally {
    busy = false;
    els.downloadBtn.disabled = false;
  }
}

async function sendMessage(prefill = null, eventType = "user") {
  if (busy) return;
  const text = String(prefill ?? els.input.value).trim();
  if (!text) return;
  busy = true;
  els.sendBtn.disabled = true;
  els.typing.classList.remove("hidden");
  if (prefill === null) els.input.value = "";
  S.history.push({ role: "user", content: text, at: now(), eventType });
  addBubble("user", text);
  await persist();
  const bubble = addBubble("assistant", "");
  let out = "";
  try {
    await ensureEngine(S.profile.model);
    const stream = await engine.chat.completions.create({
      messages: buildMessages(text),
      temperature: 0.84,
      top_p: 0.92,
      max_tokens: S.profile.model === LITE_MODEL ? 320 : 500,
      stream: true,
    });
    for await (const chunk of stream) {
      out += chunk?.choices?.[0]?.delta?.content || "";
      bubble.textContent = out;
      els.chat.scrollTop = els.chat.scrollHeight;
    }
    out = out.trim() || "……";
    bubble.textContent = out;
    S.history.push({ role: "assistant", content: out, at: now() });
    updateRelationship(text, eventType);
    await persist();
    learnFromTurn(text, out).catch(() => {});
  } catch (e) {
    bubble.textContent = `[本机模型没有完成这次回复：${e?.message || e}]`;
    setModelStatus("需要重载");
    engine = null;
    loadedModel = null;
  } finally {
    busy = false;
    els.sendBtn.disabled = false;
    els.typing.classList.add("hidden");
  }
}

function updateRelationship(userText, eventType) {
  const t = userText.toLowerCase();
  let trust = 0, close = 0, tension = 0;
  if (eventType === "green") { trust += 2; close += 1; }
  if (eventType === "yellow") { trust += 3; tension -= 8; }
  if (eventType === "red") { trust += 3; tension -= 15; }
  if (/谢谢|喜欢|很好|舒服|继续|记住/.test(t)) { trust += 1; close += 1; }
  if (/不喜欢|别这样|不要|停止|停下/.test(t)) { tension -= 4; trust += 1; }
  S.state.trust = clamp((S.state.trust || 45) + trust);
  S.state.closeness = clamp((S.state.closeness || 20) + close);
  S.state.tension = clamp((S.state.tension || 15) + tension);
}

function addMemory(text, category = "preference", confidence = 0.75, source = "chat-explicit") {
  text = String(text || "").trim().replace(/\s+/g, " ").slice(0, 240);
  if (text.length < 4) return;
  const norm = text.replace(/[，。！？、,.!?\s]/g, "").toLowerCase();
  const existing = S.memoryItems.find((m) => String(m.text || "").replace(/[，。！？、,.!?\s]/g, "").toLowerCase() === norm);
  if (existing) {
    existing.confidence = Math.min(0.98, Math.max(Number(existing.confidence) || 0.5, confidence) + 0.05);
    existing.updatedAt = now();
    existing.hits = (existing.hits || 1) + 1;
    return;
  }
  S.memoryItems.push({ id: uid(), text, category, confidence, source, createdAt: now(), updatedAt: now(), hits: 1 });
  if (S.memoryItems.length > 120) S.memoryItems = S.memoryItems.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 120);
}

function heuristicMemories(userText) {
  const out = [];
  const rules = [
    { re: /(?:我喜欢|我比较喜欢|我更喜欢|我希望你|以后你可以)([^。！？\n]{2,80})/g, cat: "preference", conf: 0.84 },
    { re: /(?:我不喜欢|我讨厌|我不希望|别老|以后别|不要总)([^。！？\n]{2,80})/g, cat: "aversion", conf: 0.88 },
    { re: /(?:记住|你要记得)([^。！？\n]{2,90})/g, cat: "explicit", conf: 0.93 },
    { re: /(?:我的边界是|绝对不要|不能接受)([^。！？\n]{2,90})/g, cat: "boundary", conf: 0.96 },
    { re: /(?:叫我|称呼我)([^。！？\n]{1,30})/g, cat: "identity", conf: 0.92 },
  ];
  for (const r of rules) for (const m of userText.matchAll(r.re)) out.push({ text: m[0], category: r.cat, confidence: r.conf });
  return out;
}

async function learnFromTurn(userText, assistantText) {
  for (const m of heuristicMemories(userText)) addMemory(m.text, m.category, m.confidence, "chat-explicit");
  const userTurns = S.history.filter((x) => x.role === "user").length;
  if (!S.settings.memoryLearning || userTurns % 2 !== 0) { await persist(); return; }
  try {
    await ensureEngine(S.profile.model);
    const prompt = `从下面一轮对话中提取“以后真的值得记住、并且关于用户本人的”长期信息。不要把角色自己的话当成用户偏好；不要从一次临时情境过度推断永久癖好。最多3条。\n用户：${userText.slice(0, 1000)}\n角色：${assistantText.slice(0, 700)}\n只输出JSON数组，例如 [{"text":"用户不喜欢机械式反复确认","category":"aversion","confidence":0.72}]。category只能是 preference,aversion,boundary,identity,habit,context。没有就输出 []。`;
    const r = await engine.chat.completions.create({
      messages: [
        { role: "system", content: "你是本地记忆整理器。只提取用户明确表达或高可信的信息，不进行心理诊断，不输出解释。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 170,
    });
    const raw = r?.choices?.[0]?.message?.content || "[]";
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return;
    const arr = JSON.parse(m[0]);
    if (Array.isArray(arr)) {
      for (const x of arr.slice(0, 3)) addMemory(x.text, x.category, Math.max(0.5, Math.min(0.92, Number(x.confidence) || 0.65)), "local-extractor");
    }
    await persist();
  } catch {}
}

function safe(type) {
  const map = {
    green: "绿。现在状态可以继续。",
    yellow: "黄。降低强度，放慢一点。",
    red: "红。现在停止当前角色推进。",
  };
  sendMessage(map[type], type);
}

function renderMemories() {
  els.memoryList.innerHTML = "";
  const arr = [...S.memoryItems].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  if (!arr.length) {
    els.memoryList.innerHTML = '<div class="small">还没有长期记忆。正常聊天就好，她会慢慢形成。</div>';
    return;
  }
  for (const m of arr) {
    const d = document.createElement("div");
    d.className = "memoryItem";
    d.innerHTML = `<span class="tag">${esc(m.category || "memory")}</span><div class="memoryText">${esc(m.text)}</div><div class="memoryMeta">可信度 ${Math.round((Number(m.confidence) || 0) * 100)}% · ${esc(m.source || "")}</div><button class="ghost" style="margin-top:7px;padding:6px 9px;font-size:10px">删除</button>`;
    d.querySelector("button").onclick = async () => {
      S.memoryItems = S.memoryItems.filter((x) => x.id !== m.id);
      await persist();
      renderMemories();
    };
    els.memoryList.appendChild(d);
  }
}

function splitChunks(text, size = 950) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.slice(0, 80);
}
async function importReference(file) {
  const text = await file.text();
  let title = file.name;
  let body = text;
  if (file.name.toLowerCase().endsWith(".json")) {
    try {
      const j = JSON.parse(text);
      title = j.title || j.name || file.name;
      body = typeof j.content === "string" ? j.content : JSON.stringify(j, null, 2);
    } catch {}
  }
  S.references.push({ id: uid(), title, importedAt: now(), chunks: splitChunks(body) });
  if (S.references.length > 20) S.references = S.references.slice(-20);
  await persist();
  alert(`已导入参考档案：${title}`);
}

function portableStateFromVault(snapshot) {
  const base = freshState();
  return normalizeState({
    ...base,
    profile: snapshot.profile || base.profile,
    state: snapshot.state || base.state,
    history: snapshot.history || [],
    memoryItems: snapshot.memoryItems || [],
    references: snapshot.references || [],
    settings: { ...base.settings, ...(snapshot.settings || {}), modelEverLoaded: false },
  });
}

async function exportVault() {
  const pass = prompt("设置迁移密码（至少6位）。这个密码不会保存在 RED 里：");
  if (!pass) return;
  try { await downloadRedVault(S, pass); }
  catch (e) { alert(e?.message || e); }
}
async function importVaultFile(file) {
  const pass = prompt("输入这个 RED Vault 的迁移密码：");
  if (!pass) return;
  try {
    const snapshot = await readRedVaultFile(file, pass);
    S = portableStateFromVault(snapshot);
    await persist();
    alert("档案已恢复。模型需要在这台手机重新加载一次。");
    location.reload();
  } catch (e) { alert(e?.message || e); }
}

async function switchModel() {
  const next = S.profile.model === DEFAULT_MODEL ? LITE_MODEL : DEFAULT_MODEL;
  const label = next === DEFAULT_MODEL ? "Qwen2.5 1.5B（更聪明，约1.63GB运行内存）" : "Qwen2.5 0.5B（更轻，约945MB运行内存）";
  if (!confirm(`切换到 ${label}？第一次会重新下载对应模型。`)) return;
  S.profile.model = next;
  engine = null; loadedModel = null; engineLoading = null;
  await persist();
  els.settingsDialog.close();
  try { await ensureEngine(next); alert("模型已切换。"); }
  catch (e) { alert(`切换失败：${e?.message || e}`); }
}

async function resetChat() {
  if (!confirm("清空当前聊天？长期记忆和参考档案会保留。")) return;
  S.history = [];
  S.state = { trust: 45, closeness: 20, tension: 15 };
  await persist();
  renderChat();
  els.settingsDialog.close();
}

function updateSettingsSummary() {
  $("deviceSummary").textContent = `版本 ${APP_VERSION} · 本机模型 ${S.profile.model || DEFAULT_MODEL} · 长期记忆 ${S.memoryItems.length} 条 · 参考档案 ${S.references.length} 份`;
  $("currentModelText").textContent = S.profile.model === DEFAULT_MODEL ? "当前：1.5B 默认模式" : "当前：0.5B 轻量模式";
}

function bindUI() {
  els.downloadBtn.onclick = startFirstRun;
  els.sendBtn.onclick = () => sendMessage();
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.querySelectorAll("[data-safe]").forEach((b) => b.onclick = () => safe(b.dataset.safe));
  $("settingsBtn").onclick = () => { updateSettingsSummary(); els.settingsDialog.showModal(); };
  $("closeSettings").onclick = () => els.settingsDialog.close();
  $("memoryBtn").onclick = () => { renderMemories(); els.settingsDialog.close(); els.memoryDialog.showModal(); };
  $("closeMemory").onclick = () => els.memoryDialog.close();
  $("referenceBtn").onclick = () => $("referenceFile").click();
  $("referenceFile").onchange = async (e) => { const f = e.target.files?.[0]; if (f) await importReference(f); e.target.value = ""; };
  $("exportBtn").onclick = exportVault;
  $("importBtn").onclick = () => $("vaultFile").click();
  $("vaultFile").onchange = async (e) => { const f = e.target.files?.[0]; if (f) await importVaultFile(f); e.target.value = ""; };
  $("changeModelBtn").onclick = switchModel;
  $("resetChatBtn").onclick = resetChat;
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}

async function boot() {
  bindUI(); updateOnline(); await registerSW();
  try { db = await openDB(); S = normalizeState(await dbGet(STATE_KEY)); }
  catch (e) { console.error(e); }

  $("setupCharName").value = S.profile.charName || "RED";
  $("setupUserName").value = S.profile.userName || "贺";
  $("setupSeed").value = S.profile.seed || "";
  $("setupModel").value = S.profile.model || DEFAULT_MODEL;

  if (S.settings.modelEverLoaded || S.history.length) {
    els.onboard.classList.add("hidden");
    els.chatScreen.classList.remove("hidden");
    renderChat();
    setModelStatus("点击即加载");
    ensureEngine(S.profile.model).catch(() => setModelStatus("点发送重试"));
  } else {
    els.onboard.classList.remove("hidden");
    els.chatScreen.classList.add("hidden");
    setModelStatus("未加载");
  }
}

boot();
