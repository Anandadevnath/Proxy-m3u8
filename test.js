import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();
const PORT = process.env.PORT || 8000;

function isAllowedTarget(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isPlaylist(pathname) {
  return pathname.toLowerCase().endsWith(".m3u8");
}

function isSegmentLike(pathname) {
  const p = pathname.toLowerCase();
  return (
    p.endsWith(".ts") ||
    p.endsWith(".m4s") ||
    p.endsWith(".mp4") ||
    p.endsWith(".aac") ||
    p.endsWith(".mp3") ||
    p.endsWith(".vtt") ||
    p.endsWith(".key")
  );
}

function makeProxyUrl(req, absoluteUrl) {
  const host = req.header("host");
  const protocol = req.url.startsWith("https") ? "https" : "http";
  return `${protocol}://${host}/hls?src=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteM3U8(text, baseUrl, req) {
  const base = new URL(baseUrl);

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = new URL(uri, base).toString();
          return `URI="${makeProxyUrl(req, abs)}"`;
        });
      }

      try {
        const abs = new URL(trimmed, base).toString();
        return makeProxyUrl(req, abs);
      } catch {
        return line;
      }
    })
    .join("\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// Handle OPTIONS preflight for /hls
app.options("/hls", (c) => {
  return c.text("", 204, corsHeaders);
});

// Handle OPTIONS preflight for everything else
app.options("*", (c) => {
  return c.text("", 204, corsHeaders);
});

app.get("/", (c) => c.text("Proxy is running"));

app.get("/hls", async (c) => {
  const src = c.req.query("src");

  if (!src || typeof src !== "string") {
    return c.text("Missing src", 400, corsHeaders);
  }

  if (!isAllowedTarget(src)) {
    return c.text("Invalid or disallowed URL", 403, corsHeaders);
  }

  let target;
  try {
    target = new URL(src);
  } catch {
    return c.text("Invalid URL", 400, corsHeaders);
  }

  const pathname = target.pathname;

  if (!isPlaylist(pathname) && !isSegmentLike(pathname)) {
    return c.text("Unsupported media type", 400, corsHeaders);
  }

  try {
    const upstream = await fetch(src, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return c.text("Upstream error", upstream.status, corsHeaders);
    }

    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "*");
    headers.set("Cache-Control", "no-store");

    if (isPlaylist(pathname)) {
      const contentType =
        upstream.headers.get("content-type") ||
        "application/vnd.apple.mpegurl";
      const text = await upstream.text();
      const rewritten = rewriteM3U8(text, src, c.req);
      headers.set("Content-Type", contentType);
      return c.text(rewritten, 200, Object.fromEntries(headers.entries()));
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    headers.set("Content-Type", contentType);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error(err.message);
    return c.text("Proxy failed", 500, corsHeaders);
  }
});

serve({ fetch: app.fetch, port: Number(PORT) }, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});