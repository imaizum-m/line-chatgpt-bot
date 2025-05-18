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

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;

      try {
        let reply;
        if (userText.trim().match(/^こんにちは|^初めまして|^はじめまして|^hi|^hello/i)) {
          reply = "こんにちは！DIYと住宅リフォームの専門アシスタントです。\n工具・塗料・施工方法などお困りのことがあればお気軽にご相談ください。";
        } else {
          reply = await askChatGPT(userText);
        }

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
    const systemPrompt = `
あなたはDIYと住宅リフォームの専門家アシスタントです。
ユーザーからの質問には、住宅内外の改修、工具、塗料、建材、施工方法などに関する専門的な知識を使って、正確で実用的な回答を行ってください。
電動工具、手工具、設備交換、床・壁・天井の仕上げ材、接着剤、防水・断熱資材などの商品情報や使い方に詳しく説明してください。
DIYカテゴリのみ対象にしてください。
それ以外の話題（料理、医療、芸能など）には「この分野については専門外のためお答えできません」と返してください。
`;

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
          Authorization: `Bearer ${process
