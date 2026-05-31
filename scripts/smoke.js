"use strict";
// Quick smoke test for the non-Electron services (no API key required).
const os = require("os");
const path = require("path");
const profiles = require("../src/services/profiles");
const memory = require("../src/services/memory");
const websearch = require("../src/services/websearch");

(async () => {
  console.log("Profiles:", profiles.listProfiles().map((p) => p.id).join(", "));

  const cfg = { provider: "openai", apiKey: "", profession: "programming", language: "ar" };
  const sys = profiles.buildSystemPrompt(profiles.getProfile("programming"), cfg, [
    "User prefers TypeScript over JavaScript.",
  ]);
  console.log("System prompt length:", sys.length, "(contains memory:", sys.includes("TypeScript"), ")");

  memory.init(path.join(os.tmpdir(), "mira-smoke"));
  await memory.addMemory({ config: cfg, text: "User is building an Electron app in JavaScript." });
  await memory.addMemory({ config: cfg, text: "User likes concise code reviews." });
  const hits = await memory.retrieveRelevant({ config: cfg, query: "electron javascript review", limit: 3 });
  console.log("Memory keyword retrieval hits:", hits.length, "->", JSON.stringify(hits));

  console.log("Running web search…");
  const results = await websearch.search("what is electron framework");
  console.log("Web search results:", results.length, results[0] ? "first=" + results[0].title.slice(0, 60) : "");

  console.log("SMOKE OK");
})().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
