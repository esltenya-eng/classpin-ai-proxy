const express = require("express");

const app = express();
app.use(express.json());

// ─────────────────────────────
// 기본 확인용 엔드포인트
// ─────────────────────────────
app.get("/", (req, res) => {
  res.send("classspin-ai-proxy is alive");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ─────────────────────────────
// 환경 변수
// ─────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─────────────────────────────
// AI 텍스트 처리
// ─────────────────────────────
app.post("/ai/text", async (req, res) => {
  try {
    // 1️⃣ API 키 체크
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY not set",
        where: "Cloud Run environment variables",
      });
    }

    // 2️⃣ 입력값 검증
    const { prompt, mode, targetLang } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "prompt is required and must be a string",
      });
    }

    // 3️⃣ 시스템 프롬프트 결정
    let systemPrompt;
    switch (mode) {
      case "write":
        systemPrompt = "자연스럽고 잘 읽히는 글을 작성하세요.";
        break;
      case "refine":
        systemPrompt = "기존 글의 의미를 유지하면서 더 자연스럽게 다듬어주세요.";
        break;
      case "translate":
        if (!targetLang) {
          return res.status(400).json({
            error: "targetLang is required when mode is translate",
          });
        }
        systemPrompt = `다음 내용을 ${targetLang}로 번역하세요.`;
        break;
      default:
        systemPrompt = "자연스럽게 응답하세요.";
    }

    // 4️⃣ Gemini API 호출
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      "gemini-1.5-flash:generateContent?key=" +
      GEMINI_API_KEY;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
          },
        ],
      }),
    });

    const data = await response.json().catch(() => null);

    // 5️⃣ Gemini 에러 그대로 반환 (숨기지 않음)
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API error",
        status: response.status,
        geminiResponse: data,
      });
    }

    // 6️⃣ 응답 파싱
    const result =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!result) {
      return res.status(502).json({
        error: "Gemini returned empty response",
        geminiResponse: data,
      });
    }

    // 7️⃣ 정상 응답
    res.json({ result });
  } catch (err) {
    console.error("AI proxy error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err?.message,
    });
  }
});

// ─────────────────────────────
// 서버 실행 (Cloud Run 필수 패턴)
// ─────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI proxy running on port ${PORT}`);
});
