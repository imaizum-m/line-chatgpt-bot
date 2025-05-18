// Ver.1.3 - LINE Bot for DIY・リフォーム特化型 ChatGPT連携

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

const SYSTEM_PROMPT = `あなたはDIYと住宅リフォームの専門家アシスタントです。
ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。

電動工具、手工具、設備交換、床・壁・天井の仕上げ材、接着剤、防水・断熱資材などの商品情報や使い方に詳しく説明してください。

回答の中で、該当商品がAmazonや楽天市場にある可能性がある場合は、必ず以下のように検索リンクを提供してください：

【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○)
【楽天市場で「○○」を検索する】(https://search.rakuten.co.jp/search/mall/○○/)

※URLは全角スペースを `+` に変えて検索キーワードとしてリンク化してください
※「DIYカテゴリのみ対象にする」とシステムプロンプトに明記
※「壁紙」と言われたら「クロス、リメイクシート」も含めるなど、プロンプト内で補足指示可能

それ以外の話題（例：料理、エンタメ、医療など）には対応せず、「この分野については専門外のためお答えできません。」と返答してください。
一般的な会話については気を害さないように回答し、なるべく専門分野へ誘導するような回答をお願いします。
冷静で親切かつ丁寧に答え、専門用語はかみ砕いて説明し、ユーザーが自分で作業できるように導いてください。`

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const replyText = await askChatGPT(userText);
        const keyword = extractKeyword(replyText);
        const encoded = encodeURIComponent(keyword.replace(/\s+/g, "+"));

        const flexMessage = {
          type: "flex",
          altText: "商品情報と検索リンク",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: replyText,
                  wrap: true,
                  size: "md"
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
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "Amazonで検索",
                    uri: `https://www.amazon.co.jp/s?k=${encoded}`
                  }
                },
                {
                  type: "button",
                  style: "primary",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "楽天市場で検索",
                    uri: `https://search.rakuten.co.jp/search/mall/${encoded}/`
                  }
                }
              ],
              flex: 0
            }
          },
          quickReply: {
            items: generateQuickReplies(replyText)
          }
        };

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

async function askChatGPT(text) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
}

function extractKeyword(text) {
  const match = text.match(/「(.+?)」を検索する/);
  return match ? match[1] : "DIY";
}

function generateQuickReplies(text) {
  const basePhrases = [
    "具体的にどれがいい？",
    "成分や特徴は？",
    "問題点と注意点は？",
    "他におすすめある？"
  ];
  return basePhrases.map(phrase => ({
    type: "action",
    action: {
      type: "message",
      label: phrase,
      text: phrase
    }
  }));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
