import * as dotenv from 'dotenv';

dotenv.config();

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID ?? '';
const SYND_CHANNEL = process.env.SYND_CHANNEL_ID ?? '';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? '';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID ?? '';

export {ADMIN_ROLE_ID, SYND_CHANNEL, DISCORD_TOKEN, GOOGLE_SHEET_ID}