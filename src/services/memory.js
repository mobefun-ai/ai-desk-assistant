"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const llm = require("./llm");

/**
 * Lightweight, dependency-free long-term memory ("the database the assistant
 * builds about its user"). Entries are persisted to a JSON file in the app's
 * user-data directory. Retrieval uses embedding cosine-similarity when the
 * provider supports embeddings, and falls back to keyword overlap otherwise.
 *
 * This is intentionally pure-JS (no native modules) so the app packages to
 * Windows without a build step. It can later be swapped for a real vector DB.
 */

let DATA_FILE = null;
let cache = null;

function init(dataDir) {
  DATA_FILE = path.join(dataDir, "memory.json");
  load();
}

function load() {
  try {
    if (DATA_FILE && fs.existsSync(DATA_FILE)) {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[memory] failed to load:", err.message);
  }
  if (!cache || !Array.isArray(cache.entries)) {
    cache = { entries: [] };
  }
  return cache;
}

function save() {
  if (!DATA_FILE) return;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("[memory] failed to save:", err.message);
  }
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function keywordScore(query, text) {
  const q = tokenize(query);
  const t = tokenize(text);
  if (q.size === 0 || t.size === 0) return 0;
  let overlap = 0;
  for (const tok of q) if (t.has(tok)) overlap++;
  return overlap / q.size;
}

/**
 * Add a piece of knowledge to long-term memory. Computes an embedding when
 * possible so future retrieval is semantic.
 */
async function addMemory({ config, text, type = "note", profession }) {
  if (!text || !text.trim()) return null;
  const embedding = await llm.embed({ config, text });
  const entry = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    type,
    profession: profession || config.profession,
    text: text.trim(),
    embedding: embedding || null,
  };
  cache.entries.push(entry);
  // Keep the store bounded.
  if (cache.entries.length > 2000) {
    cache.entries = cache.entries.slice(-2000);
  }
  save();
  return entry;
}

/**
 * Retrieve the most relevant memory snippets for a query.
 */
async function retrieveRelevant({ config, query, limit = 5 }) {
  if (!cache.entries.length) return [];
  const queryEmbedding = await llm.embed({ config, text: query });

  const scored = cache.entries.map((e) => {
    let score;
    if (queryEmbedding && e.embedding) {
      score = cosine(queryEmbedding, e.embedding);
    } else {
      score = keywordScore(query, e.text);
    }
    // Slight preference for entries matching the active profession.
    if (e.profession && config.profession && e.profession === config.profession) {
      score += 0.05;
    }
    return { entry: e, score };
  });

  return scored
    .filter((s) => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry.text);
}

/**
 * After an interaction, ask the model to distill a durable, generalizable
 * learning about the user and store it. This is the "learns and develops
 * itself" loop.
 */
async function learnFromInteraction({ config, context, userText, assistantText }) {
  try {
    const prompt = [
      "From the following interaction, extract at most ONE concise, durable fact or preference about THIS user that would help personalize future help.",
      "Return only the fact in one short sentence, or the single word NONE if nothing is worth remembering.",
      "",
      `Field: ${config.profession}`,
      context ? `Screen context: ${context}` : "",
      userText ? `User said: ${userText}` : "",
      `Assistant said: ${assistantText}`,
    ]
      .filter(Boolean)
      .join("\n");

    const fact = await llm.chat({
      config,
      systemPrompt:
        "You distill durable user facts for a personal assistant's memory. Be terse. Never invent.",
      userText: prompt,
    });

    const clean = (fact || "").trim();
    if (clean && clean.toUpperCase() !== "NONE" && clean.length < 300) {
      await addMemory({ config, text: clean, type: "learned" });
      return clean;
    }
  } catch (err) {
    console.error("[memory] learnFromInteraction failed:", err.message);
  }
  return null;
}

function getAll() {
  return cache.entries.slice().reverse();
}

function clearAll() {
  cache = { entries: [] };
  save();
}

module.exports = {
  init,
  addMemory,
  retrieveRelevant,
  learnFromInteraction,
  getAll,
  clearAll,
};
