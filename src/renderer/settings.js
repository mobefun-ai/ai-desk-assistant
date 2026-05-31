"use strict";

const el = (id) => document.getElementById(id);

async function load() {
  const cfg = await window.assistant.getConfig();
  const profiles = await window.assistant.getProfiles();

  const profSel = el("profession");
  profSel.innerHTML = "";
  for (const p of profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.emoji} ${p.labelAr || p.label}`;
    profSel.appendChild(opt);
  }

  el("provider").value = cfg.provider;
  el("model").value = cfg.model || "";
  el("profession").value = cfg.profession;
  el("experienceLevel").value = cfg.experienceLevel;
  el("language").value = cfg.language;
  el("proactive").checked = !!cfg.proactive;
  el("intervalSeconds").value = cfg.intervalSeconds;
  el("webSearchEnabled").checked = !!cfg.webSearchEnabled;

  if (cfg.apiKeyFromEnv) {
    el("envBadge").style.display = "inline";
    el("apiKey").placeholder = "مضبوط عبر متغير البيئة";
    el("apiKey").disabled = true;
  } else if (cfg.hasApiKey) {
    el("apiKey").placeholder = "•••••••• (محفوظ)";
  }

  renderMemory();
}

async function renderMemory() {
  const list = await window.assistant.getMemory();
  const wrap = el("memList");
  wrap.innerHTML = "";
  if (!list.length) {
    wrap.innerHTML = '<div class="mem-item" style="color:#9ca3af">لا يوجد شيء بعد.</div>';
    return;
  }
  for (const item of list.slice(0, 50)) {
    const d = document.createElement("div");
    d.className = "mem-item";
    d.textContent = item.text;
    wrap.appendChild(d);
  }
}

async function save() {
  const patch = {
    provider: el("provider").value,
    model: el("model").value.trim(),
    profession: el("profession").value,
    experienceLevel: el("experienceLevel").value,
    language: el("language").value,
    proactive: el("proactive").checked,
    intervalSeconds: Number(el("intervalSeconds").value) || 45,
    webSearchEnabled: el("webSearchEnabled").checked,
  };
  const key = el("apiKey").value.trim();
  if (key && !el("apiKey").disabled) {
    patch.apiKey = key;
  }
  await window.assistant.setConfig(patch);
  const status = el("status");
  status.textContent = "تم الحفظ ✓";
  setTimeout(() => (status.textContent = ""), 2000);
  el("apiKey").value = "";
}

el("saveBtn").addEventListener("click", save);
el("clearMem").addEventListener("click", async () => {
  await window.assistant.clearMemory();
  renderMemory();
});

load();
