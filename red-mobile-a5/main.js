import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.82";

const MODEL_ID = "Qwen3-1.7B-q4f16_1-MLC";
const LIB_VERSION = "0.2.82";
const KEYS = {
  inflight: "red.alpha5.inflight",
  crashCount: "red.alpha5.generationCrashCount",
  safeMode: "red.alpha5.safeMode",
  logs: "red.alpha5.logs",
};

const el = (id) => document.getElementById(id);
const ui = {
  state: el("state"), mode: el("mode"), gpu: el("gpu"), status: el("status"), progress: el("progress"),
  loadBtn: el("loadBtn"), resetBtn: el("resetBtn"), normalBtn: el("normalBtn"),
  prompt: el("prompt"), sendBtn: el("sendBtn"), stopBtn: el("stopBtn"), reply: el("reply"), log: el("log"),
};

let engine = null;
let worker = null;
let loading = false;
let generating = false;
let history = [];
let firstTokenSeen = false;
let safeMode = localStorage.getItem(KEYS.safeMode) === "1";

function now() { return new Date().toISOString(); }
function readJSON(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function persistedLogs() { return readJSON(KEYS.logs, []) || []; }
function log(event, detail = {}) {
  const line = `${now()} | ${event} | ${JSON.stringify(detail)}`;
  console.log(line);
  const lines = persistedLogs();
  lines.push(line);
  while (lines.length > 220) lines.shift();
  writeJSON(KEYS.logs, lines);
  ui.log.textContent = lines.join("\n");
  ui.log.scrollTop = ui.log.scrollHeight;
}
function setState(text, cls = "") {
  ui.state.textContent = text;
  ui.state.className = `pill ${cls}`;
}
function setStatus(text) { ui.status.textContent = text; }
function setReady(yes) {
  ui.sendBtn.disabled = !yes || generating;
  ui.resetBtn.disabled = !yes || generating;
}
function currentContext() { return safeMode ? 512 : 1024; }
function currentMaxTokens() { return safeMode ? 48 : 96; }
function updateModeUI() {
  ui.mode.textContent = `${safeMode ? "SAFE" : "NORMAL"} · ctx ${currentContext()}`;
  ui.normalBtn.disabled = !safeMode || loading || generating;
}
function setInflight(stage, detail = {}) {
  writeJSON(KEYS.inflight, { ts: now(), stage, detail });
}
function clearInflight() { localStorage.removeItem(KEYS.inflight); }

function inspectPreviousCrash() {
  const prev = readJSON(KEYS.inflight, null);
  if (!prev) return null;
  log("boot:previous-inflight", prev);
  if (prev.stage === "generation" || prev.stage === "smoke-generation") {
    const n = Number(localStorage.getItem(KEYS.crashCount) || "0") + 1;
    localStorage.setItem(KEYS.crashCount, String(n));
    localStorage.setItem(KEYS.safeMode, "1");
    safeMode = true;
    log("recovery:generation-crash-detected", { crashCount: n, action: "force-safe-512" });
  }
  clearInflight();
  return prev;
}

function installGlobalDiagnostics() {
  addEventListener("error", (e) => log("window:error", {
    message: e.message || String(e.error || "unknown"), filename: e.filename, lineno: e.lineno, colno: e.colno,
  }));
  addEventListener("unhandledrejection", (e) => log("window:unhandledrejection", {
    reason: e.reason?.message || String(e.reason),
  }));
  addEventListener("pagehide", (e) => log("pagehide", { persisted: e.persisted, generating, loading }));
  addEventListener("pageshow", (e) => log("pageshow", { persisted: e.persisted }));
  document.addEventListener("visibilitychange", () => log("visibility", { state: document.visibilityState }));
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) log("navigation", { type: nav.type, duration: Math.round(nav.duration) });
  } catch {}
}

async function storageInfo() {
  try {
    const s = await navigator.storage?.estimate?.();
    return { usage: s?.usage ?? null, quota: s?.quota ?? null };
  } catch (e) { return { error: String(e) }; }
}

function teardownWorker() {
  try { worker?.terminate(); } catch {}
  worker = null;
  engine = null;
  setReady(false);
}

async function createEngine() {
  if (loading) return;
  loading = true;
  teardownWorker();
  updateModeUI();
  setState("LOADING", "warn");
  setStatus(`加载 ${MODEL_ID} · ctx=${currentContext()}…`);
  ui.progress.value = 0;
  firstTokenSeen = false;

  setInflight("model-load", { model: MODEL_ID, context: currentContext(), lib: LIB_VERSION });
  log("start:model-load", { model: MODEL_ID, context: currentContext(), lib: LIB_VERSION });

  try {
    worker = new Worker("./worker.js", { type: "module" });
    worker.addEventListener("error", (e) => log("worker:error", { message: e.message, filename: e.filename, lineno: e.lineno }));
    worker.addEventListener("messageerror", () => log("worker:messageerror", {}));

    const appConfig = { ...webllm.prebuiltAppConfig, cacheBackend: "cache" };
    engine = await webllm.CreateWebWorkerMLCEngine(
      worker,
      MODEL_ID,
      {
        appConfig,
        logLevel: "INFO",
        initProgressCallback: (report) => {
          const p = Number(report.progress ?? 0);
          if (Number.isFinite(p)) ui.progress.value = Math.max(0, Math.min(1, p));
          setStatus(report.text || "加载模型…");
        },
      },
      { context_window_size: currentContext() },
    );

    clearInflight();
    log("done:model-load", { context: currentContext(), storage: await storageInfo() });
    setState("VERIFYING", "warn");
    setStatus("模型已加载，正在做 1-token 首次推理冒烟…");

    await smokeTest();
    setState("READY", "ok");
    setStatus(`本地模型就绪 · WebLLM ${LIB_VERSION} · ctx=${currentContext()}`);
    setReady(true);
    ui.progress.value = 1;
  } catch (e) {
    clearInflight();
    const msg = e?.message || String(e);
    log("load:error", { message: msg, context: currentContext() });
    setState("LOAD FAIL", "bad");
    setStatus(msg);
    teardownWorker();
  } finally {
    loading = false;
    updateModeUI();
  }
}

async function smokeTest() {
  if (!engine) throw new Error("engine missing before smoke test");
  setInflight("smoke-generation", { model: MODEL_ID, context: currentContext(), max_tokens: 1 });
  log("start:smoke-generation", { context: currentContext() });
  try {
    const chunks = await engine.chat.completions.create({
      messages: [{ role: "user", content: "1" }],
      stream: true,
      max_tokens: 1,
      temperature: 0.1,
      extra_body: { enable_thinking: false },
    });
    let got = false;
    for await (const chunk of chunks) {
      const t = chunk.choices?.[0]?.delta?.content || "";
      if (t) got = true;
    }
    await engine.resetChat(false);
    clearInflight();
    localStorage.setItem(KEYS.crashCount, "0");
    log("done:smoke-generation", { gotContent: got });
  } catch (e) {
    clearInflight();
    const n = Number(localStorage.getItem(KEYS.crashCount) || "0") + 1;
    localStorage.setItem(KEYS.crashCount, String(n));
    localStorage.setItem(KEYS.safeMode, "1");
    safeMode = true;
    log("smoke:error", { message: e?.message || String(e), crashCount: n, action: "safe-mode-next-load" });
    throw e;
  }
}

async function generate() {
  if (!engine || generating) return;
  const text = ui.prompt.value.trim();
  if (!text) return;

  generating = true;
  firstTokenSeen = false;
  ui.sendBtn.disabled = true;
  ui.stopBtn.disabled = false;
  ui.reply.textContent = "";
  ui.reply.className = "";

  const requestHistory = [...history, { role: "user", content: text }];
  const bounded = requestHistory.slice(-6);
  setInflight("generation", {
    model: MODEL_ID, context: currentContext(), history: bounded.length,
    promptChars: text.length, max_tokens: currentMaxTokens(), safeMode,
  });
  log("start:generation", {
    model: MODEL_ID, context: currentContext(), history: bounded.length,
    promptChars: text.length, max_tokens: currentMaxTokens(), safeMode,
  });

  let answer = "";
  try {
    const chunks = await engine.chat.completions.create({
      messages: bounded,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: currentMaxTokens(),
      temperature: 0.6,
      top_p: 0.9,
      extra_body: { enable_thinking: false },
    });

    for await (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta && !firstTokenSeen) {
        firstTokenSeen = true;
        log("generation:first-token", {});
      }
      if (delta) {
        answer += delta;
        ui.reply.textContent = answer;
      }
      if (chunk.usage) log("generation:usage", chunk.usage);
    }

    history = [...bounded, { role: "assistant", content: answer }].slice(-6);
    clearInflight();
    localStorage.setItem(KEYS.crashCount, "0");
    log("done:generation", { chars: answer.length, firstTokenSeen });
    setState("READY", "ok");
    setStatus("生成完成");
  } catch (e) {
    clearInflight();
    const msg = e?.message || String(e);
    const n = Number(localStorage.getItem(KEYS.crashCount) || "0") + 1;
    localStorage.setItem(KEYS.crashCount, String(n));
    localStorage.setItem(KEYS.safeMode, "1");
    safeMode = true;
    updateModeUI();
    log("generation:error", { message: msg, firstTokenSeen, crashCount: n, action: "force-safe-512" });
    ui.reply.textContent = `生成失败：${msg}`;
    ui.reply.className = "bad";
    setState("RECOVERY", "warn");
    setStatus("generation 失败；已切到 512 安全模式。点“加载 / 修复模型”重新挂载 GPU engine。 ");
    teardownWorker();
  } finally {
    generating = false;
    ui.stopBtn.disabled = true;
    setReady(!!engine);
  }
}

async function stopGeneration() {
  if (!engine || !generating) return;
  try {
    await engine.interruptGenerate();
    log("generation:interrupt-requested", {});
  } catch (e) { log("generation:interrupt-error", { message: e?.message || String(e) }); }
}

async function resetChat() {
  history = [];
  ui.reply.textContent = "已清空。";
  try { await engine?.resetChat(false); } catch (e) { log("chat:reset-error", { message: e?.message || String(e) }); }
  log("chat:reset", {});
}

async function tryNormalMode() {
  localStorage.setItem(KEYS.safeMode, "0");
  safeMode = false;
  updateModeUI();
  log("mode:normal-requested", { context: 1024 });
  await createEngine();
}

async function boot() {
  ui.log.textContent = persistedLogs().join("\n");
  installGlobalDiagnostics();
  const previous = inspectPreviousCrash();
  updateModeUI();

  const gpu = !!navigator.gpu;
  ui.gpu.textContent = `WebGPU ${gpu ? "true" : "false"}`;
  ui.gpu.className = `pill ${gpu ? "ok" : "bad"}`;
  log("boot", {
    gpu, previousInflight: previous, lib: LIB_VERSION, model: MODEL_ID,
    ua: navigator.userAgent, storage: await storageInfo(), safeMode,
  });

  if (!gpu) {
    setState("NO WEBGPU", "bad");
    setStatus("当前浏览器没有 navigator.gpu，无法本地推理。 ");
    return;
  }
  await createEngine();
}

ui.loadBtn.addEventListener("click", createEngine);
ui.sendBtn.addEventListener("click", generate);
ui.stopBtn.addEventListener("click", stopGeneration);
ui.resetBtn.addEventListener("click", resetChat);
ui.normalBtn.addEventListener("click", tryNormalMode);
ui.prompt.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
});

boot();
