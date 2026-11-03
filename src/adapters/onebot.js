// OneBot v11 适配器
// 只做翻译：原始事件 → TIDE 输入；TIDE 回复 → send(action, params)。
// 传输层不绑定，WebSocket / HTTP / 其他协议由使用方提供。

/** 解析一条 OneBot v11 消息事件；不是消息返回 null */
export function parseOneBotEvent(event, { selfId = '' } = {}) {
  if (!event || event.post_type !== 'message') return null;
  const isGroup = event.message_type === 'group';
  const segments = Array.isArray(event.message) ? event.message : [];
  let text = '';
  const images = [];
  let mentioned = false;

  for (const seg of segments) {
    if (seg.type === 'text') {
      text += seg.data?.text || '';
    } else if (seg.type === 'image') {
      images.push(seg.data?.url || seg.data?.file || '');
      text += '[图片]';
    } else if (seg.type === 'at') {
      const qq = String(seg.data?.qq || '');
      if (qq && qq === String(selfId)) mentioned = true;
      else text += `@${seg.data?.name || qq}`;
    } else if (seg.type === 'record') {
      text += '[语音]';
    }
  }

  const userId = String(event.user_id || event.sender?.user_id || '');
  const groupId = isGroup ? String(event.group_id) : '';
  return {
    isGroup,
    groupId,
    userId,
    key: isGroup ? `group:${groupId}` : `private:${userId}`,
    mentioned,
    images,
    text: text.trim(),
    messageId: event.message_id,
    name: event.sender?.card || event.sender?.nickname || '',
  };
}

/** 把事件和外部关系数据合成 Tide.handle 需要的人 */
export function personFromEvent(msg, stats = null) {
  return {
    id: msg.userId,
    name: stats?.name || msg.name || msg.userId,
    warmth: stats?.warmth ?? 0,
    resentment: stats?.resentment ?? 0,
  };
}

/** 发送一条文本消息；quote 会把原消息带上回复引用 */
export async function replyOneBot(send, msg, text, { quote = false } = {}) {
  if (!text) return;
  const message =
    quote && msg.messageId !== undefined
      ? [
          { type: 'reply', data: { id: String(msg.messageId) } },
          { type: 'text', data: { text } },
        ]
      : text;

  if (msg.isGroup) await send('send_group_msg', { group_id: msg.groupId, message });
  else await send('send_private_msg', { user_id: msg.userId, message });
}

/**
 * 处理一条事件：解析 → 调 Tide → 发回。
 * shouldReply(msg, event) 由使用方决定群里要不要接话、命令要不要跳过等。
 */
export async function handleOneBotEvent(
  event,
  {
    tide,
    send,
    selfId = '',
    getPerson = () => null,
    ownerIds = [],
    quote = false,
    shouldReply = () => true,
  } = {}
) {
  const msg = parseOneBotEvent(event, { selfId });
  if (!msg) return { handled: false, reason: 'not-message' };
  if (String(msg.userId) === String(selfId)) return { handled: false, reason: 'self' };
  if (!msg.text) return { handled: false, reason: 'empty' };
  if (!shouldReply(msg, event)) return { handled: false, reason: 'skipped' };

  const person = personFromEvent(msg, getPerson(msg.userId));
  const out = await tide.handle({
    text: msg.text,
    key: msg.key,
    person,
    isGroup: msg.isGroup,
    fromOwner: [...ownerIds].map(String).includes(String(msg.userId)),
  });
  await replyOneBot(send, msg, out.text, { quote });
  return { handled: true, reply: out.text, mood: out.mood, recalled: out.recalled };
}
