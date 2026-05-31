# AI Desk Assistant — "Mira" 🤖

A modern, Clippy-style **smart desktop assistant** that lives in a small floating
bubble, **reads your screen**, and gives **specific, field-aware advice** — and
keeps **learning about you** over time.

Think of it as a personal mentor for whatever you do on your laptop:

- 👨‍💻 **Programmer** → an expert pair-programmer that spots bugs, explains errors, suggests refactors.
- 🎨 **Designer** → a senior designer critiquing layout, color, and typography.
- 🧮 **Accountant** → reviews your spreadsheets and explains the numbers.
- 📈 **Crypto** → explains charts and news, always flagging risk.

> The first shipped profile is **Programming**. New fields are easy to add in
> `src/services/profiles.js`.

## Features

- **Reads the screen** — captures the current screen and sends it to a vision LLM, so advice is about what you are *actually* doing.
- **Floating bubble** — frameless, always-on-top, draggable, RTL/Arabic UI, plus a tray icon and a global hotkey (`Ctrl/Cmd+Shift+Space`).
- **Proactive or on-demand** — ask for a tip, or let it periodically offer suggestions.
- **Learns & remembers** — distills durable facts about you into a local memory database (`memory.json`) and uses them (RAG) to personalize future help.
- **Searches & fact-checks** — keyless web search (DuckDuckGo) to investigate claims.
- **Multi-provider** — OpenAI, Anthropic (Claude), or Google Gemini. No SDKs; uses `fetch`.

## Privacy

- Screenshots are sent **only** to the AI provider you choose, **only** when you ask for a tip (or on the proactive interval you set).
- The API key is read from the `LLM_API_KEY` environment variable when present (so it never has to be written to disk), otherwise it is stored locally via `electron-store`.
- The memory database stays **on your machine**.

## Requirements

- Node.js 18+ and npm
- An API key for one of: OpenAI / Anthropic / Google Gemini

## Run (development)

```bash
npm install
# Provide your key (recommended): keeps it out of the settings file
export LLM_API_KEY="sk-..."        # PowerShell: $env:LLM_API_KEY="sk-..."
npm start
```

Then open **Settings (⚙)** in the bubble to pick your provider, field, and
experience level. Click **💡 نصيحة عن الشاشة** to get a tip about your screen.

## Build a Windows installer

```bash
npm run dist      # produces an NSIS installer in dist/
```

(Cross-building Windows artifacts from Linux/macOS may require Wine; building on
Windows works out of the box.)

## Project structure

```
src/
  main/        Electron main process: windows, tray, screen capture, IPC, config
  preload/     Secure contextBridge API
  renderer/    The floating bubble UI + settings window
  services/    llm (multi-provider), memory (RAG), websearch, profiles, assistant
assets/        Icon (and its generator)
```

## License

MIT
