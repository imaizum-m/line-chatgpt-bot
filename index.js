// Ver.1.6.2
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

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const userId = event.source.userId || "ユーザー";

      try {
        const replyData = await askChatGPT(userText, userId);
        const quickReplyItems = parseQuickReply(replyData.quickReply);

        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "商品検索リンク",
          contents: createFlexMessage(replyData.text, replyData.searchWord),
          quickReply: quickReplyItems.length > 0 ? { items: quickReplyItems } : undefined
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

function parseQuickReply(raw) {
  if (!raw) return [];

  let jsonText = raw;
  if (typeof raw === "string") {
    jsonText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  }

  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed)
      ? parsed.map(label => ({
          type: "action",
          action: { type: "message", label, text: label }
        }))
      : [];
  } catch (e) {
    console.warn("⚠️ QuickReply JSON parse error:", e.message);
    return [];
  }
}

function createFlexMessage(answer, keyword) {
  const encoded = encodeURIComponent(keyword);
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: answer, wrap: true }
      ]
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: "Amazonで検索",
            uri: `https://www.amazon.co.jp/s?k=${encoded}`
          }
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: "楽天市場で検索",
            uri: `https://search.rakuten.co.jp/search/mall/${encoded}`
          }
        }
      ],
      flex: 0
    }
  };
}

async function askChatGPT(text, userId, retryCount = 0) {
  try {
    const systemPrompt = `あなたはDIYと住宅リフォームの専門家アシスタントです。...（省略可能）...`;
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        functions: [
          {
            name: "extract_search_word",
            description: "回答の要点からAmazon・楽天市場検索用のキーワードを抽出する",
            parameters: {
              type: "object",
              properties: {
                searchWord: { type: "string", description: "検索キーワード" },
                quickReply: {
                  type: "array",
                  description: "ユーザーが次に聞きたくなる関連質問",
                  items: { type: "string" }
                }
              },
              required: ["searchWord"]
            }
          }
        ],
        function_call: { name: "extract_search_word" }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const replyText = res.data.choices[0]?.message?.content?.trim() || "";
    const fnCall = res.data.choices[0]?.message?.function_call;
    const args = JSON.parse(fnCall?.arguments || "{}");

    return {
      text: `${userId}さん、ありがとうございます。${replyText}`,
      searchWord: args.searchWord || text,
      quickReply: JSON.stringify(args.quickReply || [])
    };
  } catch (error) {
    if (error.response?.status === 429 && retryCount < 3) {
      console.warn("⏳ Rate limit hit, retrying...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return askChatGPT(text, userId, retryCount + 1);
    } else {
      console.error("ChatGPT error:", error.response?.data || error.message);
      return {
        text: "申し訳ありません。現在応答できません。",
        searchWord: text,
        quickReply: []
      };
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
