// Ver.1.6.3 - 安定動作ベースに署名検証修正＋Quick Reply改良

const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

app.post("/webhook", middleware({
  ...config,
  getRawBody: (req) => req.rawBody
}), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const userId = event.source.userId;

      try {
        const nameRes = await client.getProfile(userId);
        const displayName = nameRes.displayName;

        const replyText = await askChatGPT(userText, displayName);
        const keywords = extractSearchKeywords(replyText);
        const buttons = createFlexMessageButtons(keywords);
        const quickReplies = generateQuickReplies(replyText);

        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "商品候補を表示します",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: replyText,
                  wrap: true,
                  size: "md"
                },
                ...buttons
              ]
            }
          },
          quickReply: {
            items: quickReplies
          }
        });

      } catch (err) {
        console.error("❌ Error:", err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }
  res.sendStatus(200);
});

function extractSearchKeywords(reply) {
  const matches = reply.match(/\u300c(.+?)\u300d/);
  return matches ? matches[1] : "DIY 用具";
}

function createFlexMessageButtons(keyword) {
  const encoded = encodeURIComponent(keyword);
  return [
    {
      type: "button",
      style: "link",
      action: {
        type: "uri",
        label: "Amazonで探す",
        uri: `https://www.amazon.co.jp/s?k=${encoded}`
      }
    },
    {
      type: "button",
      style: "link",
      action: {
        type: "uri",
        label: "楽天市場で探す",
        uri: `https://search.rakuten.co.jp/search/mall/${encoded}`
      }
    }
  ];
}

function generateQuickReplies(replyText) {
  const suggestions = [
    "さらに詳しく知りたい",
    "使い方を教えて",
    "オススメの商品は？",
    "価格帯は？",
    "成分や特徴は？",
    "どのメーカーが良い？",
    "初心者におすすめは？",
    "プロ仕様との違いは？",
    "安全性は？",
    "どんな場面で使える？"
  ];
  return suggestions.slice(0, 4).map(s => ({
    type: "action",
    action: {
      type: "message",
      label: s,
      text: s
    }
  }));
}

async function askChatGPT(userText, displayName) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。...
※この分野以外の話題には「専門外のためお答えできません」と返してください。`;
  const res = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ]
  }, {
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
  return `${displayName}さん、ありがとうございます。\n${res.data.choices[0].message.content.trim()}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);
});
