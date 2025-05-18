// LINE × OpenAI DIY/リフォーム専用Bot with Amazon + 楽天リンク
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

// キーワードに応じた画像URL（無理に外部URLは使わず、必要ならGitHubの静的リンクに）
function getImageUrl(keyword) {
  const map = {
    "塗料": "https://yourdomain.com/diy_icons/paint.jpg",
    "工具": "https://yourdomain.com/diy_icons/tools.jpg",
    "壁紙": "https://yourdomain.com/diy_icons/wallpaper.jpg",
    "接着剤": "https://yourdomain.com/diy_icons/glue.jpg",
    "防水": "https://yourdomain.com/diy_icons/waterproof.jpg",
    "断熱": "https://yourdomain.com/diy_icons/insulation.jpg",
    "木材": "https://yourdomain.com/diy_icons/wood.jpg",
    "クロス": "https://yourdomain.com/diy_icons/cross.jpg"
  };
  return map[keyword] || "https://yourdomain.com/diy_icons/tools.jpg";
}

// メッセージ受信時の処理
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const keyword = event.message.text;
      const replyToken = event.replyToken;

      // Flex Message生成
      const message = {
        type: "flex",
        altText: `検索結果: ${keyword}`,
        contents: {
          type: "bubble",
          hero: {
            type: "image",
            url: getImageUrl(keyword),
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: `「${keyword}」の関連商品を検索できます`,
                wrap: true
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
                style: "link",
                height: "sm",
                action: {
                  type: "uri",
                  label: "Amazonで検索",
                  uri: `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}`
                }
              },
              {
                type: "button",
                style: "link",
                height: "sm",
                action: {
                  type: "uri",
                  label: "楽天で検索",
                  uri: `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}`
                }
              }
            ],
            flex: 0
          }
        }
      };

      try {
        await client.replyMessage(replyToken, message);
      } catch (err) {
        console.error("❌ LINE Reply Error:", err.response?.data || err.message);
        await client.replyMessage(replyToken, {
          type: "text",
          text: "申し訳ありません。現在応答できません。"
        });
      }
    }
  }

  res.sendStatus(200);
});

// Render対応
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
