// index.js
// Node 18+ (Cloud Run 기본) / fetch 내장

const express = require("express");
const app = express();

/* =========================
   🔴 여기에 API KEY 직접 넣기
   ========================= */
const GEMINI_API_KEY = "AIzaSyDrLp1X1OMdEh_SLsi1SAJTrjKXneSjpr8";

/* =========================
   모델은 검증된 값으로 고정
   ========================= */
const GEMINI_MODEL = "gemini-exp-1206";

/* =========================
   CORS (Classpin만 허용)
   ========================= */
const ALLOWED_ORIGINS = [
  "https://classpin-folder-based-classroom-board-1070949888094.us-west1.run.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  next();
});

app.use(express.json());

/* =========================
   루트 (살아있는지 확인용)
   ========================= */
app.get("/", (req, res) => {
  res
    .status(200)
    .set("Content-Type", "text/plain; charset=utf-8")
    .send("classpin-ai-proxy is alive ✅");
});

/* =========================
   헬스 체크
   ========================= */
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hasKey: GEMINI_API_KEY !== "여기에_너의_실제_API_KEY_붙여넣기",
    model: `models/${GEMINI_MODEL}`,
  });
});

/* =========================
   핵심 API
   POST /ai/text
   ========================= */
app.post("/ai/text", async (req, res) => {
  try {
    const { prompt, mode } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    let systemPrompt = "자연스럽게 응답하세요.";
    if (mode === "refine") {
      systemPrompt = "기존 문장의 의미를 유지하면서 더 자연스럽게 다듬어 주세요.";
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: `${systemPrompt}\n\n${prompt}` }
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API error",
        data,
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({ result: text });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "server error",
      detail: String(err),
    });
  }
});

/* =========================
   서버 시작
   ========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Classpin AI proxy running on port", PORT);
});
