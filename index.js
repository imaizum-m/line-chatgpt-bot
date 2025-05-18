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

// ✅ サーバ起動ログ
console.log("🔐 API KEY LOADED:", process.env.OPENAI_API_KEY ? "✅ Yes" : "❌ No");

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const { replyText, searchKeywords, quickReplies } = await askChatGPT(userText);

        // 検索リンク作成
        const encoded = encodeURIComponent(searchKeywords.join(" "));
        const amazonUrl = `https://www.amazon.co.jp/s?k=${encoded}`;
        const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${encoded}`;

        // Flex Message構築（画像なし）
        const flexMessage = {
          type: "flex",
          altText: "関連商品リンク",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "関連商品を検索できます：",
                  wrap: true,
                  weight: "bold",
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
                  style: "primary",
                  action: {
                    type: "uri",
                    label: "Amazonで検索",
                    uri: amazonUrl
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "uri",
                    label: "楽天市場で検索",
                    uri: rakutenUrl
                  }
                }
              ]
            }
          }
        };

        // 返信
        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "商品検索リンク",
          contents: flexMessage.contents,
          quickReply: {
            items: quickReplies.map(text => ({
              type: "action",
              action: {
                type: "message",
                label: text,
                text: text
              }
            }))
          }
        });

        // メッセージも送る（案内文付き）
        await client.pushMessage(event.source.userId, {
          type: "text",
          text: replyText
        });

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

async function askChatGPT(userText, retryCount = 0) {
  const systemPrompt = `
あなたはDIYと住宅リフォームの専門家アシスタントです。
電動工具、塗料、建材、施工、接着剤などの使い方や選び方を専門的かつ丁寧に説明してください。
回答内で関連商品がある場合は検索用キーワードも示してください。
対象カテゴリー以外の質問（例：エンタメ、料理）は「専門外です」と回答してください。
`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const rawReply = response.data.choices[0].message.content.trim();

  // ✅ 検索キーワード抽出（簡易ルール or fallback）
  const match = rawReply.match(/(?:「(.+?)」|『(.+?)』|【(.+?)】)/);
  const searchKeywords = match ? [match[1] || match[2] || match[3]] : [userText];

  // ✅ QuickReply候補
  const quickReplies = [
    "もっと詳しく教えて",
    "おすすめはどれ？",
    "使い方は？",
    "必要な道具は？"
  ];

  // ✅ 感謝や共感の導入文を追加
  const replyText = `ありがとうございます！こちらが参考になるかと思います：\n\n${rawReply}`;

  return { replyText, searchKeywords, quickReplies };
}

// ✅ PORT設定（Render対応）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 LINE Bot running on port ${PORT}`);
});
