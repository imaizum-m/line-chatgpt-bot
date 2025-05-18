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
        const replyText = await askChatGPT(userText);
        const keyword = extractKeyword(replyText || userText);
        const amazonUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}`;
        const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}`;

        const message = {
          type: "flex",
          altText: "検索結果と情報をお届けします",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                {
                  type: "text",
                  text: replyText,
                  wrap: true,
                  size: "md"
                },
                {
                  type: "separator",
                  margin: "md"
                },
                {
                  type: "text",
                  text: "🔍 関連商品を検索",
                  size: "sm",
                  weight: "bold",
                  margin: "md"
                },
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "md",
                  margin: "sm",
                  contents: [
                    {
                      type: "button",
                      style: "link",
                      height: "sm",
                      action: {
                        type: "uri",
                        label: "Amazonで探す",
                        uri: amazonUrl
                      }
                    },
                    {
                      type: "button",
                      style: "link",
                      height: "sm",
                      action: {
                        type: "uri",
                        label: "楽天市場で探す",
                        uri: rakutenUrl
                      }
                    }
                  ]
                }
              ]
            }
          },
          quickReply: {
            items: generateQuickReplyButtons(replyText)
          }
        };

        await client.replyMessage(event.replyToken, message);
      } catch (err) {
        console.error("❌ ChatGPT API error:", err.response?.data || err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

async function askChatGPT(userInput) {
  const systemPrompt = `
あなたはDIYと住宅リフォームの専門家アシスタントです。
ユーザーの質問には住宅改修、工具、塗料、建材、施工方法などに関する知識をもとに実用的な回答をしてください。
関連する場合、Amazonと楽天市場への検索リンクも案内してください。
それ以外の話題は「この分野については専門外のためお答えできません」と返答し、なるべく専門分野に誘導してください。
`;

  const response = await axios.post(
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

  return response.data.choices[0].message.content.trim();
}

function extractKeyword(text) {
  const match = text.match(/「(.+?)」|『(.+?)』|【(.+?)】/);
  return match ? match[1] || match[2] || match[3] : text.replace(/[^\p{L}\p{N} ]/gu, "").split(" ")[0];
}

function generateQuickReplyButtons(content) {
  const suggestions = [];

  if (/塗料|壁紙|工具|断熱|接着剤/.test(content)) {
    suggestions.push("具体的にどれがいい？", "成分や特徴は？", "問題点と注意点は？");
  } else if (/交換|張替/.test(content)) {
    suggestions.push("作業手順を教えて", "必要な道具は？", "業者に頼むと？");
  } else {
    suggestions.push("他におすすめある？", "もっと詳しく知りたい", "DIY初心者でもできる？");
  }

  return suggestions.map(label => ({
    type: "action",
    action: {
      type: "message",
      label,
      text: label
    }
  }));
}

// ✅ Render対応：環境変数PORTを使う
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔧 LINE Bot running on port ${PORT}`);
});
