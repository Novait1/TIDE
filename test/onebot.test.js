import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOneBotEvent, personFromEvent, replyOneBot, handleOneBotEvent } from '../src/adapters/onebot.js';

const SELF = '3877218692';

test('解析群消息：@、文本、图片、昵称', () => {
  const event = {
    post_type: 'message',
    message_type: 'group',
    group_id: 414858556,
    user_id: 3774572947,
    message_id: 1001,
    sender: { card: '群名片', nickname: '昵称' },
    message: [
      { type: 'at', data: { qq: SELF } },
      { type: 'text', data: { text: ' 在吗 ' } },
      { type: 'image', data: { url: 'https://example.com/a.png' } },
    ],
  };
  const m = parseOneBotEvent(event, { selfId: SELF });
  assert.equal(m.isGroup, true);
  assert.equal(m.key, 'group:414858556');
  assert.equal(m.mentioned, true);
  assert.equal(m.text, '在吗 [图片]');
  assert.equal(m.images.length, 1);
  assert.equal(m.name, '群名片');
});

test('解析私聊，并排除 @ 别人', () => {
  const event = {
    post_type: 'message',
    message_type: 'private',
    user_id: 10001,
    message_id: 1,
    message: [
      { type: 'at', data: { qq: '999', name: '别人' } },
      { type: 'text', data: { text: '你好' } },
    ],
  };
  const m = parseOneBotEvent(event, { selfId: SELF });
  assert.equal(m.key, 'private:10001');
  assert.equal(m.mentioned, false);
  assert.equal(m.text, '@别人你好');
});

test('非消息事件返回 null', () => {
  assert.equal(parseOneBotEvent({ post_type: 'notice' }), null);
  assert.equal(parseOneBotEvent(null), null);
});

test('发送动作按群聊/私聊分流，quote 带上引用', async () => {
  const sent = [];
  const send = async (action, params) => sent.push({ action, params });
  await replyOneBot(send, { isGroup: true, groupId: '1', userId: '2', messageId: 7 }, 'hi', { quote: true });
  await replyOneBot(send, { isGroup: false, groupId: '', userId: '2' }, 'yo');
  assert.equal(sent[0].action, 'send_group_msg');
  assert.deepEqual(sent[0].params.message[0], { type: 'reply', data: { id: '7' } });
  assert.equal(sent[1].action, 'send_private_msg');
  assert.equal(sent[1].params.message, 'yo');
});

test('handleOneBotEvent 调 Tide 并回复', async () => {
  const calls = [];
  const tide = {
    async handle(args) {
      calls.push(args);
      return { text: '收到', mood: {}, recalled: 0 };
    },
  };
  const sent = [];
  const event = {
    post_type: 'message',
    message_type: 'private',
    user_id: 10001,
    message_id: 9,
    sender: { nickname: '某人' },
    message: [{ type: 'text', data: { text: '在吗' } }],
  };
  const r = await handleOneBotEvent(event, {
    tide,
    selfId: SELF,
    send: async (action, params) => sent.push({ action, params }),
    getPerson: () => ({ name: '某人', warmth: 0.4, resentment: 0 }),
    ownerIds: ['10001'],
  });
  assert.equal(r.handled, true);
  assert.equal(calls[0].key, 'private:10001');
  assert.equal(calls[0].fromOwner, true);
  assert.equal(calls[0].person.warmth, 0.4);
  assert.equal(sent[0].action, 'send_private_msg');
});

test('自己发的、空的、被 shouldReply 拒绝的都不处理', async () => {
  const base = { post_type: 'message', message_type: 'private', user_id: 1, message_id: 1, message: [] };
  const opts = { tide: { handle: async () => { throw new Error('不该调用'); } }, send: async () => {} };
  assert.equal((await handleOneBotEvent({ ...base, user_id: Number(SELF) }, { ...opts, selfId: SELF })).reason, 'self');
  assert.equal(
    (await handleOneBotEvent({ ...base, message: [{ type: 'text', data: { text: '  ' } }] }, { ...opts, selfId: SELF })).reason,
    'empty'
  );
  assert.equal(
    (
      await handleOneBotEvent({ ...base, message: [{ type: 'text', data: { text: 'hi' } }] }, {
        ...opts,
        selfId: SELF,
        shouldReply: () => false,
      })
    ).reason,
    'skipped'
  );
});

test('personFromEvent 缺数据时兜底', () => {
  const p = personFromEvent({ userId: '1', name: '' }, null);
  assert.equal(p.id, '1');
  assert.equal(p.name, '1');
  assert.equal(p.warmth, 0);
});
