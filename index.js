const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

// ✅ APIキー読み込み確認ログ
console.log("🔐 API KEY LOADED:", process.env.OPENAI_API_KEY ? "✅ Yes" : "❌ No");

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const client = new Client(config);

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    // ✅ 初回フォロー時のあいさつ
    if (event.type === "follow") {
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "ようこそ！このBotはDIYや住宅リフォームの相談に特化したアシスタントです🔧🏠\n工具・塗料・施工方法など、なんでも気軽に聞いてください！"
      });
      continue;
    }

    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        const reply = await askChatGPT(userText);
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: reply
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
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `あなたはDIYと住宅リフォームの専門家アシスタントです。
ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。
電動工具、手工具、設備交換、床・壁・天井の仕上げ材、接着剤、防水・断熱資材などの商品情報や使い方に詳しく説明してください。

回答の中で、該当商品がAmazonにある可能性がある場合は、
必ず以下のようにAmazon検索へのリンクを提供してください：

【Amazonで「○○」を検索する】(https://www.amazon.co.jp/s?k=○○)

※URLは全角スペースを + に変えて検索キーワードとしてリンク化してください
※DIYカテゴリのみ対象にする
※「壁紙」と言われたら「クロス、リメイクシート」も含めるなど、補足を含める

それ以外の話題（例：料理、エンタメ、医療など）には対応せず、
「この分野については専門外のためお答えできません。」と返答してください。
一般的な会話については気を害さないように回答し、なるべく専門分野へ
