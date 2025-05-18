// line-chatgpt-bot Ver.1.6（ベース：Ver.1.5.1）
// - ChatGPT応答の冒頭にユーザー名＋感謝／共感文を付加
// - Flex Messageボタンリンク付き（サムネイルなし）
// - Quick Reply：ChatGPT応答内容に応じて動的生成

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

// 🔽 Amazon/Rakuten URL生成用
function buildSearchLinks(keyword) {
  const encoded = encodeURIComponent(keyword);
  return {
    amazon: `https://www.amazon.co.jp/s?k=${encoded}`,
    rakuten: `https://search.rakuten.co.jp/search/mall/${encoded}/`
  };
}

// 🔽 ChatGPT用メッセージ整形
function buildSystemPrompt(userName) {
  return `あなたはDIYと住宅リフォームの専門家アシスタントです。ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。商品情報が該当する場合はAmazonと楽天市場のリンクを案内してください。なお、${userName}さんへの返答には冒頭に感謝や共感の一言を添えてください。`;
}

// 🔽 Quick Reply 候補をChatGPT応答から動的生成
async function generateQuickReplies(replyText) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "ユーザーの質問に対する回答をもとに、内容を深掘りする質問を4つ考えてください。回答できない内容は含めず、短く簡潔にしてください。" },
          { role: "user", content: replyText }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const suggestions = response.data.choices[0].message.content
      .split("\n")
      .filter(line => line.trim())
      .slice(0, 4);

    return suggestions.map(text => ({ type: "action", action: { type: "message", label: text.slice(0, 20), text } }));
  } catch (e) {
    console.warn("QuickReply生成失敗:", e.message);
    return [];
  }
}

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const userId = event.source.userId;
      const profile = await client.getProfile(userId);
      const userName = profile.displayName || "ユーザー";

      try {
        const reply = await askChatGPT(userText, userName);
        const quickReplies = await generateQuickReplies(reply.clean);
        const links = buildSearchLinks(reply.keyword);

        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "おすすめ商品を表示しています",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                { type: "text", text: reply.display, wrap: true },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents: [
                    {
                      type: "button",
                      style: "link",
                      action: { type: "uri", label: "Amazonで探す", uri: links.amazon }
                    },
                    {
                      type: "button",
                      style: "link",
                      action: { type: "uri", label: "楽天市場で探す", uri: links.rakuten }
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
        console.error("ChatGPT API error:", err.message);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "申し訳ありません、現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

async function askChatGPT(text, userName, retryCount = 0) {
  try {
    const systemPrompt = buildSystemPrompt(userName);

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

    const raw = res.data.choices[0].message.content.trim();

    // 🔽 Amazon/Rakuten用キーワード抽出（例：最初の名詞または5文字程度）
    const keyword = extractKeyword(text);
    const display = `${userName}さん、ありがとうございます。${raw}`;
    return { display, clean: raw, keyword };
  } catch (error) {
    if (error.response?.status === 429 && retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, userName, retryCount + 1);
    }
    throw error;
  }
}

function extractKeyword(text) {
  const keyword = text.split(" ")[0] || "DIY";
  return keyword.length > 20 ? keyword.slice(0, 20) : keyword;
}

// ✅ Render対応
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ LINE Bot running on port ${PORT}`);
});
