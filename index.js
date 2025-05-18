const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

console.log("🔐 API KEY LOADED:", process.env.OPENAI_API_KEY ? "✅ Yes" : "❌ No");

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

// Webhook受信処理
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      const isFirstMessage = event.replyToken && event.replyToken.match(/^[0-9a-f]{32}$/); // 最初のメッセージと仮定

      try {
        const reply = await askChatGPT(userText, isFirstMessage);
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

// ChatGPT呼び出し関数
async function askChatGPT(text, isFirstMessage = false, retryCount = 0) {
  try {
    const systemPrompt = `
あなたはDIYと住宅リフォームの専門家アシスタントです。
ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。
電動工具、手工具、設備交換、床・壁・天井の仕上げ材、接着剤、防水・断熱資材などの商品情報や使い方に詳しく説明してください。

回答の中で、該当商品がAmazonにある可能性がある場合は、必ず以下のようにAmazon検索へのリンクを提供してください：
【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○)
※スペースは + に変換して使用してください。

それ以外の話題（例：料理、エンタメ、医療など）には対応せず、「この分野については専門外のためお答えできません。」と返答してください。
一般的な会話には親切に対応しつつ、DIYカテゴリへ誘導してください。
    `.trim();

    const initialGreeting = isFirstMessage
      ? "こんにちは！DIY・住宅リフォーム専用のアシスタントです。工具や施工方法、塗料など、何でも聞いてくださいね！"
      : null;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(initialGreeting ? [{ role: "assistant", content: initialGreeting }] : []),
      { role: "user", content: text }
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

    return res.data.choices[0].message.content.trim();
  } catch (error) {
    const status = error.response?.status;

    if (status === 429 && retryCount < 3) {
      console.warn("⏳ 429 Too Many Requests - Retrying in 2 seconds...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, isFirstMessage, retryCount + 1);
    } else {
      console.error("❌ ChatGPT API error:", status, error.response?.data || error.message);
      return "申し訳ありません。現在応答できません。";
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
