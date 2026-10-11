import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const invalidCookies = () => new Error(
  'Неверный формат YT_DLP_COOKIES. Вставьте cookies в формате Netscape или строку name=value; name2=value2.'
);

function normalizeCookies(value: string): string {
  const content = value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t').replace(/\r\n?/g, '\n').trim();
  if (/^# (?:Netscape HTTP Cookie File|HTTP Cookie File)(?:\n|$)/.test(content)) {
    const rows = content.split('\n').filter((line) => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')));
    if (!rows.length || rows.some((line) => {
      const fields = line.split('\t');
      return fields.length !== 7 || !fields[0] || !/^(TRUE|FALSE)$/.test(fields[1]!) ||
        !fields[2]?.startsWith('/') || !/^(TRUE|FALSE)$/.test(fields[3]!) ||
        !/^\d+$/.test(fields[4]!) || !fields[5];
    })) throw invalidCookies();
    return content + '\n';
  }

  // Also accept the Cookie request header copied from the browser's Network tab.
  const header = content.replace(/^Cookie:\s*/i, '');
  if (/[\r\n\t\0]/.test(header)) throw invalidCookies();
  const pairs = header.split(';').map((part) => part.trim()).filter(Boolean);
  if (!pairs.length) throw invalidCookies();
  const rows = pairs.map((pair) => {
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator).trim();
    if (separator < 1 || !/^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$/.test(name)) throw invalidCookies();
    return ['.youtube.com', 'TRUE', '/', 'TRUE', '0', name, pair.slice(separator + 1).trim()].join('\t');
  });
  return '# Netscape HTTP Cookie File\n' + rows.join('\n') + '\n';
}

export interface YouTubeCookies {
  args: string[];
  cleanup: () => void;
}

export function prepareYouTubeCookies(env: NodeJS.ProcessEnv = process.env): YouTubeCookies {
  if (!env.YT_DLP_COOKIES?.trim()) {
    return { args: env.YT_DLP_COOKIES_PATH ? ['--cookies', env.YT_DLP_COOKIES_PATH] : [], cleanup: () => {} };
  }
  const content = normalizeCookies(env.YT_DLP_COOKIES);
  // yt-dlp requires a file. Each invocation gets its own private, temporary cookie jar.
  const directory = mkdtempSync(join(tmpdir(), 'synd-youtube-'));
  const path = join(directory, 'cookies.txt');
  const cleanup = () => {
    try { unlinkSync(path); } catch {}
    try { rmdirSync(directory); } catch {}
  };
  try {
    writeFileSync(path, content, { mode: 0o600 });
  } catch (error) {
    cleanup();
    throw error;
  }
  return { args: ['--cookies', path], cleanup };
}
