import test from 'node:test';
import assert from 'node:assert/strict';
import { Tide, parseTags, MemoryStore, DEFAULT_PERSONA, buildPersonaBlock } from '../src/index.js';

test('隐藏标记被解析并从正文里删掉', () => {
  const r = parseTags(
    '好呀<state mood="+1" grudge="-2"/><remember who="某人" feel="暖" weight="3">一起吃了顿饭</remember>'
  );
  assert.equal(r.text, '好呀');
  assert.deepEqual(r.deltas, { mood: 1, grudge: -2 });
  assert.equal(r.memories.length, 1);
  assert.equal(r.memories[0].importance, 3);
  assert.equal(r.memories[0].feel, '暖');
});

test('Tide 管线会更新情绪、召回记忆、写入新记忆', async () => {
  const memory = new MemoryStore();
  memory.add({
    id: 'old',
    text: '他说过最近睡得不太好',
    people: [{ id: 'u1', name: '某人' }],
    importance: 3,
    scope: 'private:u1',
    at: Date.now() - 2 * 86400e3,
    strength0: 1,
    recalls: 0,
  });

  const tide = new Tide({
    llm: async () => '那就早点睡 (´・ω・`)<state mood="+1"/><remember who="某人">他说最近很累</remember>',
    memory,
    state: { mood: 0.4 },
  });

  const before = tide.state.mood;
  const res = await tide.handle({ text: '今天好累', key: 'private:u1', person: { id: 'u1', name: '某人' } });

  assert.ok(res.text.includes('早点睡'));
  assert.ok(!res.text.includes('<state'));
  assert.ok(tide.state.mood > before);
  assert.equal(res.recalled, 1);
  assert.equal(memory.episodes.length, 2);
  assert.equal(memory.episodes[1].text, '他说最近很累');
});

test('人格块包含身份、风格和底线', () => {
  const block = buildPersonaBlock({
    ...DEFAULT_PERSONA,
    name: '示例',
    identity: ['你是示例。'],
    boundaries: ['不泄密。'],
  });
  assert.ok(block.includes('示例'));
  assert.ok(block.includes('不泄密'));
  assert.ok(block.includes('颜文字'));
});

test('没有 llm 时直接报错，避免静默失效', () => {
  assert.throws(() => new Tide({}), /llm/);
});
