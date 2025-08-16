// src/worker.js
const ORIGINS = new Set([
  "https://chat.arkoninteractive.com",
  "http://localhost:5173",
  "http://localhost:4321"
]);

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const enc = (s) => new TextEncoder().encode(s);

function cors(req) {
  const o = req.headers.get("Origin");
  const allow = o && ORIGINS.has(o) ? o : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-cache"
  };
}

function* chunks(s, n) {
  for (let i = 0; i < s.length; i += n) yield s.slice(i, i + n);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(request) });
    }

    // Streaming chat
    if (url.pathname === "/api/chat/stream" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch {}
      const prompt = body?.prompt;
      if (!prompt || typeof prompt !== "string") {
        return new Response(JSON.stringify({ error: "prompt required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors(request) }
        });
      }

      // Call Cloudflare AI (returns full string). We chunk it into SSE.
      const ai = await env.AI.run(MODEL, {
        messages: [{ role: "user", content: prompt }]
      });
      const full = ai?.response || "";

      const stream = new ReadableStream({
        start(c) {
          c.enqueue(enc(`event: open\ndata: {}\n\n`));
          for (const part of chunks(full, 512)) {
            c.enqueue(enc(`data: ${JSON.stringify({ delta: part })}\n\n`));
          }
          c.enqueue(enc(`event: done\ndata: {}\n\n`));
          c.close();
        }
      });

      return new Response(stream, {
        headers: {
          ...cors(request),
          "Content-Type": "text/event-stream",
          "Connection": "keep-alive"
        }
      });
    }

    // Fallback
    return new Response("Not found", { status: 404, headers: cors(request) });
  }
};
