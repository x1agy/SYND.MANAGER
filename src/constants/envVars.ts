import * as dotenv from 'dotenv';

dotenv.config();

const SYND_CHANNEL = process.env.SYND_CHANNEL_ID ?? '';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? '';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID ?? '';
const GOOGLE_API = process.env.GOOGLE_API ?? '';

export { SYND_CHANNEL, DISCORD_TOKEN, GOOGLE_SHEET_ID, GOOGLE_API };