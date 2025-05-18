const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

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
        const amazonUrl = generateAmazonSearchUrl(userText);
        const flexMessage = generateFlexMessage(
          "DIY情報と関連商品",
          reply,
          "Amazonで検索",
          "https://upload.wikimedia.org/wikipedia/commons/4/4a/Amazon_icon.svg",
          amazonUrl
        );

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
  const systemPrompt = `
あなたはDIYと住宅リフォームの専門家アシスタントです。
ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。
それ以外の話題（料理、医療など）には「この分野については専門外のためお答えできません。」と返答し、専門領域に戻すようにしてください。
  `.trim();

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
    if (error.response?.status === 429 && retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, retryCount + 1);
    }
    return "申し訳ありません。現在応答できません。";
  }
}

function generateAmazonSearchUrl(keyword) {
  const query = encodeURIComponent(keyword.trim().replace(/\s+/g, '+'));
  return `https://www.amazon.co.jp/s?k=${query}`;
}

function generateFlexMessage(title, bodyText, buttonText, imageUrl, url) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "md",
            wrap: true
          },
          {
            type: "text",
            text: bodyText,
            size: "sm",
            wrap: true
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
            style: "primary",
            action: {
              type: "uri",
              label: buttonText,
              uri: url
            }
          }
        ]
      }
    }
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
