"use strict";

const Store = require("electron-store");

/**
 * Persistent user settings. The API key can also come from the
 * LLM_API_KEY environment variable, which always takes precedence so we
 * never have to persist a secret to disk during development/testing.
 */
const store = new Store({
  name: "settings",
  defaults: {
    provider: "openai",
    apiKey: "",
    model: "",
    profession: "programming",
    experienceLevel: "intermediate",
    language: "ar",
    proactive: false,
    intervalSeconds: 45,
    webSearchEnabled: true,
  },
});

function getConfig() {
  const cfg = store.store;
  // Environment variable wins so secrets stay out of the settings file.
  const envKey = process.env.LLM_API_KEY;
  return {
    ...cfg,
    apiKey: envKey && envKey.trim() ? envKey.trim() : cfg.apiKey,
    apiKeyFromEnv: Boolean(envKey && envKey.trim()),
  };
}

function setConfig(patch) {
  for (const [key, value] of Object.entries(patch)) {
    // Never persist a key that is being supplied via the environment.
    if (key === "apiKey" && process.env.LLM_API_KEY) continue;
    store.set(key, value);
  }
  return getConfig();
}

function hasApiKey() {
  const { apiKey } = getConfig();
  return Boolean(apiKey && apiKey.trim());
}

module.exports = { getConfig, setConfig, hasApiKey, store };
