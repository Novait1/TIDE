import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, deriveMood, decay, applyDeltas } from '../src/mood.js';

const keys = ['mood', 'energy', 'clingy', 'hunger', 'thirst', 'grudge', 'affection'];

test('派生值永远在 0~1 且有界', () => {
  for (let i = 0; i < 5000; i++) {
    const s = {};
    for (const k of keys) s[k] = Math.random();
    const d = deriveMood(s);
    for (const v of Object.values(d)) {
      assert.ok(Number.isFinite(v), `非有限值: ${v}`);
      assert.ok(v >= 0 && v <= 1, `越界: ${v}`);
    }
  }
});

test('中等坏状态不会把烦躁顶满', () => {
  const d = deriveMood({ mood: 0.4, energy: 0.5, clingy: 0.5, hunger: 0.5, thirst: 0.5, grudge: 0.4, affection: 0.5 });
  assert.ok(d.irritability < 0.6, `烦躁过高: ${d.irritability}`);
});

test('累但开心时，依恋反而更高', () => {
  const base = { ...DEFAULT_STATE, mood: 0.9, affection: 0.8, clingy: 0.7, energy: 0.8 };
  const tired = { ...base, energy: 0.1 };
  assert.ok(deriveMood(tired).attachment > deriveMood(base).attachment);
});

test('时间流逝后所有字段仍在范围内', () => {
  const s = { ...DEFAULT_STATE, updated: 0 };
  for (const hours of [0.1, 1, 8, 24, 48]) {
    const cur = { ...s, updated: 0 };
    decay(cur, { hours, awake: hours < 12 });
    for (const k of keys) {
      assert.ok(Number.isFinite(cur[k]), `${k} 非有限`);
      assert.ok(cur[k] >= 0 && cur[k] <= 1, `${k} 越界: ${cur[k]}`);
    }
  }
});

test('状态标记不超过单次 ±3 的缩放', () => {
  const s = { ...DEFAULT_STATE };
  applyDeltas(s, { mood: 99, grudge: -99 });
  for (const k of keys) assert.ok(s[k] >= 0 && s[k] <= 1);
});
