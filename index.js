// index.js
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};

const client = new Client(config);

// 確認用ログ
console.log("🔐 API KEY LOADED:", process.env.OPENAI_API_KEY ? "✅ Yes" : "❌ No");

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      try {
        const replyText = await askChatGPT(userText);
        const imageUrl = getImageUrl(userText);

        const flexMessage = {
          type: "flex",
          altText: "検索結果を表示します",
          contents: {
            type: "bubble",
            hero: {
              type: "image",
              url: imageUrl,
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover",
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: replyText,
                  wrap: true,
                },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "link",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "Amazonで検索",
                    uri: `https://www.amazon.co.jp/s?k=${encodeURIComponent(userText.replace(/\s+/g, '+'))}`,
                  },
                },
              ],
              flex: 0,
            },
          },
        };

        await client.replyMessage(event.replyToken, flexMessage);
      } catch (err) {
        console.error("ChatGPT API error:", err.response?.data || err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。",
        });
      }
    }
  }

  res.sendStatus(200);
});

function getImageUrl(keyword) {
  const map = {
    "塗料": "https://upload.wikimedia.org/wikipedia/commons/3/35/Painting_tools.jpg",
    "工具": "https://upload.wikimedia.org/wikipedia/commons/0/00/Tools.jpg",
    "壁紙": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Wallpaper_pattern.jpg",
    "接着剤": "https://upload.wikimedia.org/wikipedia/commons/f/fa/Adhesive_glue.jpg",
    "防水": "https://upload.wikimedia.org/wikipedia/commons/6/65/Waterproofing.jpg",
    "断熱": "https://upload.wikimedia.org/wikipedia/commons/4/42/Insulation_materials.jpg",
    "木材": "https://upload.wikimedia.org/wikipedia/commons/f/f6/Wood_planks.jpg",
    "クロス": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Wallpaper_rolls.jpg"
  };
  return map[keyword] || "https://upload.wikimedia.org/wikipedia/commons/0/00/Tools.jpg";
}

async function askChatGPT(text, retryCount = 0) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。電動工具、手工具、設備交換、床・壁・天井の仕上げ材、接着剤、防水・断熱資材などの商品情報や使い方に詳しく説明してください。Amazonに該当商品がある可能性がある場合は、【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○) の形式で案内してください。対応外のジャンルには「この分野については専門外のためお答えできません。」と返答してください。`;
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data.choices[0].message.content.trim();
  } catch (error) {
    if (error.response?.status === 429 && retryCount < 3) {
      console.warn("⏳ 429 Too Many Requests - Retrying in 2 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return askChatGPT(text, retryCount + 1);
    } else {
      console.error("❌ ChatGPT API error:", error.response?.data || error.message);
      return "申し訳ありません。現在応答できません。";
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
