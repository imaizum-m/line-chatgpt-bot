// Ver.1.4 - LINE ChatGPT Bot with dynamic Quick Reply and keyword contextualization

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
app.use(express.json());

// ユーザーの直前の発言を簡易的に保存するメモリ（簡易版）
const userContext = {}; // userId => lastMessage

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const userText = event.message.text;
      const previousText = userContext[userId] || "";

      try {
        const replyData = await askChatGPT(userText, previousText);
        userContext[userId] = userText;

        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "回答があります",
          contents: buildFlexMessage(replyData)
        });
      } catch (err) {
        console.error("❌ ChatGPT error:", err);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }
  res.sendStatus(200);
});

function buildFlexMessage({ answer, keyword, quickReplies }) {
  const amazonUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}`;
  const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}/`;

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "回答", weight: "bold", size: "md", margin: "none" },
        { type: "text", text: answer, wrap: true, margin: "md" }
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
          action: { type: "uri", label: "Amazonで検索", uri: amazonUrl }
        },
        {
          type: "button",
          style: "link",
          action: { type: "uri", label: "楽天市場で検索", uri: rakutenUrl }
        }
      ]
    },
    quickReply: {
      items: quickReplies.slice(0, 3).map(q => ({
        type: "action",
        action: {
          type: "message",
          label: q,
          text: q
        }
      }))
    }
  };
}

async function askChatGPT(currentText, previousText) {
  const messages = [
    {
      role: "system",
      content: `あなたはDIYと住宅リフォームの専門家アシスタントです。対象はDIYカテゴリのみです。以下を守ってください：\n\n- 回答には、商品用途・使い方・施工方法をわかりやすく丁寧に説明してください\n- 回答に関連する商品キーワードを1つだけ抽出し、それをAmazon/Rakuten検索URLに使用\n- 回答のあと、ユーザーが次に聞きたくなる質問を2～3個、Quick Reply形式で提案してください\n- 他ジャンルの質問には「専門外」として断るが、なるべくDIY方向に誘導\n- 専門用語はかみ砕いて説明し、ユーザーが自分で判断・作業できるよう導いてください`
    },
    previousText && { role: "user", content: previousText },
    { role: "user", content: currentText }
  ].filter(Boolean);

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4",
      messages,
      functions: [
        {
          name: "format_reply",
          description: "回答本文、検索キーワード、Quick Reply提案を返します",
          parameters: {
            type: "object",
            properties: {
              answer: { type: "string" },
              keyword: { type: "string" },
              quickReplies: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["answer", "keyword", "quickReplies"]
          }
        }
      ],
      function_call: { name: "format_reply" }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const args = JSON.parse(res.data.choices[0].message.function_call.arguments);
  return args;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Ver.1.4 bot is running on port ${PORT}`);
});
