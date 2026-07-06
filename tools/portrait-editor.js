import { PORTRAIT_CATEGORIES } from "../portraitCatalog.js";

const $ = (sel) => document.querySelector(sel);
const toastEl = $("#toast");
let existing = new Set();
let toastTimer;

function showToast(msg, type = "ok") {
  toastEl.textContent = msg;
  toastEl.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = ""; }, 3200);
}

async function fetchExisting() {
  const res = await fetch("/api/portraits/list");
  if (!res.ok) throw new Error("一覧の取得に失敗しました");
  const data = await res.json();
  existing = new Set(data.files || []);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    r.readAsDataURL(file);
  });
}

async function savePortrait(file, dataUrl) {
  const res = await fetch("/api/portraits/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, dataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "保存に失敗しました");
  return data;
}

async function deletePortrait(file) {
  const res = await fetch("/api/portraits/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "削除に失敗しました");
}

function portraitUrl(file) {
  return `/tiles/Character/${file}.png?v=${Date.now()}`;
}

function updateStats() {
  const total = PORTRAIT_CATEGORIES.reduce((n, c) => n + c.slots.length, 0);
  const filled = PORTRAIT_CATEGORIES.reduce(
    (n, c) => n + c.slots.filter((s) => existing.has(s.file)).length,
    0,
  );
  $("#stat-total").textContent = String(total);
  $("#stat-filled").textContent = String(filled);
}

function buildSlot(cat, slot) {
  const wrap = document.createElement("div");
  wrap.className = "slot";
  wrap.dataset.file = slot.file;

  const label = document.createElement("div");
  label.className = "slot-label";
  label.textContent = slot.label;

  const fileName = document.createElement("div");
  fileName.className = "slot-file";
  fileName.textContent = `${slot.file}.png`;

  const zone = document.createElement("div");
  zone.className = "dropzone";
  zone.tabIndex = 0;

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.innerHTML = "画像をドロップ<br>またはクリック";
  zone.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "slot-actions";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.textContent = "拡大";
  previewBtn.hidden = true;

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "danger";
  delBtn.textContent = "削除";
  delBtn.hidden = true;

  actions.append(previewBtn, delBtn);
  wrap.append(label, fileName, zone, actions);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.hidden = true;
  wrap.appendChild(input);

  function setPreview(has) {
    if (has) {
      zone.classList.add("has-image");
      zone.innerHTML = "";
      const img = document.createElement("img");
      img.alt = slot.label;
      img.src = portraitUrl(slot.file);
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "配置済";
      zone.append(img, badge);
      previewBtn.hidden = false;
      delBtn.hidden = false;
    } else {
      zone.classList.remove("has-image", "saving", "error");
      zone.innerHTML = "";
      zone.appendChild(hint);
      previewBtn.hidden = true;
      delBtn.hidden = true;
    }
  }

  if (existing.has(slot.file)) setPreview(true);

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("PNG / JPEG / WebP 画像を選んでください", "err");
      return;
    }
    zone.classList.add("saving");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await savePortrait(slot.file, dataUrl);
      existing.add(slot.file);
      setPreview(true);
      updateStats();
      updateCategoryCounts();
      showToast(`${slot.file}.png を保存しました`);
    } catch (e) {
      zone.classList.add("error");
      showToast(e.message, "err");
    } finally {
      zone.classList.remove("saving");
    }
  }

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    input.value = "";
    if (f) handleFile(f);
  });

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  previewBtn.addEventListener("click", () => {
    window.open(portraitUrl(slot.file), "_blank", "noopener");
  });

  delBtn.addEventListener("click", async () => {
    if (!confirm(`${slot.file}.png を削除しますか？`)) return;
    try {
      await deletePortrait(slot.file);
      existing.delete(slot.file);
      setPreview(false);
      updateStats();
      updateCategoryCounts();
      showToast(`${slot.file}.png を削除しました`);
    } catch (e) {
      showToast(e.message, "err");
    }
  });

  return wrap;
}

const categoryEls = [];

function updateCategoryCounts() {
  for (const { el, cat } of categoryEls) {
    const filled = cat.slots.filter((s) => existing.has(s.file)).length;
    const count = el.querySelector(".count");
    if (count) count.textContent = `${filled} / ${cat.slots.length}`;
  }
}

function buildUI() {
  const main = $("#main");
  main.innerHTML = "";

  for (const cat of PORTRAIT_CATEGORIES) {
    const section = document.createElement("section");
    section.className = "category";

    const head = document.createElement("div");
    head.className = "category-head";
    const filled = cat.slots.filter((s) => existing.has(s.file)).length;
    head.innerHTML = `
      <h2>${cat.label}</h2>
      <span class="desc">${cat.desc}</span>
      <span class="count">${filled} / ${cat.slots.length}</span>
    `;
    head.addEventListener("click", () => section.classList.toggle("collapsed"));

    const body = document.createElement("div");
    body.className = "category-body";
    for (const slot of cat.slots) {
      body.appendChild(buildSlot(cat, slot));
    }

    section.append(head, body);
    main.appendChild(section);
    categoryEls.push({ el: section, cat });
  }

  updateStats();
}

async function init() {
  try {
    await fetchExisting();
    buildUI();
    showToast("ドロップすると自動でリネーム保存されます");
  } catch (e) {
    $("#main").innerHTML = `<p class="empty-note">エラー: ${e.message}<br>npm run dev で起動しているか確認してください。</p>`;
    showToast(e.message, "err");
  }
}

init();