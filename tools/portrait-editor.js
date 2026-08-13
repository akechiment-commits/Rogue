import { mergePortraitCategories } from "../portraitCatalog.js";
import { transparentizeDataUrl } from "../portraitTransparency.js";

const $ = (sel) => document.querySelector(sel);
const toastEl = $("#toast");
const previewModal = $("#preview-modal");
const previewImage = $("#preview-image");
const previewTitle = $("#preview-title");
const previewFile = $("#preview-file");
let existing = new Set();
let categories = [];
let toastTimer;

function closePreview() {
  if (!previewModal || previewModal.hidden) return;
  previewModal.hidden = true;
  document.body.classList.remove("preview-open");
  previewImage.removeAttribute("src");
}

function openPreview(slot) {
  previewTitle.textContent = slot.label;
  previewFile.textContent = `${slot.file}.png`;
  previewImage.alt = slot.label;
  previewImage.src = portraitUrl(slot.file);
  previewModal.hidden = false;
  document.body.classList.add("preview-open");
  $("#preview-close")?.focus();
}

$("#preview-close")?.addEventListener("click", closePreview);
previewModal?.addEventListener("click", (e) => {
  if (e.target === previewModal) closePreview();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePreview();
});

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

async function fetchCategories() {
  const res = await fetch("/api/portraits/extra-slots");
  if (!res.ok) throw new Error("スロット定義の取得に失敗しました");
  const data = await res.json();
  categories = mergePortraitCategories(data.slots || []);
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

async function transparentizeAll() {
  const res = await fetch("/api/portraits/transparentize-all", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "一括透過に失敗しました");
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

async function addExtraSlot(categoryId, afterFile) {
  const res = await fetch("/api/portraits/extra-slots/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, afterFile }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "欄の追加に失敗しました");
  return data.slot;
}

async function removeExtraSlot(file, deleteImage) {
  const res = await fetch("/api/portraits/extra-slots/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, deleteImage }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "欄の削除に失敗しました");
}

function portraitUrl(file) {
  return `/tiles/Character/${file}.png?v=${Date.now()}`;
}

function updateStats() {
  const total = categories.reduce((n, c) => n + c.slots.length, 0);
  const filled = categories.reduce(
    (n, c) => n + c.slots.filter((s) => existing.has(s.file)).length,
    0,
  );
  $("#stat-total").textContent = String(total);
  $("#stat-filled").textContent = String(filled);
}

function buildSlot(cat, slot) {
  const wrap = document.createElement("div");
  wrap.className = `slot${slot.base === false ? " slot-extra" : ""}`;
  wrap.dataset.file = slot.file;

  const head = document.createElement("div");
  head.className = "slot-head";

  const label = document.createElement("div");
  label.className = "slot-label";
  label.textContent = slot.label;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "slot-add-btn";
  addBtn.title = "この立ち絵の欄を追加（例: 矢2, 矢3）";
  addBtn.textContent = "+ 欄";
  addBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    addBtn.disabled = true;
    try {
      const created = await addExtraSlot(cat.id, slot.file);
      await fetchCategories();
      rebuildUI();
      showToast(`${created.label}（${created.file}.png）の欄を追加しました`);
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      addBtn.disabled = false;
    }
  });

  head.append(label, addBtn);

  const fileName = document.createElement("div");
  fileName.className = "slot-file";
  const groupHint = slot.group ? ` · ${slot.group}` : "";
  fileName.textContent = `${slot.file}.png${groupHint}`;

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
  delBtn.textContent = "画像削除";
  delBtn.hidden = true;

  const removeSlotBtn = document.createElement("button");
  removeSlotBtn.type = "button";
  removeSlotBtn.className = "danger";
  removeSlotBtn.textContent = "欄削除";
  removeSlotBtn.hidden = slot.base !== false;

  actions.append(previewBtn, delBtn, removeSlotBtn);
  wrap.append(head, fileName, zone, actions);

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
      badge.textContent = slot.base === false ? "追加欄" : "配置済";
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
      const raw = await readFileAsDataUrl(file);
      const dataUrl = await transparentizeDataUrl(raw);
      await savePortrait(slot.file, dataUrl);
      existing.add(slot.file);
      setPreview(true);
      updateStats();
      updateCategoryCounts();
      showToast(`${slot.file}.png を透過処理して保存しました`);
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
    openPreview(slot);
  });

  delBtn.addEventListener("click", async () => {
    if (!confirm(`${slot.file}.png の画像を削除しますか？`)) return;
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

  removeSlotBtn.addEventListener("click", async () => {
    const hasImg = existing.has(slot.file);
    const msg = hasImg
      ? `${slot.label}（${slot.file}.png）の欄と画像を削除しますか？`
      : `${slot.label}（${slot.file}.png）の欄を削除しますか？`;
    if (!confirm(msg)) return;
    try {
      await removeExtraSlot(slot.file, hasImg);
      if (hasImg) existing.delete(slot.file);
      await fetchCategories();
      rebuildUI();
      showToast(`${slot.label} の欄を削除しました`);
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

function rebuildUI() {
  const main = $("#main");
  main.innerHTML = "";
  categoryEls.length = 0;

  for (const cat of categories) {
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

function setupBatchTransparent() {
  const btn = $("#btn-batch-transparent");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!confirm("tiles/Character/ 内の全 PNG に透過処理を再適用します。よろしいですか？")) return;
    btn.disabled = true;
    try {
      const data = await transparentizeAll();
      document.querySelectorAll(".dropzone.has-image img").forEach((img) => {
        const file = img.closest(".slot")?.dataset?.file;
        if (file) img.src = portraitUrl(file);
      });
      showToast(`${data.count ?? 0} 枚を透過処理しました`);
    } catch (e) {
      showToast(e.message, "err");
    } finally {
      btn.disabled = false;
    }
  });
}

async function init() {
  try {
    await Promise.all([fetchExisting(), fetchCategories()]);
    rebuildUI();
    setupBatchTransparent();
    showToast("各欄の「+ 欄」でバリエーションを追加できます");
  } catch (e) {
    $("#main").innerHTML = `<p class="empty-note">エラー: ${e.message}<br>npm run dev で起動しているか確認してください。</p>`;
    showToast(e.message, "err");
  }
}

init();
