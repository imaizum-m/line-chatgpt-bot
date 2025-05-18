// 📌 Ver.1.6 - ユーザー名への共感・感謝表現を追加した安定版

const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

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
      const userId = event.source.userId;

      try {
        const profile = await client.getProfile(userId);
        const displayName = profile.displayName;
        const keyword = extractKeyword(userText);
        const chatResponse = await askChatGPT(userText, displayName);

        const replyMessages = [
          {
            type: "flex",
            altText: "商品リンクのご案内",
            contents: {
              type: "bubble",
              body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
                  {
                    type: "text",
                    text: chatResponse,
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
                    style: "link",
                    height: "sm",
                    action: {
                      type: "uri",
                      label: "Amazonで検索",
                      uri: `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}`
                    }
                  },
                  {
                    type: "button",
                    style: "link",
                    height: "sm",
                    action: {
                      type: "uri",
                      label: "楽天市場で検索",
                      uri: `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}`
                    }
                  }
                ]
              }
            }
          },
          {
            type: "text",
            text: "他にも気になることがあれば教えてくださいね。",
            quickReply: {
              items: generateQuickReplies(chatResponse)
            }
          }
        ];

        await client.replyMessage(event.replyToken, replyMessages);
      } catch (err) {
        console.error("❌ Error:", err.response?.data || err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

function extractKeyword(text) {
  const keywords = ["塗料", "壁紙", "クロス", "リメイクシート", "工具", "電動工具", "手工具", "接着剤", "断熱", "防水", "木材"];
  for (const word of keywords) {
    if (text.includes(word)) return word;
  }
  return text;
}

function generateQuickReplies(responseText) {
  const suggestions = [
    "どれがおすすめ？",
    "価格帯は？",
    "成分や特徴は？",
    "施工方法を教えて",
    "必要な道具は？",
    "初心者でも使える？",
    "耐久性はどう？",
    "使用上の注意は？",
    "他に選択肢ある？",
    "代替品は？"
  ];

  const items = suggestions.slice(0, 4).map(text => ({
    type: "action",
    action: {
      type: "message",
      label: text,
      text: text
    }
  }));

  return items;
}

async function askChatGPT(userText, displayName) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。\n\nユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。\n\n電動工具、手工具、設備交換、床・壁・天井の仕上げ材、接着剤、防水・断熱資材などの商品情報や使い方に詳しく説明してください。\n\nそれ以外の話題（例：料理、医療、エンタメ）には対応せず、「この分野については専門外のためお答えできません。」と返答してください。`; 

  const userPrompt = `${displayName}さん、ありがとうございます。ご質問「${userText}」について、以下の通りお答えします。`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);
});
