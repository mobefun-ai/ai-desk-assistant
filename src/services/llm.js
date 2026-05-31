"use strict";

/**
 * Multi-provider LLM client (OpenAI, Anthropic, Google Gemini).
 *
 * Uses the global `fetch` available in the Electron main process, so there
 * are no heavy SDK dependencies and packaging to Windows stays trivial.
 * Every provider supports vision, which is what powers "reading the screen".
 */

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.5-flash",
};

const EMBED_MODELS = {
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-001",
};

function parseDataUrl(dataUrl) {
  // data:[<mediatype>][;base64],<data>
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!match) return null;
  return {
    mediaType: match[1] || "image/png",
    base64: match[3] || "",
  };
}

async function readError(res) {
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "<no body>";
  }
  return `HTTP ${res.status} ${res.statusText}: ${body.slice(0, 500)}`;
}

/* ------------------------------- OpenAI -------------------------------- */
async function openaiChat({ apiKey, model, systemPrompt, userText, imageDataUrl }) {
  const content = [{ type: "text", text: userText }];
  if (imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: imageDataUrl } });
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.openai,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || "";
}

/* ------------------------------ Anthropic ------------------------------ */
async function anthropicChat({ apiKey, model, systemPrompt, userText, imageDataUrl }) {
  const content = [];
  if (imageDataUrl) {
    const parsed = parseDataUrl(imageDataUrl);
    if (parsed) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.base64,
        },
      });
    }
  }
  content.push({ type: "text", text: userText });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.anthropic,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return (json.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
}

/* ------------------------------- Gemini -------------------------------- */
async function geminiChat({ apiKey, model, systemPrompt, userText, imageDataUrl }) {
  const parts = [{ text: userText }];
  if (imageDataUrl) {
    const parsed = parseDataUrl(imageDataUrl);
    if (parsed) {
      parts.push({
        inline_data: { mime_type: parsed.mediaType, data: parsed.base64 },
      });
    }
  }
  const usedModel = model || DEFAULT_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 700 },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return (
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || ""
  );
}

/* ------------------------------- Public -------------------------------- */
async function chat({ config, systemPrompt, userText, imageDataUrl }) {
  const provider = config.provider || "openai";
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error("No API key configured.");
  const args = {
    apiKey,
    model: config.model,
    systemPrompt,
    userText,
    imageDataUrl,
  };
  switch (provider) {
    case "anthropic":
      return anthropicChat(args);
    case "gemini":
      return geminiChat(args);
    case "openai":
    default:
      return openaiChat(args);
  }
}

/**
 * Returns an embedding vector for `text`, or null if the provider has no
 * embeddings endpoint (Anthropic). Callers fall back to keyword matching.
 */
async function embed({ config, text }) {
  const provider = config.provider || "openai";
  const apiKey = config.apiKey;
  if (!apiKey) return null;

  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: EMBED_MODELS.openai, input: text }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      return json.data?.[0]?.embedding || null;
    }
    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODELS.gemini}:embedContent?key=${encodeURIComponent(
        apiKey
      )}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODELS.gemini}`,
          content: { parts: [{ text }] },
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      return json.embedding?.values || null;
    }
  } catch (err) {
    console.error("[llm] embedding failed:", err.message);
    return null;
  }
  return null; // anthropic or unknown
}

module.exports = { chat, embed, DEFAULT_MODELS };
