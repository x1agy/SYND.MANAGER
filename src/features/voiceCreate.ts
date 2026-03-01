import { VoiceState, ChannelType } from 'discord.js';
import { VOICE_CATEGORY_ID } from '../constants/envVars';

const CONFIG = {
  '1475655487637950516': 2,
  '1477658049949995048': 3,
  '1475652243981340918': 4,
};

const nameConfig = {
  2: '🎭｜tet-a-tet',
  3: '👁️｜Трио',
  4: '🍻｜Квартет',
}

const channelsMap = new Map();

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
) {
  const { member, guild } = newState;

  if (newState.channelId && newState.channel?.parentId === VOICE_CATEGORY_ID) {
    const triggerName = newState.channel.id;
    const limit = CONFIG[triggerName as keyof typeof CONFIG];

    if (limit) {
      try {
        const newChannel = await guild.channels.create({
          name: `${nameConfig[limit as keyof typeof nameConfig]} #${[...channelsMap.values()].filter((l) => l === limit).length + 1}`,
          type: ChannelType.GuildVoice,
          parent: newState.channel.parentId,
          userLimit: limit,
          position: (newState.channel.rawPosition || 0),
          
        });

        newChannel.lockPermissions();

        await member?.voice.setChannel(newChannel);

        channelsMap.set(newChannel.id, limit);
      } catch (err) {
        console.error('Ошибка при создании канала:', err);
      }
    }
  }

  if (oldState.channelId && oldState.channel?.parentId === VOICE_CATEGORY_ID) {
    const oldChannel = oldState.channel;

    if (channelsMap.has(oldChannel.id) && oldChannel.members.size === 0) {
      channelsMap.delete(oldChannel.id);
      try {
        await oldChannel.delete();
      } catch (err) {}
    }
  }
}
