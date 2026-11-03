// 最小示例：不需要真实 LLM，也能看到四层怎么一起工作。
import { Tide, MemoryStore, DEFAULT_PERSONA, deriveMood } from '../src/index.js';

const llm = async (prompt) => {
  // 假装模型：看到“累”就安慰一句，并给情绪一个很小的正向增量。
  const tired = /累|困|难受/.test(prompt);
  const text = tired ? '那就先歇会儿，别硬撑 (´・ω・`)' : '我在听，你慢慢说。';
  return tired ? `${text}<state mood="+1" clingy="+1"/>` : text;
};

const memory = new MemoryStore();
memory.add({
  id: 'demo-1',
  text: '他说过最近睡得不太好',
  people: [{ id: 'demo', name: '某人' }],
  feel: '平静',
  importance: 3,
  sensitive: false,
  scope: 'private:demo',
  at: Date.now() - 5 * 86400e3,
  strength0: 1,
  recalls: 0,
});

const tide = new Tide({
  llm,
  persona: {
    ...DEFAULT_PERSONA,
    name: '示例 bot',
    identity: ['你是示例 bot，一个普通人。', '你不是别的 bot。'],
  },
  memory,
  state: { mood: 0.5, energy: 0.4, clingy: 0.6, grudge: 0.2 },
});

const res = await tide.handle({
  text: '今天好累',
  key: 'private:demo',
  person: { id: 'demo', name: '某人', warmth: 0.3, resentment: 0 },
  fromOwner: true,
});

console.log('回复：', res.text);
console.log('召回记忆条数：', res.recalled);
console.log('派生情绪：', deriveMood(tide.state));
