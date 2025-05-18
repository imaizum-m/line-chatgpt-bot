// index.js
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

// ✅ Amazonリンク自動生成
function generateAmazonLink(text) {
  const keyword = encodeURIComponent(text.trim().replace(/\s+/g, "+"));
  return `https://www.amazon.co.jp/s?k=${keyword}`;
}

// ✅ DIY専用ChatGPTプロンプト
const SYSTEM_PROMPT = `あなたはDIYと住宅リフォームの専門家アシスタントです。住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。商品がAmazonにある可能性がある場合、必ず以下のように検索リンクを提供してください：\n\n【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○)\n\n全角スペースは + に変換してリンクを構成してください。対応分野外の話題には『この分野については専門外のためお答えできません。』と答えてください。`;

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      // ✅ 初回の導入メッセージ送信
      if (userText === "初めて") {
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "こんにちは。DIY・リフォームのご相談にお応えします。何をお探しですか？"
        });
        continue;
      }

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

async function askChatGPT(userMessage, retryCount = 0) {
  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ];

    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    let replyText = res.data.choices[0].message.content.trim();

    // ✅ Amazonリンク自動追加（必要時）
    if (/塗料|工具|壁紙|クロス|接着剤|断熱|電動工具|棚|床材|天井/.test(userMessage)) {
      const amazonLink = generateAmazonLink(userMessage);
      replyText += `\n\n【Amazonで「${userMessage}」を検索する】(${amazonLink})`;
    }

    return replyText;
  } catch (error) {
    const status = error.response?.status;
    if (status === 429 && retryCount < 3) {
      console.warn("⏳ 429 Too Many Requests - Retrying in 2 seconds...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(userMessage, retryCount + 1);
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
