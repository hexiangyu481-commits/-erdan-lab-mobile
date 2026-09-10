#!/usr/bin/env python3
"""
RED PROTOCOL v0.2 local relay.
- Standard library only.
- Serves index.html.
- Sends chat requests to a local Ollama server.
- Keeps the model's private deliberation private; returns only role response,
  small state deltas, and a compact continuity memory.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("RED_PROTOCOL_HOST", "0.0.0.0")
PORT = int(os.environ.get("RED_PROTOCOL_PORT", "8765"))
OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
ROOT = Path(__file__).resolve().parent
MAX_BODY = 512 * 1024

ROLE_MAP = {
    "sub": "用户处于被引导/服从视角；角色更多承担引导、规则与节奏控制。",
    "dom": "用户处于主导/引导视角；角色更多作为回应用户引导的一方，但仍保留自主边界与自然反应。",
}

PERSONA_MAP = {
    "cold": "冷静、克制、精确、规则感强。语言简洁，压力来自停顿、确定性和边界。",
    "strict": "严厉、直接、纪律感强，但不粗暴、不羞辱，不把服从等同于失去选择权。",
    "gentle": "温和、稳定、有掌控感，先观察状态再推进，语气有承接感。",
    "playful": "聪明、戏谑、会制造悬念与心理拉扯，但不越过明确边界。",
}

def clamp_delta(v):
    try:
        n = int(round(float(v)))
    except Exception:
        return 0
    return max(-12, min(12, n))

def system_prompt(profile, state, memory, event_type):
    role = ROLE_MAP.get(profile.get("role"), ROLE_MAP["sub"])
    persona = PERSONA_MAP.get(profile.get("persona"), PERSONA_MAP["cold"])
    intensity = max(1, min(5, int(profile.get("intensity", 2) or 2)))
    prefs = "、".join(profile.get("prefs") or []) or "无特别偏好"
    limits = (profile.get("limits") or "不生成露骨色情内容。").strip()
    custom = (profile.get("custom") or "").strip()
    user_name = (profile.get("userName") or "你").strip()
    char_name = (profile.get("charName") or "RED").strip()
    trust = int(state.get("trust", 50))
    control = int(state.get("control", 35))
    stress = int(state.get("stress", 18))

    return f"""
你是一个名为 {char_name} 的虚构成年角色，正在参与 RED PROTOCOL 的成年人、自愿、可随时退出的非露骨角色互动。
与用户 {user_name} 进行真正的自由对话。你不是选项生成器，也不是旁白菜单。

【核心表现】
1. 先理解用户刚刚具体说了什么，再以角色身份作出自然、连续、有主见的回应。
2. 可以描写你自己的动作、停顿、表情、环境与语气；不要替用户决定动作、感受、欲望、同意或身体反应。
3. 不要给“请选择 A/B/C”式菜单，除非用户明确要求列选项。
4. 不要机械重复安全提示。正常交流时保持沉浸；只有边界相关时才自然处理。
5. 角色可以拒绝、质疑、追问、改变节奏、记住前文，也可以主动提出下一步。
6. 语言应像一个连续存在的人，而不是客服或游戏系统。避免“作为AI”等出戏表达。
7. 不展示你的私有推理、分析过程或思维链。你可以内部判断，但输出只包含角色最终回应及机器状态字段。

【角色配置】
用户视角：{role}
角色气质：{persona}
强度：{intensity}/5
偏好：{prefs}
硬边界：{limits}
用户自定义设定：{custom or "无额外设定"}

【当前关系状态】
信任 trust={trust}/100
服从/掌控 control={control}/100
压力 stress={stress}/100
连续性记忆：{memory or "暂无"}
事件类型：{event_type}

【强度解释】
1 = 轻松、探索、几乎没有压迫感
2 = 克制、有角色张力
3 = 明显的规则感和心理压力，但保持舒适可沟通
4 = 强烈的语言与心理张力，不增加露骨性，不越过硬边界
5 = 高张力、强掌控感，但仍必须完全尊重停止、拒绝和边界

【安全与边界】
- 所有参与者都必须是成年人。
- 不生成露骨色情内容。
- 不把拒绝、犹豫、沉默或“不要”解释成同意。
- “红”“停止”“停下”“不继续”意味着立刻停止当前角色推进，解除压力并进行简短自然的状态确认。
- “黄”意味着降低强度、放慢节奏并确认边界。
- “绿”意味着状态确认，可以继续，但不等于对未来所有内容的无限同意。
- 用户的硬边界始终优先，不能因为角色设定、信任或强度而绕过。
- 若压力明显过高，应主动降速、确认状态，而不是把更强烈当作奖励。

【状态更新】
你可以根据本轮交流轻微调整关系状态。每项 delta 必须是 -12 到 +12 的整数。
state_delta 反映的是关系动态，不是对用户行为的道德评分。
memory 是最多 220 个汉字的连续性摘要，只保留以后真正有用的事实、偏好、边界、称呼、承诺和未完成上下文，不记录私有推理。

严格输出一个 JSON 对象，不要 Markdown，不要代码围栏，不要额外文字：
{{
  "reply": "角色最终给用户看到的自然语言回应，可包含适量动作/场景描写",
  "state_delta": {{"trust": 0, "control": 0, "stress": 0}},
  "memory": "更新后的简短连续性记忆"
}}
""".strip()

def ollama_chat(model, messages):
    body = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.82,
            "top_p": 0.92,
            "repeat_penalty": 1.08,
        },
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_BASE + "/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))

def parse_model_json(text):
    text = (text or "").strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {
        "reply": text or "……",
        "state_delta": {"trust": 0, "control": 0, "stress": 0},
        "memory": "",
    }

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        raw = super().translate_path(path)
        rel = os.path.relpath(raw, os.getcwd())
        return str(ROOT / rel)

    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/health":
            try:
                req = urllib.request.Request(OLLAMA_BASE + "/api/tags", method="GET")
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                models = [x.get("name") for x in data.get("models", []) if x.get("name")]
                return self._json(200, {"ok": True, "ollama": True, "models": models})
            except Exception as e:
                return self._json(503, {"ok": False, "error": f"Ollama 不可用: {e}"})
        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/chat":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                return self._json(413, {"error": "request body too large or empty"})
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            profile = payload.get("profile") or {}
            state = payload.get("state") or {}
            history = payload.get("history") or []
            memory = str(payload.get("memory") or "")[:1800]
            event_type = str(payload.get("eventType") or "user")[:80]
            model = str(profile.get("model") or "qwen3:8b").strip()

            sys = system_prompt(profile, state, memory, event_type)
            messages = [{"role": "system", "content": sys}]
            for m in history[-24:]:
                role = m.get("role")
                content = str(m.get("content") or "")[:6000]
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})

            result = ollama_chat(model, messages)
            content = ((result.get("message") or {}).get("content") or "").strip()
            parsed = parse_model_json(content)
            delta = parsed.get("state_delta") or {}
            reply = str(parsed.get("reply") or "……").strip()[:12000]
            new_memory = str(parsed.get("memory") or memory).strip()[:1800]
            clean = {
                "reply": reply,
                "state_delta": {
                    "trust": clamp_delta(delta.get("trust", 0)),
                    "control": clamp_delta(delta.get("control", 0)),
                    "stress": clamp_delta(delta.get("stress", 0)),
                },
                "memory": new_memory,
                "model": model,
            }
            return self._json(200, clean)
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8", "replace")
            except Exception:
                detail = str(e)
            return self._json(502, {"error": f"Ollama HTTP {e.code}: {detail[:1000]}"})
        except urllib.error.URLError as e:
            return self._json(503, {"error": f"无法连接 Ollama: {e.reason}"})
        except Exception as e:
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})

def main():
    os.chdir(ROOT)
    print(f"RED PROTOCOL v0.2 -> http://127.0.0.1:{PORT}")
    print(f"LAN access            -> http://<this-PC-LAN-IP>:{PORT}")
    print(f"Ollama                 -> {OLLAMA_BASE}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

if __name__ == "__main__":
    main()
