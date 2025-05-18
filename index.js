// 📦 必要なモジュールを読み込み
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

// 🔐 LINE設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};
const client = new Client(config);

// 🔁 Webhookエンドポイント
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const replyToken = event.replyToken;

      try {
        const mainReply = await getChatGPTResponse(userText);
        const quickReplies = await getQuickReplySuggestions(mainReply);
        const flexMessage = createFlexMessage(mainReply, userText);

        await client.replyMessage(replyToken, {
          type: "flex",
          altText: "検索結果と回答です",
          contents: flexMessage,
          quickReply: {
            items: quickReplies
          }
        });
      } catch (err) {
        console.error("❌ Error:", err.message);
        await client.replyMessage(replyToken, {
          type: "text",
          text: "現在応答できません。しばらくしてからもう一度お試しください。"
        });
      }
    }
  }
  res.sendStatus(200);
});

// 🎯 ChatGPTメイン応答取得
async function getChatGPTResponse(userText) {
  const messages = [
    {
      role: "system",
      content:
        "あなたはDIYと住宅リフォームの専門家アシスタントです。回答の中で、該当商品がAmazonや楽天市場にある可能性がある場合は必ず検索リンクを提供してください。"
    },
    { role: "user", content: userText }
  ];

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4",
      messages,
      temperature: 0.7
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

// 💬 Quick Reply動的生成
async function getQuickReplySuggestions(mainText) {
  const prompt = `以下の応答内容に対して、ユーザーがさらに深堀りしたくなるような具体的な質問例を10個挙げてください。

"""
${mainText}
"""

回答はJSON配列で、短い日本語の質問形式でお願いします。`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4",
      messages: [
        { role: "system", content: "ユーザーの質問に関連する深掘り質問を提案するアシスタントです。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.5
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const suggestions = JSON.parse(res.data.choices[0].message.content);
  const selected = suggestions.slice(0, 4);
  return selected.map(s => ({
    type: "action",
    action: {
      type: "message",
      label: s,
      text: s
    }
  }));
}

// 🛒 Flex Message生成（画像なし）
function createFlexMessage(answerText, userText) {
  const encoded = encodeURIComponent(userText.replace(/\s+/g, "+"));
  const amazonUrl = `https://www.amazon.co.jp/s?k=${encoded}`;
  const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${encoded}`;

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: answerText,
          wrap: true,
          size: "md"
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
            label: "Amazonで検索",
            uri: amazonUrl
          }
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: "楽天市場で検索",
            uri: rakutenUrl
          }
        }
      ]
    }
  };
}

// 🚀 ポート起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ LINE Bot running on port ${PORT}`);
});
