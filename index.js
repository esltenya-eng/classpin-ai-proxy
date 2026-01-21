// fetch import 필요 없음 (Node 18+ 내장)

const express = require("express");

const app = express();
const ALLOWED_ORIGINS = [
  "https://classpin-folder-based-classroom-board-1070949888094.us-west1.run.app",
  "https://classpin-ai-proxy-1070949888094.us-west1.run.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // 허용된 origin만 반사(reflect)
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");

  // preflight(OPTIONS) 즉시 통과
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  next();
});

app.use(express.json());

// 배포 확인용(무조건 뜨면 성공)
app.get("/", (req, res) => {
  res
    .status(200)
    .set("Content-Type", "text/plain; charset=utf-8")
    .send("classpin-ai-proxy is alive ✅ (root route working)");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "classpin-ai-proxy",
    hasKey: !!process.env.GEMINI_API_KEY,
  });
});

// ★ 이게 핵심: 어떤 경로로 GET을 치든, 배포 확인 문자열이 나오게

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post("/ai/text", async (req, res) => {
  try {
    const { prompt, mode, targetLang } = req.body || {};

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not set" });
    }
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    let systemPrompt = "";
    switch (mode) {
      case "write":
        systemPrompt = "자연스럽고 잘 읽히는 글을 작성하세요.";
        break;
      case "refine":
        systemPrompt = "기존 글의 의미를 유지하면서 더 자연스럽게 다듬어주세요.";
        break;
      case "translate":
        systemPrompt = `다음 내용을 ${targetLang || "한국어"}로 번역하세요.`;
        break;
      default:
        systemPrompt = "자연스럽게 응답하세요.";
    }

    // Node 20은 fetch 내장
    const response = await fetch(
     `https://generativelanguage.googleapis.com/v1/models/gemini-exp-1206:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\n${prompt}` }] },
          ],
        }),
      }
    );

    const data = await response.json();

    // Gemini 에러도 그대로 보여주게(디버깅용)
    if (!response.ok) {
      return res.status(response.status).json({ error: "Gemini error", data });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.json({ result: text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "AI 처리 중 오류", detail: String(e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI proxy running on ${PORT}`);
});

app.get("/ai/models", async (req, res) => {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
