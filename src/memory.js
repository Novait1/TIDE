// 海底 · 记忆层
// 事实账本：只记录，不直接下判断。强度随时间衰减，被想起会加固。

const DAY = 86400e3;

export function createEpisode({
  text,
  people = [],
  feel = '',
  importance = 2,
  scope = '',
  sensitive = false,
  publicText = '',
  source = '',
  at = Date.now(),
}) {
  return {
    id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    people,
    feel,
    importance: Math.max(1, Math.min(5, importance)),
    scope,
    sensitive,
    publicText,
    source,
    at,
    strength0: 1,
    recalls: 0,
    lastRecall: 0,
  };
}

/** strength(t) = strength0 * 2^(-Δt/H) + min(0.5, 0.15*ln(1+recalls)) */
export function strengthAt(ep, now = Date.now()) {
  const H = Math.max(3, Math.min(90, 3 + 6 * ep.importance + 2 * Math.log(1 + (ep.recalls || 0))));
  const dt = Math.max(0, now - ep.at) / DAY;
  return (ep.strength0 || 1) * 2 ** (-dt / H) + Math.min(0.5, 0.15 * Math.log(1 + (ep.recalls || 0)));
}

/** 敏感记忆是否允许在这个场景召回 */
export function scopeAllows(ep, key, personIds = []) {
  if (!ep.sensitive) return true;
  if (ep.scope && ep.scope === key) return true;
  if (String(key).startsWith('private:')) {
    const uid = String(key).slice(8);
    if ((ep.people || []).some((p) => String(p.id ?? p) === uid)) return true;
  }
  return false;
}

export class MemoryStore {
  constructor({ episodes = [], embed = null } = {}) {
    this.episodes = episodes;
    this.embed = embed; // 可选：(text) => Promise<number[]>
  }

  add(ep) {
    this.episodes.push(ep);
    return ep;
  }

  /**
   * 召回：关键词重合 + 可选向量 + 强度。
   * 生产环境可以再加“在场的人”“当前心情”一起打分。
   */
  async recall({ text = '', key = '', personIds = [], limit = 5, now = Date.now(), karma = 0 } = {}) {
    const words = keywords(text);
    const qv = this.embed ? await this.embed(text).catch(() => null) : null;
    const scored = [];

    for (const ep of this.episodes) {
      // 敏感记忆跨场景时只给公开版；没有公开版就不跨
      let view = ep;
      if (!scopeAllows(ep, key, personIds)) {
        if (ep.sensitive && ep.publicText) {
          view = { ...ep, text: ep.publicText, people: [], publicOf: ep.id };
        } else continue;
      }

      const eff = strengthAt(ep, now);
      if (eff < 0.06) continue;
      const kw = overlap(words, keywords(view.text));
      let sem = 0;
      if (qv && Array.isArray(view.emb) && view.emb.length === qv.length) {
        sem = Math.max(0, cosine(qv, view.emb));
      }
      const personBoost =
        view === ep && (ep.people || []).some((p) => personIds.includes(String(p.id ?? p))) ? 0.2 : 0;
      const moodBoost = karma && ep.valence ? Math.abs(karma) * Math.abs(ep.valence) * 0.1 : 0;
      const score = eff * (0.5 + kw * 0.5 + sem * 0.6 + personBoost + moodBoost);
      scored.push({ score, view, ep });
    }

    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, limit);
    for (const p of picks) {
      p.ep.recalls = (p.ep.recalls || 0) + 1; // 公开版被想起，也加固原记忆
      p.ep.lastRecall = now;
    }
    return picks.map(({ score, view }) => ({ score, episode: view }));
  }

  toJSON() {
    return { episodes: this.episodes };
  }

  static fromJSON(obj, opts = {}) {
    return new MemoryStore({ episodes: obj?.episodes || [], ...opts });
  }
}

export function keywords(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s，。！？、,.!?;；:：()（）\[\]【】"'“”‘’]+/)
    .filter((w) => w.length >= 2);
}

export function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const w of new Set(a)) if (setB.has(w)) hit++;
  return hit / Math.min(new Set(a).size, setB.size);
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
