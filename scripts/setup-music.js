// Fetch official standalone yt-dlp, verifying its published SHA-256 checksum.
const { createHash } = require('node:crypto');
const { access, mkdir, writeFile, rename, chmod } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');

async function main() {
  const directory = path.resolve(__dirname, '../tools');
  const target = path.join(directory, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (process.argv.includes('--if-missing')) {
    if (process.env.YT_DLP_PATH) {
      console.log('Используется yt-dlp из YT_DLP_PATH.');
      return;
    }
    try {
      await access(target, constants.X_OK);
      console.log('yt-dlp уже установлен.');
      return;
    } catch {
      // A fresh deployment has no tools directory; install below.
    }
  }
  const binaries = {
    'win32-x64': 'yt-dlp.exe', 'win32-arm64': 'yt-dlp_arm64.exe',
    'linux-x64': 'yt-dlp_linux', 'linux-arm64': 'yt-dlp_linux_aarch64',
    'darwin-x64': 'yt-dlp_macos', 'darwin-arm64': 'yt-dlp_macos',
  };
  const filename = binaries[`${process.platform}-${process.arch}`];
  if (!filename) throw new Error('Установите yt-dlp вручную и задайте YT_DLP_PATH.');
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
  async function download(name) {
    const response = await fetch(base + name, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Загрузка ${name}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const [binary, checksums] = await Promise.all([download(filename), download('SHA2-256SUMS')]);
  const expected = checksums.toString().split(/\r?\n/).map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1]?.replace(/^\*/, '') === filename)?.[0];
  const actual = createHash('sha256').update(binary).digest('hex');
  if (!expected || expected !== actual) throw new Error('Контрольная сумма yt-dlp не совпала.');
  await mkdir(directory, { recursive: true });
  await writeFile(target + '.tmp', binary);
  await rename(target + '.tmp', target);
  if (process.platform !== 'win32') await chmod(target, 0o755);
  console.log(`yt-dlp установлен: ${target}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
