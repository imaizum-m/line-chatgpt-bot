// LINE Bot with OpenAI integration (Ver.1.6.1 - based on Ver.1.5.1)
// - Stable base maintained
// - Enhanced Quick Reply with dynamic keyword extraction for product search buttons

const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};

const client = new Client(config);

// ✅ Logging loaded API key (only for dev check)
console.log("🔐 OPENAI KEY LOADED:", process.env.OPENAI_API_KEY ? "✅" : "❌");

// Utility to extract keyword from OpenAI response for search links
function extractSearchKeyword(text) {
  const match = text.match(/\u300c(.+?)\u300d|"(.+?)"|\[(.+?)\]/);
  return match ? (match[1] || match[2] || match[3]) : null;
}

// Generate Amazon/Rakuten links from keywords
function generateSearchLinks(keyword) {
  if (!keyword) return [];
  const encoded = encodeURIComponent(keyword.replace(/\s+/g, "+"));
  return [
    {
      type: "uri",
      label: "Amazonで検索",
      uri: `https://www.amazon.co.jp/s?k=${encoded}`,
    },
    {
      type: "uri",
      label: "楽天市場で検索",
      uri: `https://search.rakuten.co.jp/search/mall/${encoded}`,
    },
  ];
}

// Create Quick Reply buttons from ChatGPT suggestion
function generateQuickReplies(choices) {
  return {
    items: choices.slice(0, 4).map((label) => ({
      type: "action",
      action: {
        type: "message",
        label,
        text: label,
      },
    })),
  };
}

// Ask OpenAI and process response
async function askChatGPT(userName, userText) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門アシスタントです。会話は親切かつ冷静に。専門外の話題には対応せず、専門分野へ誘導してください。商品名や用途に応じてAmazon・楽天検索リンクを案内してください。`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const replyContent = res.data.choices[0].message.content.trim();
  const keyword = extractSearchKeyword(replyContent) || userText;
  const links = generateSearchLinks(keyword);

  // Suggest related prompts based on original question
  const suggestionPrompt = `「${userText}」という質問に答えた後、より深掘りできる質問を4件、日本語で短く教えてください。`;
  const sugRes = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: suggestionPrompt },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const suggestions = sugRes.data.choices[0].message.content
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((line) => line);

  return {
    message: `${userName}さん、ありがとうございます。以下の情報をご覧ください：\n\n${replyContent}`,
    links,
    quickReplies: suggestions,
  };
}

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const userId = event.source.userId;
      let userName = "お客様";

      try {
        const profile = await client.getProfile(userId);
        if (profile.displayName) userName = profile.displayName;
      } catch (e) {
        console.warn("ユーザー名取得エラー:", e.message);
      }

      try {
        const { message, links, quickReplies } = await askChatGPT(userName, userText);

        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "回答メッセージ",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: message,
                  wrap: true,
                  size: "sm",
                },
              ],
            },
            footer: {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: links.map((btn) => ({
                type: "button",
                style: "primary",
                height: "sm",
                action: btn,
              })),
              flex: 0,
            },
          },
          quickReply: generateQuickReplies(quickReplies),
        });
      } catch (err) {
        console.error("ChatGPT APIエラー:", err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。しばらくして再度お試しください。",
        });
      }
    }
  }
  res.sendStatus(200);
});

// Port binding for Render.com or localhost
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
