import test from 'node:test';
import assert from 'node:assert/strict';
import { replyChance, createLists, updateLists, canInitiate } from '../src/policy.js';

const now = Date.parse('2026-11-03T12:00:00Z');

test('接话概率被夹在 2%~45%', () => {
  assert.equal(replyChance(10, { attachment: 0, social: 0, irritability: 1 }), 2);
  assert.equal(replyChance(30, { attachment: 1, social: 1, irritability: 0 }), 45);
  // 同样的基础概率：依恋/电量抬高、烦躁压低
  const low = replyChance(10, { attachment: 0.2, social: 0.2, irritability: 0.8 });
  const high = replyChance(10, { attachment: 0.9, social: 0.9, irritability: 0.05 });
  assert.ok(high > low);
});

test('黑名单需要好感低且持续够久，不因一句话触发', () => {
  const lists = createLists();
  const person = { id: 'u1', warmth: -0.8, msgs: 20, lowSince: now - 3600e3 };
  assert.deepEqual(updateLists({ person, lists, now }), []);
  assert.equal(lists.isBlocked('u1'), false);

  person.lowSince = now - 13 * 3600e3;
  assert.deepEqual(updateLists({ person, lists, now }), ['block']);
  assert.equal(lists.isBlocked('u1'), true);

  person.warmth = -0.1;
  assert.deepEqual(updateLists({ person, lists, now }), ['release']);
  assert.equal(lists.isBlocked('u1'), false);
});

test('亲近名单要好感稳定够久，掉回阈值立刻出', () => {
  const lists = createLists();
  const person = { id: 'u2', warmth: 0.7, msgs: 10, highSince: now - 3600e3 };
  assert.deepEqual(updateLists({ person, lists, now }), []);
  person.highSince = now - 25 * 3600e3;
  assert.deepEqual(updateLists({ person, lists, now }), ['favorite']);
  assert.equal(lists.isFavorite('u2'), true);
  person.warmth = 0.3;
  assert.deepEqual(updateLists({ person, lists, now }), ['unfavorite']);
  assert.equal(lists.isFavorite('u2'), false);
});

test('主动私聊总闸：黑名单、额度、冷却、连两次不回', () => {
  const lists = createLists();
  const person = { id: 'u3' };
  assert.equal(canInitiate({ person, lists, quota: {}, now }).allowed, true);

  lists.addBlacklist('u3', { text: 'test', at: now });
  assert.equal(canInitiate({ person, lists, quota: {}, now }).reason, 'blacklist');
  lists.removeBlacklist('u3');

  assert.equal(canInitiate({ person, lists, quota: { sentToday: 9, maxPerDay: 6 }, now }).reason, 'daily-cap');
  assert.equal(
    canInitiate({ person, lists, quota: { lastSentAt: now - 60e3, cooldownMs: 30 * 60e3 }, now }).reason,
    'cooldown'
  );
  assert.equal(
    canInitiate({ person, lists, quota: { missed: 2, lastMissAt: now - 86400e3 }, now }).reason,
    'no-reply-twice'
  );
  assert.equal(canInitiate({ person, lists, quota: { missed: 2, lastMissAt: now - 4 * 86400e3 }, now }).allowed, true);
});
