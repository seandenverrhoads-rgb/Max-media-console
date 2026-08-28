// Vercel serverless function: POST /api/generate
//
// The console's front-end (Max_Media_Campaign_Console_88.html) calls this
// endpoint whenever it needs the "Creative & campaign direction" section --
// it POSTs { prompt, max_tokens } and expects back the Anthropic Messages API
// response shape ({ content: [{ type: "text", text: "..." }], ... }), which
// it then parses. This function is a thin, secure proxy to Anthropic: it
// keeps the real API key on the server (an environment variable Vercel
// injects at runtime) instead of ever shipping it to the browser, where
// anyone viewing page source could steal it and run up your bill.
//
// Setup (see chat for the full walkthrough):
//   1. Get an API key from https://console.anthropic.com/settings/keys
//   2. In the Vercel project -> Settings -> Environment Variables, add:
//        ANTHROPIC_API_KEY = <your key>
//      (Production + Preview + Development, or at least Production)
//   3. Deploy this file at api/generate.js alongside index.html (the console).
//      Vercel auto-detects anything under /api as a serverless function --
//      no extra config needed for this simple case.
//
// Optional: set ANTHROPIC_MODEL as an env var too, if you ever want to pin a
// different Claude model than the default below without touching this file.

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. POST only." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "Server is missing ANTHROPIC_API_KEY. Add it in Vercel -> Project Settings -> Environment Variables, then redeploy.",
    });
    return;
  }

  let body = req.body;
  // Vercel usually parses JSON bodies automatically, but guard in case it
  // arrives as a raw string (e.g. a different runtime/config).
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }
  }

  const prompt = body && body.prompt;
  const maxTokens = (body && body.max_tokens) || 1000;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing required field: prompt (string)." });
    return;
  }

  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      // Surface Anthropic's own error message (e.g. bad key, rate limit,
      // invalid model) rather than a bare status code, so it's actually
      // diagnosable from the console's "Couldn't generate creative
      // direction (...)" error box.
      const message = (data && data.error && data.error.message) || "Unknown error from Anthropic API.";
      res.status(anthropicResponse.status).json({ error: message });
      return;
    }

    // Pass the native Anthropic response straight through -- the console's
    // callClaudeBroadcast/callClaudeDigital functions already expect
    // data.content[].text in exactly this shape.
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: "Could not reach Anthropic API: " + (err.message || String(err)) });
  }
};
