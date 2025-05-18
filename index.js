// Ver.1.6.1
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

// 🔧 rawBody を取得して LINE の署名検証に使用
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

// 🔍 Amazon・楽天URL生成（キーワードをエンコード）
function generateShoppingLinks(keyword) {
  const encoded = encodeURIComponent(keyword);
  return [
    {
      type: "button",
      action: {
        type: "uri",
        label: "Amazonで探す",
        uri: `https://www.amazon.co.jp/s?k=${encoded}`
      }
    },
    {
      type: "button",
      action: {
        type: "uri",
        label: "楽天市場で探す",
        uri: `https://search.rakuten.co.jp/search/mall/${encoded}/`
      }
    }
  ];
}

// 🤖 ChatGPTに質問
async function askChatGPT(userText) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。...（省略可能）`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
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
}

// 🤖 ChatGPTにQuick Reply文を作成依頼
async function generateQuickReplies(userText, replyText) {
  const prompt = `以下の回答内容に基づき、ユーザーが次に聞きたくなりそうな質問を4つ考えて、JSON形式で出力して。例：「成分や特徴は？」「もっと安い選択肢ある？」

回答内容:
${replyText}`;

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "JSON配列で返してください。" },
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    const raw = res.data.choices[0].message.content.trim();
    const quickList = JSON.parse(raw);
    return quickList.map(q => ({
      type: "action",
      action: { type: "message", label: q, text: q }
    })).slice(0, 4);
  } catch (e) {
    console.warn("QuickReply生成失敗", e.message);
    return [];
  }
}

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const userId = event.source.userId || "ユーザー";

      try {
        const replyText = await askChatGPT(userText);

        const keywordMatch = replyText.match(/(?:「|『)?([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}a-zA-Z0-9\s]{2,})(?:」|』)?/u);
        const keyword = keywordMatch ? keywordMatch[1] : userText;

        const quickReply = await generateQuickReplies(userText, replyText);
        const buttons = generateShoppingLinks(keyword);

        const message = {
          type: "flex",
          altText: "おすすめ商品を表示します",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `${userId}さん、ありがとうございます！\n${replyText}`,
                  wrap: true
                },
                ...buttons
              ]
            }
          },
          quickReply: {
            items: quickReply
          }
        };

        await client.replyMessage(event.replyToken, message);
      } catch (err) {
        console.error("❌ エラー:", err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

// ✅ ポート設定
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 Bot running on port ${PORT}`);
});
