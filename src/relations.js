// 岸 · 好感层
// 慢变量：天到周级别，按人记账。跟全局 affection 分开。

const DAY = 86400e3;
const RESENTMENT_HALF_LIFE_DAYS = 7;

export function defaultRelation(id, name = '') {
  return {
    id: String(id),
    name,
    warmth: 0, // 长期好感 -1 ~ 1
    resentment: 0, // 芥蒂 0 ~ 1，只对这个人
    msgs: 0,
    lastSeen: 0,
    lastChanged: 0,
  };
}

/** 芥蒂按半衰期慢慢消 */
export function decayRelation(rel, hours) {
  const k = Math.LN2 / (RESENTMENT_HALF_LIFE_DAYS * 24);
  rel.resentment = Math.max(0, rel.resentment * Math.exp(-k * hours));
  return rel;
}

/** 一次互动：夸/骂/普通聊天都可以折算成小增量 */
export function applyRelationEvent(rel, { warmth = 0, resentment = 0, now = Date.now() } = {}) {
  rel.warmth = Math.max(-1, Math.min(1, rel.warmth + warmth));
  rel.resentment = Math.max(0, Math.min(1, rel.resentment + resentment));
  rel.msgs += 1;
  rel.lastSeen = now;
  rel.lastChanged = now;
  return rel;
}

/** 对眼前这个人的态度：先看芥蒂，再看好感 */
export function relationAttitude(rel) {
  if (!rel) return '平常';
  if (rel.resentment > 0.35) return '心里有芥蒂';
  if (rel.warmth > 0.5) return '亲近';
  if (rel.warmth < -0.3) return '不太想理';
  return '平常';
}
