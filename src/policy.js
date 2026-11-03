// 航道 · 名单层
// 离散承诺：滞后、可解释，不跟当下情绪走。

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 情绪只改“说不说、说多少”，不改名单 */
export function replyChance(basePercent, derived) {
  const pct =
    basePercent +
    (derived.attachment - 0.5) * 24 +
    (derived.social - 0.5) * 16 -
    derived.irritability * 14;
  return Math.round(clamp(pct, 2, 45));
}

/**
 * 名单只读长期好感：
 * - 进黑名单：好感低 + 持续够久 + 聊过足够多
 * - 出黑名单：好感回升，或过了一段时间
 * - 进亲近名单：好感稳定高于阈值
 */
export function updateLists({ person, lists, config = {}, now = Date.now() }) {
  const c = {
    blockBelow: -0.65,
    blockHoldMs: 12 * 3600e3,
    blockMinMsgs: 12,
    releaseAbove: -0.2,
    releaseAfterMs: 12 * 3600e3,
    favoriteAbove: 0.6,
    favoriteHoldMs: 24 * 3600e3,
    ...config,
  };
  const reasons = [];
  const inBlacklist = lists.blacklist.has(person.id);
  const inFavorites = lists.favorites.has(person.id);

  if (!inBlacklist && person.warmth < c.blockBelow && person.msgs >= c.blockMinMsgs) {
    if (now - (person.lowSince || now) >= c.blockHoldMs) {
      lists.addBlacklist(person.id, reason(`好感 ${person.warmth.toFixed(2)}，持续 ${c.blockHoldMs / 3600e3}h`));
      reasons.push('block');
    }
  }
  if (inBlacklist && (person.warmth >= c.releaseAbove || now - (person.blockedAt || now) >= c.releaseAfterMs)) {
    lists.removeBlacklist(person.id, '好感回升或时间到了');
    reasons.push('release');
  }
  if (!inFavorites && person.warmth >= c.favoriteAbove) {
    if (now - (person.highSince || now) >= c.favoriteHoldMs) {
      lists.addFavorite(person.id, reason(`好感稳在 ${c.favoriteAbove} 以上`));
      reasons.push('favorite');
    }
  }
  if (inFavorites && person.warmth < c.favoriteAbove) {
    lists.removeFavorite(person.id, '好感掉回阈值以下');
    reasons.push('unfavorite');
  }
  return reasons;
}

const reason = (text) => ({ text, at: Date.now() });

export function createLists() {
  const map = () => new Map();
  const blacklist = map();
  const favorites = map();
  return {
    blacklist,
    favorites,
    addBlacklist(id, why) {
      blacklist.set(String(id), why);
    },
    removeBlacklist(id) {
      blacklist.delete(String(id));
    },
    addFavorite(id, why) {
      favorites.set(String(id), why);
    },
    removeFavorite(id) {
      favorites.delete(String(id));
    },
    isBlocked(id) {
      return blacklist.has(String(id));
    },
    isFavorite(id) {
      return favorites.has(String(id));
    },
  };
}

/** 主动私聊的总闸：名单 + 额度 + 冷却 */
export function canInitiate({ person, lists, quota = {}, now = Date.now() }) {
  if (!person) return { allowed: false, reason: 'no-person' };
  if (lists.isBlocked(person.id)) return { allowed: false, reason: 'blacklist' };
  if (quota.sentToday >= (quota.maxPerDay ?? 6)) return { allowed: false, reason: 'daily-cap' };
  if (quota.lastSentAt && now - quota.lastSentAt < (quota.cooldownMs ?? 30 * 60e3)) {
    return { allowed: false, reason: 'cooldown' };
  }
  if ((quota.missed ?? 0) >= 2 && now - (quota.lastMissAt || 0) < 3 * 86400e3) {
    return { allowed: false, reason: 'no-reply-twice' };
  }
  return { allowed: true };
}
