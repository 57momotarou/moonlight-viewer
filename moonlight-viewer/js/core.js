// core.js — 定数・画面要素・共有状態・表示用の小さな関数。
"use strict";

const CONFIG_STORAGE = "moonlight-viewer-connection";

const SESSION_STORAGE = "moonlight-viewer-session";

const EMAIL_STORAGE = "moonlight-viewer-email";

const ROLE_ORDER = ["店長", "副店長", "チーフ", "スタッフ", "黒市民スタッフ", "アルバイト"];

const $ = (sel) => document.querySelector(sel);

const $$ = (sel) => [...document.querySelectorAll(sel)];

const els = {
  startupSplash: $("#startupSplash"),
  startupText: $("#startupText"),
  startupProgressBar: $("#startupProgressBar"),
  loginScreen: $("#loginScreen"),
  viewerScreen: $("#viewerScreen"),
  connectionSetup: $("#connectionSetup"),
  setupUrl: $("#setupUrl"),
  setupKey: $("#setupKey"),
  saveConnectionBtn: $("#saveConnectionBtn"),
  toggleSetupBtn: $("#toggleSetupBtn"),
  loginForm: $("#loginForm"),
  emailInput: $("#emailInput"),
  passwordInput: $("#passwordInput"),
  loginStatus: $("#loginStatus"),
  refreshBtn: $("#refreshBtn"),
  logoutBtn: $("#logoutBtn"),
  loadingOverlay: $("#loadingOverlay"),
  toast: $("#toast"),
  cloudMeta: $("#cloudMeta"),
  overviewCards: $("#overviewCards"),
  overviewTodayLabel: $("#overviewTodayLabel"),
  overviewExtraDetails: $("#overviewExtraDetails"),
  overviewAchievements: $("#overviewAchievements"),
  overviewRetiredAchievements: $("#overviewRetiredAchievements"),
  overviewActiveCount: $("#overviewActiveCount"),
  overviewRetiredCount: $("#overviewRetiredCount"),
  salesList: $("#salesList"),
  salesSummaryPanel: $("#salesSummaryPanel"),
  salesSummaryMode: $("#salesSummaryMode"),
  salesSummaryTotals: $("#salesSummaryTotals"),
  salesSummaryList: $("#salesSummaryList"),
  deliveryList: $("#deliveryList"),
  buyersList: $("#buyersList"),
  productsList: $("#productsList"),
  inventoryLatest: $("#inventoryLatest"),
  inventoryHistory: $("#inventoryHistory"),
  bonusSummary: $("#bonusSummary"),
  bonusCurrent: $("#bonusCurrent"),
  payoutHistory: $("#payoutHistory"),
  coinHistorySummary: $("#coinHistorySummary"),
  coinHistoryList: $("#coinHistoryList"),
  employeeList: $("#employeeList"),
  moreMenuBtn: $("#moreMenuBtn"),
  moreSheet: $("#moreSheet"),
  salesDetailModal: $("#salesDetailModal"),
  salesDetailEyebrow: $("#salesDetailEyebrow"),
  salesDetailTitle: $("#salesDetailTitle"),
  salesDetailContent: $("#salesDetailContent"),
  closeSalesDetailBtn: $("#closeSalesDetailBtn"),
  buyerDetailModal: $("#buyerDetailModal"),
  buyerDetailTitle: $("#buyerDetailTitle"),
  buyerDetailContent: $("#buyerDetailContent"),
  closeBuyerDetailBtn: $("#closeBuyerDetailBtn"),
  employeeDetailModal: $("#employeeDetailModal"),
  employeeDetailTitle: $("#employeeDetailTitle"),
  employeeDetailContent: $("#employeeDetailContent"),
  closeEmployeeDetailBtn: $("#closeEmployeeDetailBtn")
};

let state = {};

let inventoryReportView = null;

let cloud = { version: 0, updatedAt: "" };

let refreshTimer = null;

let swRegistration = null;

let reloadedFromUpdate = false;

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

const money = (v) => `$${Math.round(num(v)).toLocaleString("en-US")}`;

const qty = (v) => `${Math.round(num(v)).toLocaleString("ja-JP")}個`;

const roundUpThousand = (v) => num(v) > 0 ? Math.ceil(num(v) / 1000) * 1000 : 0;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const categoryKey = (v) => window.MoonlightInventoryReport.normalizeCategory(v);

const categoryLabel = (v) => ({ food: "食べ物", drink: "飲み物", joint: "ジョイント" }[categoryKey(v)] || v || "-");

const statusLabel = (e) => (e?.status === "retired" ? "退職" : "在籍");

const activeEmployee = (e) => e?.status !== "retired";

function setSplash(message, progress = 0) {
  if (els.startupText) els.startupText.textContent = message;
  if (els.startupProgressBar) els.startupProgressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function hideSplash(delay = 220) {
  setTimeout(() => els.startupSplash?.classList.add("hidden"), delay);
}

function preventDoubleTapZoom() {
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      const isFormControl = event.target.closest("input, textarea, select, label");
      if (!isFormControl && now - lastTouchEnd < 280) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

function invoiceAt(v) {
  const s = String(v || "");
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
  if (!m) return esc(s);
  return `${m[1]}/${m[2]}/${m[3]} ${m[4] || "00"}:${m[5] || "00"}`;
}

function dateOnly(v) {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replaceAll("-", "/") : "-";
}

function showLoading(on) {
  els.loadingOverlay.classList.toggle("hidden", !on);
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2400);
}

function empty(text) {
  return `<div class="empty-state">${esc(text)}</div>`;
}

function amountCell(label, amount, note = "") {
  return `<div class="breakdown-cell${note && note.startsWith("+") ? " accent" : ""}"><span class="cell-label">${label}</span><strong>${amount}</strong>${note ? `<small>${note}</small>` : ""}</div>`;
}
