const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();
const crypto = require("crypto");

const app = express();

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

// ✅ rawBodyを取得するためのbodyParser
app.use(
  express.raw({
    type: "*/*",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

// ✅ LINE webhookエンドポイント
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const replyText = await askChatGPT(userText);
        const quickReplies = await generateQuickReplies(replyText);

        const amazonUrl = makeAmazonUrl(userText);
        const rakutenUrl = makeRakutenUrl(userText);

        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "商品リンクのご案内",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: replyText, wrap: true, size: "md" }
              ]
            },
            footer: {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "Amazonで検索",
                    uri: amazonUrl
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "楽天で検索",
                    uri: rakutenUrl
                  }
                }
              ],
              flex: 0
            }
          },
          quickReply: {
            items: quickReplies
          }
        });
      } catch (err) {
        console.error("❌ ChatGPT API error:", err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません、現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

function makeAmazonUrl(text) {
  const keyword = extractKeyword(text);
  const encoded = encodeURIComponent(keyword);
  return `https://www.amazon.co.jp/s?k=${encoded}`;
}

function makeRakutenUrl(text) {
  const keyword = extractKeyword(text);
  const encoded = encodeURIComponent(keyword);
  return `https://search.rakuten.co.jp/search/mall/${encoded}`;
}

// ✅ キーワード抽出ロジック（現時点ではそのまま）※改良余地あり
function extractKeyword(text) {
  return text.replace(/\s+/g, "+").trim();
}

async function askChatGPT(userText) {
  const messages = [
    {
      role: "system",
      content: `あなたはDIYと住宅リフォームの専門家アシスタントです。
質問には、改修、工具、塗料、建材、施工方法などに関する実用的な知識で答え、
他分野の話題には「専門外」として応答してください。
また該当商品がありそうな場合は「Amazon」「楽天市場」への検索誘導を促してください。`
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

  return res.data.choices[0].message.content.trim();
}

// ✅ 応答に基づいてQuick Replyを動的生成
async function generateQuickReplies(replyText) {
  const prompt = `以下の応答内容に基づいて、ユーザーが次に知りたくなるような質問を10個作ってください。
そのうち特に重要・一般的なものを4つ選んで短く端的な文言にしてください。箇条書き形式で。
回答: """${replyText}"""`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const lines = res.data.choices[0].message.content
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 4); // 上位4つ

  return lines.map((line) => ({
    type: "action",
    action: {
      type: "message",
      label: line.replace(/^\d+\.\s*/, "").slice(0, 20),
      text: line.replace(/^\d+\.\s*/, "")
    }
  }));
}

// ✅ ポート起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
