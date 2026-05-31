"use strict";

const { getConfig } = require("../main/config");
const profiles = require("./profiles");
const memory = require("./memory");
const llm = require("./llm");
const websearch = require("./websearch");
const screen = require("../main/screen");

/**
 * High-level orchestration: capture screen -> recall memory -> ask the model
 * -> learn from the interaction. This is the brain that ties everything
 * together.
 */
async function getAdvice({ userText, includeScreen = true } = {}) {
  const config = getConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      error: "no_api_key",
      text:
        config.language === "ar"
          ? "لم يتم ضبط مفتاح الـ API بعد. افتح الإعدادات لإضافته."
          : "No API key configured yet. Open settings to add one.",
    };
  }

  const profile = profiles.getProfile(config.profession);

  let screenData = null;
  if (includeScreen) {
    try {
      screenData = await screen.captureScreen();
    } catch (err) {
      console.error("[assistant] screen capture failed:", err.message);
    }
  }

  const query = userText || `helpful ${config.profession} tip for the current screen`;
  let memorySnippets = [];
  try {
    memorySnippets = await memory.retrieveRelevant({ config, query });
  } catch (err) {
    console.error("[assistant] memory retrieve failed:", err.message);
  }

  const systemPrompt = profiles.buildSystemPrompt(profile, config, memorySnippets);
  const ctx = screen.getContext();

  const userMessage =
    userText && userText.trim()
      ? userText.trim()
      : screenData
      ? "Look at my screen and give me ONE specific, helpful tip for my work right now. Point to what you actually see."
      : "Give me one helpful tip for my work right now.";

  const composed = `${userMessage}\n\n[context: platform=${ctx.platform}, time=${ctx.time}, field=${profile.label}]`;

  let text;
  try {
    text = await llm.chat({
      config,
      systemPrompt,
      userText: composed,
      imageDataUrl: screenData ? screenData.dataUrl : null,
    });
  } catch (err) {
    return { ok: false, error: "llm_error", text: `LLM error: ${err.message}` };
  }

  // Learn from this interaction in the background (non-blocking).
  memory
    .learnFromInteraction({
      config,
      context: screenData ? screenData.displayLabel : "",
      userText,
      assistantText: text,
    })
    .catch(() => {});

  return { ok: true, text, usedScreen: Boolean(screenData), profile: profile.label };
}

async function factCheck({ claim }) {
  const config = getConfig();
  if (!config.apiKey) {
    return { ok: false, error: "no_api_key", text: "No API key configured." };
  }
  try {
    const text = await websearch.factCheck({ config, claim });
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: "search_error", text: `Search error: ${err.message}` };
  }
}

module.exports = { getAdvice, factCheck };
