// LINE × ChatGPT DIY特化Bot：検索キーワード抽出型（Amazon・楽天リンク対応）
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

// 環境変数読み込み確認ログ
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
        await client.replyMessage(event.replyToken, reply);
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

async function askChatGPT(userText, retryCount = 0) {
  try {
    const messages = [
      {
        role: "system",
        content: `あなたはDIYと住宅リフォームの専門家アシスタントです。
以下の質問に対して、次のフォーマットで返答してください：

1. 【アドバイス】最適な説明や使い方、施工方法などを専門的に、やさしく説明。
2. 【検索キーワード】Amazon・楽天市場で検索するのに適した単語を1つまたは2つ（例：「塗料 白」や「クロス 壁紙」）。
※検索キーワードはユーザーの意図に沿って実際の商品が探せるように工夫してください。
※不要な語尾は省き、全角スペースを使わず、半角スペースまたは+で繋いでください。
3. 【注意】DIY以外の質問には「専門外」と返してください。`
      },
      { role: "user", content: userText }
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

    const content = res.data.choices[0].message.content.trim();

    // 検索キーワード抽出
    const keywordMatch = content.match(/【検索キーワード】(.+)/);
    const keyword = keywordMatch ? keywordMatch[1].trim() : null;

    let additionalLinks = "";
    if (keyword) {
      const encoded = encodeURIComponent(keyword);
      additionalLinks = `\n\n【Amazonで検索】https://www.amazon.co.jp/s?k=${encoded}` +
                        `\n【楽天市場で検索】https://search.rakuten.co.jp/search/mall/${encoded}/`;
    }

    return {
      type: "text",
      text: content.replace(/【検索キーワード】.+/, "").trim() + additionalLinks
    };

  } catch (error) {
    const status = error.response?.status;

    if (status === 429 && retryCount < 3) {
      console.warn("⏳ 429 Too Many Requests - Retrying in 2 seconds...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(userText, retryCount + 1);
    } else {
      console.error("❌ ChatGPT API error:", status, error.response?.data || error.message);
      return {
        type: "text",
        text: "申し訳ありません。現在応答できません。"
      };
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
