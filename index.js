const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

// デバッグログでAPIキー確認
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

function generateSearchLinks(keyword) {
  const encoded = encodeURIComponent(keyword.replace(/\s+/g, "+"));
  return {
    amazon: `https://www.amazon.co.jp/s?k=${encoded}`,
    rakuten: `https://search.rakuten.co.jp/search/mall/${encoded}`
  };
}

function createFlexMessage(keyword, replyText) {
  const links = generateSearchLinks(keyword);
  return {
    type: "flex",
    altText: "DIYアドバイスと商品検索リンク",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🛠 DIY・リフォーム アドバイス",
            weight: "bold",
            size: "md",
            margin: "none"
          },
          {
            type: "text",
            text: replyText,
            wrap: true,
            margin: "md",
            size: "sm"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "Amazonで探す",
              uri: links.amazon
            }
          },
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "楽天市場で探す",
              uri: links.rakuten
            }
          }
        ],
        flex: 0
      }
    }
  };
}

async function askChatGPT(userInput, retryCount = 0) {
  const systemPrompt = `
あなたはDIYと住宅リフォームの専門家アシスタントです。
住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、
正確で実用的な回答を行ってください。説明は丁寧に、実践的で親切にお願いします。

ただし、料理、エンタメ、医療などDIY以外の話題には
「この分野については専門外のためお答えできません。」と答えてください。
`;

  try {
    const openaiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return openaiRes.data.choices[0].message.content.trim();
  } catch (error) {
    const status = error.response?.status;

    if (status === 429 && retryCount < 3) {
      console.warn("⏳ 429 Too Many Requests - Retrying...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(userInput, retryCount + 1);
    } else {
      console.error("❌ ChatGPT API error:", status, error.response?.data || error.message);
      return "申し訳ありません。現在応答できません。";
    }
  }
}

// Render対応：環境変数PORT使用
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ LINE Bot running on port ${PORT}`);
});
