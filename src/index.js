// 潮汐 · TIDE —— 把人格、情绪、好感、记忆、名单串成一条消息管线。

import { DEFAULT_STATE, deriveMood, decay, applyDeltas, clamp01 } from './mood.js';
import { MemoryStore, createEpisode } from './memory.js';
import { DEFAULT_PERSONA, buildPersonaBlock } from './persona.js';
import { replyChance, canInitiate } from './policy.js';

export { DEFAULT_STATE, deriveMood, decay, applyDeltas, clamp01 };
export { MemoryStore, createEpisode };
export { DEFAULT_PERSONA, buildPersonaBlock };
export { replyChance, canInitiate };

export class Tide {
  /**
   * @param {object} opts
   * @param {object} opts.llm        (prompt, ctx) => Promise<string>
   * @param {object} opts.persona    人格配置
   * @param {MemoryStore} opts.memory
   * @param {object} opts.state      初始状态
   * @param {() => number} opts.now  可注入时钟
   * @param {(date:Date)=>boolean} opts.awake 是否醒着（影响精力）
   */
  constructor({
    llm,
    persona = DEFAULT_PERSONA,
    memory = new MemoryStore(),
    state = {},
    now = () => Date.now(),
    awake = () => {
      const h = new Date().getHours();
      return h >= 7 && h < 23;
    },
  } = {}) {
    if (typeof llm !== 'function') throw new Error('Tide 需要一个 llm(prompt) 函数');
    this.llm = llm;
    this.persona = persona;
    this.memory = memory;
    this.state = { ...DEFAULT_STATE, ...state, updated: state.updated || now() };
    this.now = now;
    this.awake = awake;
  }

  get mood() {
    return deriveMood(this.state);
  }

  /** 让时间流逝到当下 */
  tick() {
    const now = this.now();
    const hours = Math.max(0, (now - (this.state.updated || now)) / 3600e3);
    decay(this.state, { hours, awake: this.awake(new Date(now)) });
    this.state.updated = now;
    return this.state;
  }

  /**
   * 一条消息进来：情绪衰减 → 召回 → 拼提示 → 调模型 → 落状态和记忆。
   * 名单/额度不在这里拦，交给 policy.canInitiate 在发起侧判断。
   */
  async handle({ text = '', key = '', person = null, fromOwner = false, isGroup = false } = {}) {
    this.tick();
    const now = this.now();
    const derived = this.mood;

    const recalled = await this.memory.recall({
      text,
      key,
      personIds: person ? [String(person.id)] : [],
      now,
      karma: derived.irritability - 0.3,
    });

    const prompt = [
      buildPersonaBlock(this.persona),
      moodBlock(this.state, derived, person, fromOwner),
      memoryBlock(recalled),
      `【当前消息】\n${text}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const raw = await this.llm(prompt, { key, person, isGroup, fromOwner });
    const { text: reply, deltas, memories } = parseTags(String(raw || ''));

    if (deltas) applyDeltas(this.state, deltas);
    for (const m of memories) {
      this.memory.add(
        createEpisode({
          ...m,
          scope: key,
          source: 'chat',
          at: now,
        })
      );
    }
    this.tick();
    return { text: reply, mood: this.mood, recalled: recalled.length };
  }
}

function moodBlock(s, d, person, fromOwner) {
  const parts = [
    `【此刻】社交电量 ${pct(d.social)}，烦躁 ${pct(d.irritability)}，依恋 ${pct(d.attachment)}。`,
  ];
  if (s.hunger > 0.65) parts.push('肚子饿了。');
  if (s.thirst > 0.65) parts.push('有点渴。');
  if (s.energy < 0.3) parts.push('有点累。');
  if (person) {
    const w = Math.round(((person.warmth ?? 0) + 1) / 2 * 100);
    parts.push(`【对眼前这个人】好感约 ${w}/100${(person.resentment ?? 0) > 0.35 ? '，心里还有点堵' : ''}。`);
  }
  if (fromOwner) parts.push('这是自己人，不用端着。');
  parts.push('按这个感觉说话，别解释状态。');
  return parts.join('\n');
}

function memoryBlock(recalled) {
  if (!recalled?.length) return '';
  return `【想起】\n${recalled
    .map(({ episode }) => `- ${episode.text}${episode.feel ? `（${episode.feel}）` : ''}`)
    .join('\n')}`;
}

const pct = (v) => Math.round(clamp01(v) * 100);

/** 解析模型回复里的隐藏标记：<state .../> 和 <remember ...>...</remember> */
export function parseTags(text) {
  let out = String(text || '');
  let deltas = null;
  const memories = [];

  const sm = out.match(/<state\b([^>]*?)\/?>/i);
  if (sm) {
    deltas = {};
    for (const key of ['mood', 'energy', 'clingy', 'grudge', 'affection', 'hunger', 'thirst']) {
      const m = sm[1].match(new RegExp(`${key}\\s*=\\s*"?([+-]?\\d+(?:\\.\\d+)?)"?`, 'i'));
      if (m) deltas[key] = Number(m[1]);
    }
    if (!Object.keys(deltas).length) deltas = null;
    else out = out.replace(sm[0], '');
  }

  out = out.replace(/<remember\b([^>]*)>([\s\S]*?)<\/remember>/gi, (_, attrs, body) => {
    const attr = (name) => (attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || [])[1] || '';
    const people = attr('who');
    const weight = Number(attr('weight')) || 2;
    memories.push({
      text: body.trim(),
      feel: attr('feel'),
      importance: weight,
      sensitive: /sensitive\s*=\s*"?true"?/i.test(attrs),
      publicText: attr('public'),
      people: people ? [{ id: people, name: people }] : [],
    });
    return '';
  });

  return { text: out.replace(/\n{3,}/g, '\n\n').trim(), deltas, memories };
}
