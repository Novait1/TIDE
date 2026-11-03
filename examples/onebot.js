// OneBot v11 接入示例（Node 22+ 自带 WebSocket；Node 20 请用 `ws` 包替换即可）
// 这里刻意不写死任何账号：把 wsUrl / selfId / ownerIds 换成你自己的。
import { Tide, MemoryStore, DEFAULT_PERSONA } from '../src/index.js';
import { handleOneBotEvent } from '../src/adapters/onebot.js';

const cfg = {
  wsUrl: 'ws://127.0.0.1:3001',
  accessToken: '',
  selfId: '<你的 bot QQ>',
  ownerIds: ['<你的 QQ>'],
};

const tide = new Tide({
  persona: DEFAULT_PERSONA,
  memory: new MemoryStore(),
  // 接你自己的模型；这里只是占位
  llm: async (prompt) => '（示例回复）',
});

const ws = new WebSocket(cfg.wsUrl, {
  headers: cfg.accessToken ? { Authorization: `Bearer ${cfg.accessToken}` } : {},
});

const pending = new Map();
let seq = 0;

function send(action, params) {
  return new Promise((resolve, reject) => {
    const echo = `tide-${++seq}`;
    pending.set(echo, { resolve, reject });
    ws.send(JSON.stringify({ action, params, echo }));
  });
}

ws.addEventListener('message', async (ev) => {
  let data;
  try {
    data = JSON.parse(ev.data);
  } catch {
    return;
  }

  // 动作响应
  if (data.echo && pending.has(data.echo)) {
    const p = pending.get(data.echo);
    pending.delete(data.echo);
    if (data.status === 'ok' || data.retcode === 0) p.resolve(data.data);
    else p.reject(new Error(data.message || data.wording || 'OneBot action failed'));
    return;
  }

  if (data.post_type !== 'message') return;

  try {
    await handleOneBotEvent(data, {
      tide,
      send,
      selfId: cfg.selfId,
      ownerIds: cfg.ownerIds,
      quote: true,
      // 群里只回 @，私聊全回；你自己再按概率/额度加策略
      shouldReply: (m) => !m.isGroup || m.mentioned,
    });
  } catch (e) {
    console.error('handle failed:', e.message);
  }
});

ws.addEventListener('close', () => {
  console.error('OneBot 连接断开，重连逻辑请按部署环境补上');
});
