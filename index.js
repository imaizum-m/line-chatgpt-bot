const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();

// LINE BOT 設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

// LINEクライアント生成
const client = new Client(config);

// POSTメソッドで /webhook エンドポイントを設定
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events)
