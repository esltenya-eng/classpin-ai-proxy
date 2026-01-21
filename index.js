import express from "express";
import cors from "cors";

const app = express();

// ✅ CORS + JSON body
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

// ✅ Cloud Run env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const RAW_MODEL = process.env.GEMINI_MODEL || "models/gemini-exp-1206";

// ✅ 모델 문자열 정규화: "models/xxx"든 "xxx"든 둘 다 받아서 "models/xxx"로 맞춤
const MODEL = RAW_MODEL.startsWith("models/") ? RAW_MODEL : `models/${RAW_MODEL}`;

// ✅ 공통: Gemini 호출
async function callGeminiGenerateContent({ prompt, systemPrompt }) {
  if (!GEMINI_API_KEY) {
    return {
      ok: false,
      status: 500,
      data: { error: "GEMINI_API_KEY is missing in Cloud Run env" },
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: String(prompt || "") }],
      },
    ],
  };

  // ✅ systemPrompt가 있으면 systemInstruction으로 넣음
  if (systemPrompt && String(systemPrompt).trim()) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: String(systemPrompt) }],
    };
  }

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await r.json();
  } catch {
    data = { error: "Non-JSON response from Gemini API" };
  }

  return { ok: r.ok, status: r.status, data };
}

// ✅ health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(GEMINI_API_KEY),
    model: MODEL,
  });
});

// ✅ models 목록 프록시 (브라우저에서 /ai/models 열면 models[]가 내려오게)
app.get("/ai/models", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing in Cloud Run env" });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;

  const r = await fetch(url);
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = { error: "Non-JSON response from Gemini models endpoint" };
  }

  return res.status(r.status).json(data);
});

// ✅ text endpoint: 네가 콘솔에서 치는 그대로 {prompt, mode} 받도록 맞춤
app.post("/ai/text", async (req, res) => {
  try {
    const { prompt, mode } = req.body || {};

    // mode별 systemPrompt (원하면 여기 문구만 바꿔도 됨)
    const systemPrompt =
      mode === "refine"
        ? "You are a helpful editor. Rewrite the user's Korean text more naturally while preserving meaning."
        : "You are a helpful assistant.";

    const out = await callGeminiGenerateContent({ prompt, systemPrompt });

    // ✅ Gemini가 에러면 status 그대로 반환 (403/429 그대로 보이게)
    if (!out.ok) {
      return res.status(out.status).json({
        error: "Gemini API error",
        data: out.data,
      });
    }

    // ✅ 결과 텍스트 안전 추출
    const text =
      out.data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      out.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ??
      "";

    return res.json({ result: text });
  } catch (e) {
    return res.status(500).json({ error: "AI 처리 중 오류", detail: String(e) });
  }
});

// ✅ listen
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Classpin AI proxy running on port ${PORT}`);
});
