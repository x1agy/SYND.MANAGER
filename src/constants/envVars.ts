import * as dotenv from 'dotenv';

dotenv.config();

const SYND_CHANNEL = process.env.SYND_CHANNEL_ID ?? '';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? '';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID ?? '';
const GOOGLE_API = process.env.GOOGLE_API ?? '';
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID ?? '';
const STORAGE_CHAT_ID = process.env.STORAGE_CHAT_ID ?? '';
const VOICE_CATEGORY_ID = process.env.VOICE_CATEGORY_ID || '';
const CONTRACTS_SHEET_ID = process.env.CONTRACTS_SHEET_ID || '';
const AVAILABLE_CHANNELS = (process.env.AVAILABLE_CHANNELS || '')
  .replace(/[\[\]"'`\s]/g, '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

export {
  SYND_CHANNEL,
  DISCORD_TOKEN,
  GOOGLE_SHEET_ID,
  GOOGLE_API,
  ALERT_CHAT_ID,
  STORAGE_CHAT_ID,
  VOICE_CATEGORY_ID,
  CONTRACTS_SHEET_ID,
  AVAILABLE_CHANNELS,
};
