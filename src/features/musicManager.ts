import {
  ChannelType, escapeMarkdown, Guild, Interaction, PermissionFlagsBits,
  SlashCommandBuilder, VoiceBasedChannel, VoiceState,
} from 'discord.js';
import {
  AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState,
  joinVoiceChannel, NoSubscriberBehavior, StreamType, VoiceConnectionStatus,
} from '@discordjs/voice';
import { MusicQueue, MusicTrack } from '../services/musicQueue';
import { AudioSource, getYouTubeTitle, normalizeYouTubeUrl, openYouTubeAudio } from '../services/youtubeAudio';

const sessions = new Map<string, MusicSession>();
const maxTracksPerUser = 20;

class MusicSession {
  readonly player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  readonly connection;
  readonly queue: MusicQueue;
  readonly ready: Promise<unknown>;
  private source: AudioSource | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(readonly guild: Guild, readonly channelId: string) {
    this.connection = joinVoiceChannel({
      guildId: guild.id, channelId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true,
    });
    this.queue = new MusicQueue(
      (track) => this.play(track),
      () => { this.source?.stop(); this.source = null; this.player.stop(true); },
      () => {
        if (!this.idleTimer) this.idleTimer = setTimeout(() => this.destroy(), 60_000);
      }
    );
    this.connection.subscribe(this.player);
    this.player.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && 'resource' in oldState) {
        this.queue.finish(oldState.resource.metadata as MusicTrack);
      }
    });
    this.player.on('error', (error) => {
      console.error('Ошибка музыкального плеера:', error);
      this.queue.finish(error.resource.metadata as MusicTrack);
    });
    this.connection.on('error', (error) => {
      console.error('Ошибка голосового подключения:', error);
      this.destroy();
    });
    this.connection.on(VoiceConnectionStatus.Disconnected, () => {
      // Allow Discord's transient reconnects; release stale queues after a real disconnect.
      void Promise.race([
        entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
      ]).then(() => entersState(this.connection, VoiceConnectionStatus.Ready, 20_000))
        .catch(() => this.destroy());
    });
    this.connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy());
    this.ready = entersState(this.connection, VoiceConnectionStatus.Ready, 20_000).catch((error) => {
      this.destroy();
      throw new Error('Не удалось подключиться к голосовому каналу. Проверьте права бота.', { cause: error });
    });
    // A voice disconnect can happen before the command starts awaiting readiness.
    void this.ready.catch(() => undefined);
  }

  add(url: string, userId: string): MusicTrack {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    return this.queue.add(url, userId);
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.queue.dispose();
    if (sessions.get(this.guild.id) === this) sessions.delete(this.guild.id);
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
  }

  private play(track: MusicTrack): void {
    try {
      this.source = openYouTubeAudio(track.url, (error) => {
        console.error('Ошибка воспроизведения YouTube:', error);
        this.queue.finish(track);
      });
      this.player.play(createAudioResource(this.source.stream, { inputType: StreamType.Raw, metadata: track }));
    } catch (error) {
      console.error('Ошибка запуска трека:', error);
      // Avoid recursion when several consecutive tracks cannot start.
      queueMicrotask(() => this.queue.finish(track));
    }
  }
}

export function getMusicCommands() {
  return [
    new SlashCommandBuilder().setName('play').setDescription('Включить аудио YouTube или добавить в очередь')
      .addStringOption((option) => option.setName('url').setDescription('Ссылка на видео YouTube').setRequired(true)),
    new SlashCommandBuilder().setName('queue').setDescription('Показать текущий трек и очередь'),
    new SlashCommandBuilder().setName('clear-my-tracks').setDescription('Удалить свои треки из очереди и остановить текущий'),
  ].map((command) => command.setDMPermission(false).toJSON());
}

const trackLabel = (track: MusicTrack) => `${escapeMarkdown(track.title.slice(0, 70))} — <@${track.userId}>${track.ready ? '' : ' (загрузка)'}`;

export async function musicInteractionHandler(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand() || !['play', 'queue', 'clear-my-tracks'].includes(interaction.commandName)) return;
  await interaction.deferReply({ ephemeral: true });
  let reserved: MusicTrack | null = null;
  let session: MusicSession | undefined;
  try {
    const guild = interaction.guild;
    if (!guild) throw new Error('Команда доступна только на сервере.');
    const member = await guild.members.fetch(interaction.user.id);
    const channel = member.voice.channel;
    session = sessions.get(guild.id);

    if (interaction.commandName === 'clear-my-tracks') {
      const removed = session?.queue.clearUser(member.id) || 0;
      await interaction.editReply(`Удалено ваших треков: ${removed}.`);
      return;
    }
    if (!channel) throw new Error('Сначала войдите в голосовой канал.');
    if (session && session.channelId !== channel.id) throw new Error('Бот играет в другом канале. Войдите в его канал.');

    if (interaction.commandName === 'queue') {
      if (!session) { await interaction.editReply('Очередь пуста.'); return; }
      const lines = session.queue.pending.slice(0, 10).map((track, i) => `${i + 1}. ${trackLabel(track)}`);
      const content = [
        session.queue.current ? `Сейчас: ${trackLabel(session.queue.current)}` : 'Сейчас ничего не играет.',
        ...lines,
        session.queue.pending.length > 10 ? `Ещё треков: ${session.queue.pending.length - 10}.` : '',
      ].filter(Boolean).join('\n');
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
      return;
    }

    const url = normalizeYouTubeUrl(interaction.options.getString('url', true));
    if (channel.type !== ChannelType.GuildVoice) throw new Error('Музыка доступна в обычном голосовом канале.');
    const bot = guild.members.me || await guild.members.fetchMe();
    const permissions = channel.permissionsFor(bot);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      throw new Error('Боту нужны права просмотра канала, подключения и речи.');
    }
    // Re-read after awaits so simultaneous /play commands share one session.
    session = sessions.get(guild.id);
    if (session && session.channelId !== channel.id) throw new Error('Бот уже подключился к другому каналу.');
    if (member.voice.channelId !== channel.id) throw new Error('Вы уже вышли из голосового канала.');
    if (session && [...session.queue.pending, ...(session.queue.current ? [session.queue.current] : [])]
      .filter((track) => track.userId === member.id).length >= maxTracksPerUser) {
      throw new Error(`Можно добавить максимум ${maxTracksPerUser} своих треков.`);
    }
    if (!session) {
      ensureChannelAvailable(channel, bot.id);
      session = new MusicSession(guild, channel.id);
      sessions.set(guild.id, session);
    }
    reserved = session.add(url, member.id);
    const [title] = await Promise.all([getYouTubeTitle(url), session.ready]);
    if (member.voice.channelId !== channel.id) session.queue.remove(reserved);
    if (!session.queue.markReady(reserved, title)) throw new Error('Трек удалён: вы вышли из канала или очистили очередь.');
    await interaction.editReply({ content: `Добавлено: ${escapeMarkdown(title)}.`, allowedMentions: { parse: [] } });
  } catch (error) {
    if (reserved) session?.queue.remove(reserved);
    console.error('Ошибка музыкальной команды:', error);
    await interaction.editReply(error instanceof Error ? error.message : 'Не удалось выполнить музыкальную команду.');
  }
}

function ensureChannelAvailable(channel: VoiceBasedChannel, botId: string): void {
  if (channel.full && !channel.members.has(botId)) throw new Error('Голосовой канал заполнен. Освободите место для бота.');
}

export function handleMusicVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  const session = sessions.get(oldState.guild.id);
  if (!session || oldState.channelId !== session.channelId || oldState.channelId === newState.channelId) return;
  if (oldState.id === oldState.client.user?.id) { session.destroy(); return; }
  session.queue.clearUser(oldState.id);
  const channel = oldState.guild.channels.cache.get(session.channelId);
  if (!channel?.isVoiceBased() || !channel.members.some((member) => !member.user.bot)) session.destroy();
}
