"use strict";

const { spawnSync } = require("child_process");

function normalize(v) {
  return String(v || "").trim();
}

function fileExists(p) {
  if (!p) return false;
  try {
    const fs = require("fs");
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function tryFfmpegStatic() {
  try {
    const ffmpegPath = require("ffmpeg-static");
    if (typeof ffmpegPath === "string" && ffmpegPath.length > 0 && fileExists(ffmpegPath)) {
      return ffmpegPath;
    }
    return null;
  } catch {
    return null;
  }
}

function trySystemFfmpeg() {
  try {
    const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    if (result.status === 0) {
      return "ffmpeg";
    }
    return null;
  } catch {
    return null;
  }
}

function validateFfmpeg(cmd) {
  try {
    const result = spawnSync(cmd, ["-version"], { encoding: "utf8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

function getFfmpegCommand(env = process.env) {
  const mode = normalize(env.FFMPEG_MODE || "auto").toLowerCase();
  const explicit = normalize(env.FFMPEG_PATH);

  if (explicit) {
    if (!validateFfmpeg(explicit)) {
      throw new Error(`[ffmpeg] FFMPEG_PATH is set but not valid: ${explicit}`);
    }
    return explicit;
  }

  if (mode === "static") {
    const staticPath = tryFfmpegStatic();
    if (!staticPath) {
      throw new Error("[ffmpeg] FFMPEG_MODE=static but ffmpeg-static is not installed.");
    }
    return staticPath;
  }

  if (mode === "system") {
    const systemPath = trySystemFfmpeg();
    if (!systemPath) {
      throw new Error("[ffmpeg] FFMPEG_MODE=system but system ffmpeg is not available.");
    }
    return systemPath;
  }

  const staticPath = tryFfmpegStatic();
  if (staticPath) return staticPath;

  const systemPath = trySystemFfmpeg();
  if (systemPath) return systemPath;

  return null;
}

function isStrict(env = process.env) {
  const v = normalize(env.FFMPEG_STRICT).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

module.exports = {
  getFfmpegCommand,
  validateFfmpeg,
  isStrict
};
