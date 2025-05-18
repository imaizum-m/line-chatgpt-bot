// ✅ Ver.1.4 - LINE Bot + ChatGPT (DIY特化型) + Flex Message（ボタン表示）+ QuickReply動的生成 + 検索語抽出対応

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

// ✅ Amazon / Rakuten リンク作成用（検索語を受け取りURLに変換）
function createSearchLinks(keyword) {
  const encoded = encodeURIComponent(keyword);
  return {
    amazon: `https://www.amazon.co.jp/s?k=${encoded}`,
    rakuten: `https://search.rakuten.co.jp/search/mall/${encoded}/`
  };
}

// ✅ 画像なしFlex Message生成（ボタン付き）
function createFlexMessage(advice, keyword) {
  const links = createSearchLinks(keyword);
  return {
    type: "flex",
    altText: "関連商品を検索",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: advice,
            wrap: true,
          }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "Amazonで検索",
              uri: links.amazon
            },
            style: "primary"
          },
          {
            type: "button",
            action: {
              type: "uri",
              label: "楽天で検索",
              uri: links.rakuten
            },
            style: "secondary"
          }
        ]
      }
    }
  };
}

// ✅ QuickReply生成（ChatGPTの意図に応じた深掘り）
function createQuickReplyOptions(keywords) {
  const options = [
    "他におすすめは？",
    "もっと詳しく知りたい",
    "施工のコツは？",
    "成分や特徴は？"
  ];

  const items = options.map(text => ({
    type: "action",
    action: { type: "message", label: text, text },
  }));

  return { items };
}

// ✅ ChatGPTに投げて回答取得 & 検索語抽出（Ver.1.4: function型で分離）
async function askChatGPT(userText) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。...
この分野以外の質問には「専門外」と返し、Amazonや楽天の検索リンクも提供してください。回答内の推奨キーワードを1つだけ抽出して「検索キーワード: ○○」と最後に明示してください。`;

  const response = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    }
  });

  const fullText = response.data.choices[0].message.content.trim();

  // ✅ 検索キーワード抽出
  const match = fullText.match(/検索キーワード[:：]\s*(.+)/);
  const keyword = match ? match[1].trim() : userText;
  const adviceText = fullText.replace(/検索キーワード[:：]\s*.+/, "").trim();

  return { adviceText, keyword };
}

// ✅ Webhook処理（middlewareは express.json() 前に通す）
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const { adviceText, keyword } = await askChatGPT(userText);
        const flex = createFlexMessage(adviceText, keyword);
        const quick = createQuickReplyOptions(keyword);

        await client.replyMessage(event.replyToken, [
          flex,
          {
            type: "text",
            text: "他にも気になることがあればどうぞ！",
            quickReply: quick
          }
        ]);
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

// ✅ 起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
