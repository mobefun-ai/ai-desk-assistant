"use strict";

const llm = require("./llm");

/**
 * Keyless web search + fact checking. Uses DuckDuckGo's public endpoints so
 * the assistant can "search and investigate facts" without extra API keys.
 * Results are best-effort; failures degrade gracefully.
 */

function decodeEntities(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, "")).trim();
}

async function instantAnswer(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query
    )}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(url, { headers: { "User-Agent": "AI-Desk-Assistant" } });
    if (!res.ok) return [];
    const json = await res.json();
    const out = [];
    if (json.AbstractText) {
      out.push({
        title: json.Heading || query,
        snippet: json.AbstractText,
        url: json.AbstractURL || "",
      });
    }
    for (const topic of json.RelatedTopics || []) {
      if (topic.Text && topic.FirstURL) {
        out.push({ title: topic.Text, snippet: topic.Text, url: topic.FirstURL });
      }
      if (out.length >= 5) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function htmlSearch(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const re =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && results.length < 6) {
      results.push({ title: stripTags(m[2]), snippet: "", url: decodeEntities(m[1]) });
    }
    return results;
  } catch {
    return [];
  }
}

async function search(query) {
  const instant = await instantAnswer(query);
  if (instant.length) return instant;
  return htmlSearch(query);
}

/**
 * Verify a claim by searching the web and asking the model to judge the
 * evidence. Returns a short verdict string.
 */
async function factCheck({ config, claim }) {
  const results = await search(claim);
  if (!results.length) {
    return "تعذّر العثور على مصادر كافية للتحقق الآن.";
  }
  const evidence = results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title} ${r.snippet ? "- " + r.snippet : ""} (${r.url})`)
    .join("\n");

  return llm.chat({
    config,
    systemPrompt:
      "You are a careful fact checker. Using ONLY the provided sources, judge the claim. Be concise. Cite source numbers. If sources are insufficient, say so. Reply in the user's language.",
    userText: `Claim: ${claim}\n\nSources:\n${evidence}\n\nVerdict:`,
  });
}

module.exports = { search, factCheck };
