"use strict";

const { desktopCapturer, screen } = require("electron");

/**
 * Capture the current screen as a PNG data URL for the vision model.
 * Downscaled to keep the request small/fast/cheap while staying readable.
 */
async function captureScreen(maxWidth = 1366) {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = primary.scaleFactor || 1;

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    },
  });

  if (!sources.length) {
    throw new Error("No screen source available to capture.");
  }

  let thumb = sources[0].thumbnail;
  const size = thumb.getSize();
  if (size.width > maxWidth) {
    thumb = thumb.resize({ width: maxWidth });
  }

  return {
    dataUrl: thumb.toDataURL(),
    width: thumb.getSize().width,
    height: thumb.getSize().height,
    displayLabel: sources[0].name || "Screen",
  };
}

/**
 * Best-effort textual context about the environment. Window-title detection
 * via a native module is intentionally avoided to keep packaging dependency
 * free — the vision model reads title bars from the screenshot itself.
 */
function getContext() {
  return {
    platform: process.platform,
    time: new Date().toLocaleString(),
  };
}

module.exports = { captureScreen, getContext };
