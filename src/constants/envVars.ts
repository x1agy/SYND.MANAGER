import * as dotenv from 'dotenv';

dotenv.config();

const SYND_CHANNEL = process.env.SYND_CHANNEL_ID ?? '';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? '';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID ?? '';
const GOOGLE_API = process.env.GOOGLE_API ?? '';
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID ?? '';

export {
  SYND_CHANNEL,
  DISCORD_TOKEN,
  GOOGLE_SHEET_ID,
  GOOGLE_API,
  ALERT_CHAT_ID,
};