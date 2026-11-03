import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, createEpisode, strengthAt, scopeAllows } from '../src/memory.js';

const now = Date.parse('2026-11-03T12:00:00Z');
const mk = (over = {}) =>
  createEpisode({
    text: '一起吃了顿饭',
    importance: 3,
    at: now,
    ...over,
  });

test('记忆强度随时间衰减，被想起会加固', () => {
  const ep = mk({ at: now - 30 * 86400e3 });
  const before = strengthAt(ep, now);
  assert.ok(before > 0 && before < 1);
  ep.recalls = 5;
  assert.ok(strengthAt(ep, now) > before);
});

test('敏感记忆默认不跨场景', () => {
  const ep = mk({ sensitive: true, scope: 'group:1' });
  assert.equal(scopeAllows(ep, 'group:1'), true);
  assert.equal(scopeAllows(ep, 'group:2'), false);
});

test('敏感记忆跨场景只召回公开版，并去掉人物信息', async () => {
  const store = new MemoryStore({
    episodes: [
      mk({
        text: '在 group:1 被某人气到了',
        sensitive: true,
        scope: 'group:1',
        publicText: '有件事让我不太舒服',
        people: [{ id: 'u1', name: '某人' }],
      }),
    ],
  });
  const hit = await store.recall({ text: '不舒服', key: 'group:2', now });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].episode.text, '有件事让我不太舒服');
  assert.deepEqual(hit[0].episode.people, []);
});

test('没有公开版的敏感记忆不会出现在别的场景', async () => {
  const store = new MemoryStore({
    episodes: [mk({ sensitive: true, scope: 'group:1' })],
  });
  assert.equal((await store.recall({ text: '饭', key: 'group:2', now })).length, 0);
});

test('召回有数量上限，并会记录次数', async () => {
  const store = new MemoryStore({
    episodes: Array.from({ length: 10 }, (_, i) => mk({ text: `第 ${i} 次一起吃饭` })),
  });
  const hits = await store.recall({ text: '吃饭', key: 'private:1', limit: 3, now });
  assert.equal(hits.length, 3);
  for (const e of store.episodes) assert.ok(e.recalls >= 0 && e.recalls <= 1);
});
