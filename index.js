const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

// ✅ デバッグログでAPIキーの読み込み確認
console.log("🔐 API KEY LOADED:", process.env.OPENAI_API_KEY ? "✅ Yes" : "❌ No");

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const reply = await askChatGPT(userText);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: reply
        });
      } catch (err) {
        console.error("ChatGPT API error:", err.response?.data || err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

async function askChatGPT(text, retryCount = 0) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "あなたはDIYやリフォームの専門家です。DIY工具、リフォームの施工方法、建材、ホームセンター商品などの質問にのみ専門的に答えてください。それ以外の質問には『その分野は専門外のためお答えできません』と返答してください。"
          },
          {
            role: "user",
            content: text
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data.choices[0].message.content.trim();
  } catch (error) {
    const status = error.response?.status;

    if (status === 429 && retryCount < 3) {
      console.warn("⏳ 429 Too Many Requests - Retrying in 2 seconds...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, retryCount + 1);
    } else {
      console.error("❌ ChatGPT API error:", status, error.response?.data || error.message);
      return "申し訳ありません。現在応答できません。";
    }
  }
}

// ✅ Render対応：環境変数PORTを使う
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
