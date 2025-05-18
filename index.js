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
        const amazonUrl = generateAmazonLink(userText);

        const fullReply = `${reply}

【Amazonで「${userText}」を検索する】(${amazonUrl})`;

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: fullReply.length > 2000 ? fullReply.slice(0, 1990) + '...（省略）' : fullReply
        });
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
関連商品がAmazonにある可能性がある場合は、次の形式でリンクを案内してください：
【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○)。
他ジャンルの話題には「この分野については専門外のためお答えできません。」と返答してください。
`; 

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
    } else {
      return "申し訳ありません。現在応答できません。";
    }
  }
}

function generateAmazonLink(keyword) {
  const encoded = encodeURIComponent(keyword.replace(/\s+/g, "+"));
  return `https://www.amazon.co.jp/s?k=${encoded}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);
});
