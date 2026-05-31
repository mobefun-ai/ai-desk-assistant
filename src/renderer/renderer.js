"use strict";

const app = document.getElementById("app");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const tipBtn = document.getElementById("tipBtn");
const factBtn = document.getElementById("factBtn");
const expandBtn = document.getElementById("expandBtn");
const settingsBtn = document.getElementById("settingsBtn");
const hideBtn = document.getElementById("hideBtn");
const subtitleEl = document.getElementById("subtitle");

const SIZE = {
  collapsed: { w: 380, h: 160 },
  expanded: { w: 400, h: 470 },
};

let expanded = false;
let busy = false;

function setExpanded(value) {
  expanded = value;
  app.classList.toggle("collapsed", !expanded);
  const s = expanded ? SIZE.expanded : SIZE.collapsed;
  window.assistant.setBubbleSize(s.w, s.h);
}

function addMessage(text, role = "assistant") {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function showTyping() {
  const div = addMessage("Mira تكتب…", "assistant");
  div.classList.add("typing");
  return div;
}

async function runAdvice(userText, includeScreen) {
  if (busy) return;
  busy = true;
  sendBtn.disabled = true;
  if (!expanded) setExpanded(true);
  if (userText) addMessage(userText, "user");
  const typing = showTyping();
  try {
    const res = await window.assistant.getAdvice(userText || null, includeScreen);
    typing.remove();
    addMessage(res.text, res.ok ? "assistant" : "error");
  } catch (err) {
    typing.remove();
    addMessage(`خطأ: ${err.message}`, "error");
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

async function runFactCheck(claim) {
  if (busy || !claim) return;
  busy = true;
  sendBtn.disabled = true;
  if (!expanded) setExpanded(true);
  addMessage(`تحقّق: ${claim}`, "user");
  const typing = showTyping();
  try {
    const res = await window.assistant.factCheck(claim);
    typing.remove();
    addMessage(res.text, res.ok ? "assistant" : "error");
  } catch (err) {
    typing.remove();
    addMessage(`خطأ: ${err.message}`, "error");
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

function handleSend() {
  const text = inputEl.value.trim();
  if (!text) {
    // No text -> ask for a tip about the current screen.
    runAdvice(null, true);
    return;
  }
  inputEl.value = "";
  autoGrow();
  runAdvice(text, true);
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 90) + "px";
}

/* Events */
sendBtn.addEventListener("click", handleSend);
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

tipBtn.addEventListener("click", () => runAdvice(null, true));
factBtn.addEventListener("click", () => {
  const claim = inputEl.value.trim();
  if (!claim) {
    setExpanded(true);
    addMessage("اكتب المعلومة التي تريد التحقق منها ثم اضغط 🔎.", "assistant");
    inputEl.focus();
    return;
  }
  inputEl.value = "";
  autoGrow();
  runFactCheck(claim);
});

expandBtn.addEventListener("click", () => setExpanded(!expanded));
settingsBtn.addEventListener("click", () => window.assistant.openSettings());
hideBtn.addEventListener("click", () => window.assistant.setBubbleSize && window.close());

/* Proactive tips pushed from the main process */
window.assistant.onTip((res) => {
  if (!expanded) setExpanded(true);
  addMessage(res.text, res.ok ? "assistant" : "error");
});

window.assistant.onShowChat(() => {
  setExpanded(true);
  inputEl.focus();
});

/* Init */
(async function init() {
  try {
    const cfg = await window.assistant.getConfig();
    if (cfg.language === "ar") {
      document.documentElement.dir = "rtl";
    }
    const profs = await window.assistant.getProfiles();
    const current = profs.find((p) => p.id === cfg.profession);
    if (current) {
      subtitleEl.textContent = `${current.emoji} ${current.labelAr || current.label}`;
    }
    if (!cfg.hasApiKey) {
      addMessage(
        "مرحبًا! أنا Mira 👋 لم يتم ضبط مفتاح الـ API بعد. اضغط ⚙ لإضافته ثم اطلب نصيحة.",
        "assistant"
      );
    } else {
      addMessage(
        "مرحبًا! أنا Mira 👋 اضغط «نصيحة عن الشاشة» أو اكتب سؤالك وسأساعدك.",
        "assistant"
      );
    }
  } catch (err) {
    addMessage(`تعذّر التحميل: ${err.message}`, "error");
  }
})();
