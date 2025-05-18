// LINE Flex Message（画像なし）でAmazon検索結果を返信するNode.jsコード（完全版）

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

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const reply = await askChatGPT(userText);
        const flexMessage = createFlexMessage(userText, reply);

        await client.replyMessage(event.replyToken, flexMessage);
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
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。\n\nユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。\n\n該当商品がAmazonにある可能性がある場合は必ず以下のようにAmazon検索リンクを提供してください：\n\n【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○)\n\nそれ以外の話題には対応せず、「この分野については専門外のためお答えできません。」と返答してください。`;

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
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
      console.warn("⏳ 429 Too Many Requests - Retrying...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, retryCount + 1);
    } else {
      console.error("❌ ChatGPT API error:", status, error.response?.data || error.message);
      return "申し訳ありません。現在応答できません。";
    }
  }
}

function createFlexMessage(keyword, replyText) {
  const encodedKeyword = encodeURIComponent(keyword.replace(/\s+/g, "+"));
  const amazonUrl = `https://www.amazon.co.jp/s?k=${encodedKeyword}`;

  return {
    type: "flex",
    altText: "検索結果です",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${keyword} の検索結果`,
            weight: "bold",
            size: "md",
            wrap: true
          },
          {
            type: "text",
            text: replyText,
            wrap: true,
            size: "sm",
            margin: "md"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "Amazonで検索",
              uri: amazonUrl
            },
            style: "primary"
          }
        ],
        flex: 0
      }
    }
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
