// 📦 必要なモジュールの読み込み
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

// 🔧 rawBodyを保持するミドルウェア（LINE署名検証用）
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ✅ LINE BOT設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

// 🔁 LINE Webhook受信
app.post("/webhook", (req, res, next) => {
  middleware(config)(req, res, next);
}, async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const userId = event.source.userId;
      let userName = "あなた";

      try {
        // ✅ ユーザー名取得（エラー時は無視）
        const profile = await client.getProfile(userId);
        userName = profile.displayName || userName;
      } catch (e) {}

      try {
        const gptResponse = await askChatGPT(userText);
        const searchKeyword = extractKeyword(gptResponse);
        const amazonUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(searchKeyword)}`;
        const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(searchKeyword)}/`;

        const quickReplies = generateQuickReplies(gptResponse);

        // ✅ Flex Message形式で送信（ボタン付き）
        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "おすすめ商品リンク",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: `${userName}さん、${gptResponse}`, wrap: true },
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "md",
                  contents: [
                    {
                      type: "button",
                      style: "primary",
                      height: "sm",
                      action: {
                        type: "uri",
                        label: "Amazonで検索",
                        uri: amazonUrl
                      }
                    },
                    {
                      type: "button",
                      style: "secondary",
                      height: "sm",
                      action: {
                        type: "uri",
                        label: "楽天で検索",
                        uri: rakutenUrl
                      }
                    }
                  ]
                }
              ]
            }
          },
          quickReply: {
            items: quickReplies
          }
        });
      } catch (err) {
        console.error("❌ ChatGPT API error:", err);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }
  res.sendStatus(200);
});

// 🔧 ChatGPT API呼び出し
async function askChatGPT(text) {
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。\n質問には正確で実用的に、かつ商品検索用リンクも示してください。その他ジャンルの質問には「専門外です」と返してください。`;

  const res = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    }
  });

  return res.data.choices[0].message.content.trim();
}

// 🔍 キーワード抽出関数（最もシンプルな方法）
function extractKeyword(text) {
  const candidates = ["塗料", "壁紙", "工具", "接着剤", "木材", "クロス", "断熱", "防水"];
  for (const word of candidates) {
    if (text.includes(word)) return word;
  }
  return text.split("\n")[0].slice(0, 20); // fallback
}

// 🧠 Quick Reply生成
function generateQuickReplies(responseText) {
  const examples = [
    "他の選択肢もありますか？",
    "成分や特徴を詳しく教えて",
    "施工方法は？",
    "初心者でも使える？",
    "おすすめの組み合わせは？",
    "必要な道具は？",
    "価格帯の目安は？",
    "注意点は？",
    "プロ用との違いは？",
    "どこで買える？"
  ];
  const picks = examples.sort(() => 0.5 - Math.random()).slice(0, 4);
  return picks.map(msg => ({
    type: "action",
    action: {
      type: "message",
      label: msg,
      text: msg
    }
  }));
}

// 🚀 ポート起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
