const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("classpin-ai-proxy is alive"));
app.get("/health", (req, res) => res.json({ ok: true }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post("/ai/text", async (req, res) => {
  try {
    const { prompt, mode, targetLang } = req.body;

    let systemPrompt = "";
    switch (mode) {
      case "write":
        systemPrompt = "자연스럽고 잘 읽히는 글을 작성하세요.";
        break;
      case "refine":
        systemPrompt = "기존 글의 의미를 유지하면서 더 자연스럽게 다듬어주세요.";
        break;
      case "translate":
        systemPrompt = `다음 내용을 ${targetLang}로 번역하세요.`;
        break;
      default:
        systemPrompt = "자연스럽게 응답하세요.";
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }
          ]
        }),
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.json({ result: text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI 처리 중 오류" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI proxy running on ${PORT}`);
});
