import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  RotateCcw,
  Send,
  Settings2,
  Upload,
} from "lucide-react";
import defaultPrompt from "../prompt.md?raw";
import { decrypt, encrypt } from "./crypto";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import "./styles.css";

const MODELS = [
  { label: "DeepSeek V4 Flash", value: "deepseek-v4-flash" },
  { label: "DeepSeek V4 Pro", value: "deepseek-v4-pro" },
];

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_PROMPT = defaultPrompt.trim();

function normalizeEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "/chat/completions";
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function normalizeModel(value) {
  return MODELS.some((item) => item.value === value) ? value : MODELS[0].value;
}

function App() {
  const [session, setSession] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("idle");
  const [authMessage, setAuthMessage] = useState("");

  const [model, setModel] = useState(MODELS[0].value);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [settingsStatus, setSettingsStatus] = useState("idle");
  const [settingsMessage, setSettingsMessage] = useState("");

  const [reportText, setReportText] = useState("");
  const [result, setResult] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () =>
      Boolean(
        session &&
          apiKey.trim() &&
          prompt.trim() &&
          reportText.trim() &&
          status !== "loading" &&
          settingsStatus !== "loading"
      ),
    [apiKey, prompt, reportText, session, settingsStatus, status]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAppLoading(false);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAppLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !supabase) return;

    let cancelled = false;

    async function loadSettings() {
      setSettingsStatus("loading");
      setSettingsMessage("");

      const { data, error: settingsError } = await supabase
        .from("user_settings")
        .select("api_key, base_url, model, prompt")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (settingsError) {
        setSettingsStatus("error");
        setSettingsMessage(settingsError.message);
        return;
      }

      const decrypted = await decrypt(data?.api_key || "");
      setApiKey(decrypted);
      setBaseUrl(data?.base_url || DEFAULT_BASE_URL);
      setModel(normalizeModel(data?.model));
      setPrompt(data?.prompt?.trim() ? data.prompt : DEFAULT_PROMPT);
      setSettingsStatus(data ? "loaded" : "new");
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function handleAuth(event) {
    event.preventDefault();
    if (!supabase) return;

    setAuthStatus("loading");
    setAuthMessage("");

    if (authMode === "login") {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setAuthStatus("error");
        setAuthMessage(authError.message);
        return;
      }

      setPassword("");
      setAuthStatus("idle");
    } else {
      // Register via Edge Function to skip email confirmation
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const fnUrl = `${supabaseUrl}/functions/v1/create-user`;

      try {
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ email: email.trim(), password }),
        });

        const result = await res.json();

        if (!res.ok) {
          setAuthStatus("error");
          setAuthMessage(result.error || "注册失败");
          return;
        }

        // Auto-login after successful registration
        const { error: loginErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (loginErr) {
          setAuthStatus("success");
          setAuthMessage("注册成功，请登录");
          setAuthMode("login");
          return;
        }

        setPassword("");
        setAuthStatus("idle");
      } catch {
        setAuthStatus("error");
        setAuthMessage("注册请求失败，请稍后重试");
      }
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setApiKey("");
    setBaseUrl(DEFAULT_BASE_URL);
    setModel(MODELS[0].value);
    setPrompt(DEFAULT_PROMPT);
    setReportText("");
    setResult("");
    setReasoning("");
    setStatus("idle");
    setSettingsStatus("idle");
  }

  async function saveSettings() {
    if (!session?.user?.id || !supabase) return;

    setSettingsStatus("saving");
    setSettingsMessage("");

    const encryptedKey = await encrypt(apiKey.trim());

    const { error: saveError } = await supabase.from("user_settings").upsert(
      {
        user_id: session.user.id,
        api_key: encryptedKey,
        base_url: baseUrl.trim() || DEFAULT_BASE_URL,
        model,
        prompt,
      },
      { onConflict: "user_id" }
    );

    if (saveError) {
      setSettingsStatus("error");
      setSettingsMessage(saveError.message);
      return;
    }

    setSettingsStatus("saved");
  }

  function resetPrompt() {
    setPrompt(DEFAULT_PROMPT);
    setSettingsStatus("editing");
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setReportText(text);
    setResult("");
    setReasoning("");
    setError("");
    setStatus("idle");
    event.target.value = "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus("loading");
    setError("");
    setResult("");
    setReasoning("");

    try {
      const response = await fetch(normalizeEndpoint(baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          stream: true,
          messages: [
            { role: "system", content: prompt.trim() },
            { role: "user", content: reportText.trim() },
          ],
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error?.message || data?.message || `请求失败：${response.status}`;
        throw new Error(message);
      }

      if (!response.body) throw new Error("当前浏览器不支持流式响应");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let output = "";
      let thinking = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (!payload) continue;

          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta || {};
          const reasoningDelta = delta.reasoning_content || "";
          const contentDelta = delta.content || "";

          if (reasoningDelta) {
            thinking += reasoningDelta;
            setReasoning(thinking);
          }

          if (contentDelta) {
            output += contentDelta;
            setResult(output);
          }
        }
      }

      if (!output.trim()) throw new Error("模型没有返回可用内容");
      setStatus("success");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "生成失败";
      setError(message === "Failed to fetch" ? "请求失败，可能是 DeepSeek 接口不允许浏览器跨域访问" : message);
      setStatus("error");
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
  }

  if (appLoading) {
    return (
      <main className="app-shell centered-shell">
        <Loader2 className="spin" size={26} />
      </main>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app-shell centered-shell">
        <section className="auth-panel">
          <h1>Supabase 未配置</h1>
          <p className="auth-hint">请配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重新构建。</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell centered-shell">
        <form className="auth-panel" onSubmit={handleAuth}>
          <p className="eyebrow">DeepSeek Report Formatter</p>
          <h1>{authMode === "login" ? "登录" : "注册"}</h1>

          <label className="field">
            <span>邮箱</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          {authMessage ? (
            <p className={authStatus === "error" ? "error-message" : "success-message"}>{authMessage}</p>
          ) : null}

          <button className="primary-button" type="submit" disabled={authStatus === "loading"}>
            {authStatus === "loading" ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />}
            <span>{authMode === "login" ? "登录" : "注册"}</span>
          </button>

          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setAuthMode(authMode === "login" ? "register" : "login");
              setAuthMessage("");
              setAuthStatus("idle");
            }}
          >
            <span>{authMode === "login" ? "创建账号" : "已有账号，去登录"}</span>
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="页面标题">
        <div>
          <p className="eyebrow">DeepSeek Report Formatter</p>
          <h1>体检报告优化</h1>
        </div>
        <div className="top-actions">
          <span className="user-email">{session.user.email}</span>
          <button className="ghost-button compact-button" type="button" onClick={signOut}>
            <LogOut size={16} />
            <span>退出</span>
          </button>
          <div className={`status-pill ${status}`}>
            {status === "loading" ? <Loader2 className="spin" size={16} /> : null}
            {status === "success" ? <CheckCircle2 size={16} /> : null}
            {status === "error" ? <AlertCircle size={16} /> : null}
            <span>
              {status === "loading"
                ? "生成中"
                : status === "success"
                  ? "已生成"
                  : status === "error"
                    ? "请求失败"
                    : "待输入"}
            </span>
          </div>
        </div>
      </section>

      <form className="workspace" onSubmit={handleSubmit}>
        <section className="panel settings-panel" aria-label="模型配置">
          <div className="panel-heading">
            <Settings2 size={18} />
            <h2>配置</h2>
          </div>

          <label className="field">
            <span>模型</span>
            <select
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                setSettingsStatus("editing");
              }}
            >
              {MODELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>API Base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setSettingsStatus("editing");
              }}
              placeholder="https://api.deepseek.com"
              spellCheck="false"
            />
          </label>

          <label className="field">
            <span>API Key</span>
            <div className="key-field">
              <KeyRound size={16} />
              <input
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setSettingsStatus("editing");
                }}
                placeholder="sk-..."
                type="password"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </label>

          <label className="field prompt-field">
            <span>提示词</span>
            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setSettingsStatus("editing");
              }}
            />
          </label>

          <div className="settings-actions">
            <button className="primary-button" type="button" onClick={saveSettings} disabled={settingsStatus === "saving"}>
              {settingsStatus === "saving" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
              <span>保存配置</span>
            </button>
            <button className="ghost-button" type="button" onClick={resetPrompt}>
              <RotateCcw size={16} />
              <span>恢复 prompt.md</span>
            </button>
          </div>

          <p className={`settings-state ${settingsStatus}`}>
            {settingsStatus === "loaded"
              ? "已加载个人配置"
              : settingsStatus === "new"
                ? "当前账号还没有保存配置"
                : settingsStatus === "editing"
                  ? "配置已修改，尚未保存"
                  : settingsStatus === "saved"
                    ? "配置已保存"
                    : settingsStatus === "error"
                      ? settingsMessage || "配置读取失败"
                      : "登录后会读取当前账号的配置"}
          </p>
        </section>

        <section className="panel input-panel" aria-label="报告输入">
          <div className="panel-heading">
            <FileText size={18} />
            <h2>原始体检报告</h2>
          </div>

          <label className="upload-strip">
            <Upload size={18} />
            <span>上传文本文件</span>
            <input type="file" accept=".txt,.md,.text" onChange={handleUpload} />
          </label>

          <textarea
            className="report-input"
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            placeholder="粘贴或上传体检报告文本..."
          />

          {error ? <p className="error-message">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={!canSubmit}>
            {status === "loading" ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            <span>生成优化报告</span>
          </button>
        </section>

        <section className="panel output-panel" aria-label="生成结果">
          <div className="panel-heading">
            <Clipboard size={18} />
            <h2>优化结果</h2>
          </div>

          <div className="reasoning-section">
            <div className="section-label">思考过程</div>
            <pre className={reasoning ? "reasoning-box" : "reasoning-box empty"}>
              {reasoning || "模型返回的思考过程会显示在这里"}
            </pre>
          </div>

          <div className="section-label">优化结果</div>
          <pre className={result ? "result-box" : "result-box empty"}>
            {result || "生成后的体检报告会显示在这里"}
          </pre>

          <button className="ghost-button" type="button" onClick={copyResult} disabled={!result}>
            <Clipboard size={16} />
            <span>复制结果</span>
          </button>
        </section>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
