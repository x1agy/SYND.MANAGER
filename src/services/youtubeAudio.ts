import { ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareYouTubeCookies } from './youtubeCookies';

const execFileAsync = promisify(execFile);
const downloader = () => {
  const bundled = resolve(__dirname, '../../tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return process.env.YT_DLP_PATH || (existsSync(bundled) ? bundled : 'yt-dlp');
};
const baseArgs = () => [
  '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
  '--socket-timeout', '15', '--retries', '2',
  '--js-runtimes', `node:${process.execPath}`,
];

export function normalizeYouTubeUrl(input: string): string {
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new Error('Нужна ссылка на видео YouTube.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) {
    throw new Error('Нужна ссылка на видео YouTube.');
  }
  const host = parsed.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1);
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
    else id = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(parsed.pathname)?.[1] || null;
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new Error('Нужна ссылка на отдельное видео YouTube.');
  }
  return `https://www.youtube.com/watch?v=${id}`;
}

export async function getYouTubeTitle(url: string): Promise<string> {
  const cookies = prepareYouTubeCookies();
  try {
    const { stdout } = await execFileAsync(downloader(), [...baseArgs(), ...cookies.args, '--skip-download', '--dump-json', '--', url], {
      timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    const info = JSON.parse(stdout);
    if (info.is_live) throw new Error('Прямые трансляции не поддерживаются.');
    if (typeof info.title !== 'string') throw new Error('Не удалось получить название видео.');
    return info.title.slice(0, 200);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('yt-dlp не установлен. Укажите YT_DLP_PATH на сервере бота.');
    }
    if (error instanceof Error && error.message === 'Прямые трансляции не поддерживаются.') throw error;
    const stderr = (error as { stderr?: string }).stderr || '';
    console.error('Ошибка получения видео YouTube:', stderr.slice(-2000) || (error as Error).message);
    if (/Sign in to confirm|cookies-for-the-authentication|--cookies-for-the-authentication/i.test(stderr)) {
      throw new Error('YouTube требует авторизацию. Настройте YT_DLP_COOKIES или YT_DLP_COOKIES_PATH на сервере бота.');
    }
    throw new Error('Не удалось открыть видео. Проверьте доступность ссылки и обновите yt-dlp.');
  } finally {
    cookies.cleanup();
  }
}

export interface AudioSource { stream: Readable; stop: () => void }

export function openYouTubeAudio(url: string, onError: (error: Error) => void): AudioSource {
  if (!ffmpegPath) throw new Error('FFmpeg не установлен. Выполните npm install.');
  const cookies = prepareYouTubeCookies();
  let download: ChildProcessWithoutNullStreams;
  try {
    download = spawn(downloader(), [...baseArgs(), ...cookies.args, '-f', 'bestaudio/best', '-o', '-', '--', url], { windowsHide: true });
  } catch (error) {
    cookies.cleanup();
    throw error;
  }
  download.once('close', cookies.cleanup);
  let convert: ChildProcessWithoutNullStreams;
  try {
    convert = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn',
      '-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-frame_duration', '20', '-f', 'ogg', '-page_duration', '20000',
      '-flush_packets', '1', 'pipe:1',
    ], { windowsHide: true });
  } catch (error) {
    download.kill();
    throw error;
  }
  let stopped = false;
  let details = '';
  const timer = setTimeout(() => fail(new Error('Видео не начало воспроизводиться за 45 секунд.')), 45_000);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    download.stdout.unpipe(convert.stdin);
    download.kill();
    convert.kill();
    download.stdout.destroy();
    convert.stdin.destroy();
    convert.stdout.destroy();
  };
  const fail = (error: Error) => {
    if (stopped) return;
    stop();
    onError(error);
  };
  for (const process of [download, convert]) {
    process.on('error', fail);
    process.stderr.on('data', (chunk: Buffer) => { details = (details + chunk.toString()).slice(-2000); });
    process.on('close', (code) => {
      if (code !== 0 && !stopped) fail(new Error(`Ошибка аудиопотока (${code}): ${details}`));
    });
  }
  download.stdout.on('error', fail);
  convert.stdin.on('error', fail);
  convert.stdout.on('error', fail);
  convert.stdout.once('readable', () => clearTimeout(timer));
  download.stdout.pipe(convert.stdin);
  return { stream: convert.stdout, stop };
}
