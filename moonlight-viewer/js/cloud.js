// cloud.js — Supabase接続設定・ログイン・クラウドからの読込（閲覧のみ。書き込み処理はない）。
"use strict";

function connection() {
  const bundled = window.MOONLIGHT_CONFIG || {};
  let local = {};
  try {
    local = JSON.parse(localStorage.getItem(CONFIG_STORAGE) || "{}");
  } catch {}
  return {
    url: String(local.url || bundled.supabaseUrl || "").trim().replace(/\/+$/, ""),
    key: String(local.key || bundled.publishableKey || "").trim()
  };
}

function session() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE) || "null");
  } catch {
    return null;
  }
}

function saveSession(s) {
  localStorage.setItem(SESSION_STORAGE, JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE);
}

async function authFetch(path, options = {}, allowRefresh = true) {
  const c = connection();
  const s = session();
  if (!c.url || !c.key) throw new Error("Supabase接続設定がありません");
  if (!s?.access_token) throw new Error("ログインが必要です");
  const headers = new Headers(options.headers || {});
  headers.set("apikey", c.key);
  headers.set("Authorization", `Bearer ${s.access_token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(c.url + path, { ...options, headers, cache: "no-store" });
  if (res.status === 401 && allowRefresh && s.refresh_token) {
    await refreshSession();
    return authFetch(path, options, false);
  }
  return res;
}

async function refreshSession() {
  const c = connection();
  const s = session();
  if (!s?.refresh_token) throw new Error("再ログインが必要です");
  const res = await fetch(`${c.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: c.key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
    cache: "no-store"
  });
  if (!res.ok) {
    clearSession();
    throw new Error("ログイン期限が切れました");
  }
  const next = await res.json();
  saveSession(next);
  return next;
}

async function login(email, password) {
  const c = connection();
  if (!c.url || !c.key) throw new Error("先にSupabase接続設定を保存してください");
  const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: c.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error_description || body?.msg || "ログインに失敗しました");
  saveSession(body);
  localStorage.setItem(EMAIL_STORAGE, email);
}

async function loadCloud() {
  const res = await authFetch("/rest/v1/moonlight_state?id=eq.1&select=data,version,updated_at");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`クラウド読込に失敗しました (${res.status}) ${body}`.trim());
  }
  const rows = await res.json();
  if (!rows?.length) throw new Error("moonlight_state が見つかりません");
  state = rows[0].data || {};
  cloud = { version: num(rows[0].version), updatedAt: String(rows[0].updated_at || "") };
  renderAll();
}
