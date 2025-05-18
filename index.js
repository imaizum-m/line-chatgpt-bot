// LINE × ChatGPT × DIY Bot（Flex Message使用・サムネイルなし）

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
        const gptReply = await askChatGPT(userText);
        const keyword = extractKeywordForSearch(gptReply);
        const encoded = encodeURIComponent(keyword);

        const amazonUrl = `https://www.amazon.co.jp/s?k=${encoded}`;
        const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${encoded}/`;

        const message = {
          type: "flex",
          altText: "検索結果のご案内",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "🔧 DIYアドバイス",
                  weight: "bold",
                  size: "md",
                  margin: "none"
                },
                {
                  type: "text",
                  text: gptReply,
                  wrap: true,
                  margin: "md",
                  size: "sm"
                },
                {
                  type: "separator",
                  margin: "md"
                },
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "md",
                  margin: "md",
                  contents: [
                    {
                      type: "button",
                      style: "link",
                      action: {
                        type: "uri",
                        label: "Amazonで検索",
                        uri: amazonUrl
                      }
                    },
                    {
                      type: "button",
                      style: "link",
                      action: {
                        type: "uri",
                        label: "楽天市場で検索",
                        uri: rakutenUrl
                      }
                    }
                  ]
                }
              ]
            }
          }
        };

        await client.replyMessage(event.replyToken, message);
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
  const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。商品が特定できる場合は、検索キーワードも一緒に提供してください。ただし、料理や医療などDIYと関係のない話題には「専門外」として丁寧に断ってください。`;
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
      console.warn("429 Too Many Requests - Retrying in 2s...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, retryCount + 1);
    }
    return "現在回答できません。しばらくしてから再度お試しください。";
  }
}

function extractKeywordForSearch(replyText) {
  // 単純な正規表現抽出例（改善可能）
  const keywordMatch = replyText.match(/「(.+?)」|\b(塗料|壁紙|クロス|接着剤|工具|断熱|防水|木材)\b/);
  return keywordMatch ? keywordMatch[1] || keywordMatch[0] : "DIY 道具";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ LINE DIY Bot running on port ${PORT}`);
});
