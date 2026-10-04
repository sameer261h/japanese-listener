const MODEL = "gemini-3.5-flash-lite";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel environment variables." });

  const japanese = String(req.body?.japanese || "").trim();
  if (!japanese) return res.status(400).json({ error: "No Japanese text supplied." });
  if (japanese.length > 500) return res.status(400).json({ error: "Sentence is too long." });

  const prompt = `
You are a concise Japanese tutor helping someone learn from anime dialogue.

Analyze ONLY this recognized Japanese speech:
${JSON.stringify(japanese)}

Return:
- japanese: clean Japanese text. Fix obvious speech-recognition punctuation, but do not invent missing dialogue.
- romaji: standard readable Hepburn-style romaji.
- english: natural conversational English translation appropriate to anime dialogue.
- breakdown: useful SPOKEN-JAPANESE chunks. Each item has:
  - romaji: the spoken Japanese chunk in Hepburn romaji only (no kana/kanji)
  - meaning: short English meaning in context.
- grammar_note: one short note only when there is a useful grammar/nuance point; otherwise empty string.

Important:
- Treat conjugated expressions as useful spoken chunks where appropriate (e.g. shite iru = "are doing / doing").
- Explain particles such as は, を, が, に when they matter.
- Mention casual/masculine/feminine/polite nuance only if clearly relevant.
- Keep the whole answer compact and beginner-friendly.
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              japanese: { type: "STRING" },
              romaji: { type: "STRING" },
              english: { type: "STRING" },
              breakdown: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: { romaji: { type: "STRING" }, meaning: { type: "STRING" } },
                  required: ["romaji", "meaning"]
                }
              },
              grammar_note: { type: "STRING" }
            },
            required: ["japanese", "romaji", "english", "breakdown", "grammar_note"]
          }
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: payload?.error?.message || "Gemini request failed." });

    const raw = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!raw) return res.status(502).json({ error: "Gemini returned no text." });

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = JSON.parse(raw.replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim()); }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unexpected server error." });
  }
}