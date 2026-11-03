// 浪 · 情绪层
// 快变量：分钟到小时级别，会自己回基线。所有字段都在 0~1。

export const DEFAULT_STATE = {
  mood: 0.6, // 0 很差 … 1 很好
  energy: 0.7, // 精力
  clingy: 0.5, // 黏人
  hunger: 0.25, // 饿
  thirst: 0.25, // 渴
  grudge: 0, // 委屈/闷气（对当下的底色，不是对某个人）
  affection: 0.55, // 全局好感：决定主不主动
  updated: 0,
};

export const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));

/**
 * 把原始状态揉成三个行为出口。
 * 权重归一到 1：单值中等时不会叠到顶。
 */
export function deriveMood(s) {
  return {
    social: clamp01(s.energy * 0.7 + s.mood * 0.3),
    irritability: clamp01(
      s.grudge * 0.45 +
        s.hunger * 0.15 +
        s.thirst * 0.1 +
        (1 - s.mood) * 0.2 +
        (1 - s.energy) * 0.1
    ),
    attachment: clamp01(
      s.affection * 0.45 + s.clingy * 0.45 + (1 - s.energy) * 0.1
    ),
  };
}

/**
 * 时间流逝。hours 是距上次更新的小时数。
 * 生产环境建议按小时切片调用，避免跨昼夜时用同一个 awake 值。
 */
export function decay(s, { hours, awake = true } = {}) {
  const h = Math.max(0, Math.min(48, hours || 0));
  if (h <= 0.002) return s;

  s.energy = clamp01(s.energy - (awake ? 0.015 : 0.09) * h);
  if (awake) s.energy = clamp01(s.energy + (0.7 - s.energy) * Math.min(1, 0.12 * h));

  s.hunger = clamp01(s.hunger + 0.07 * h);
  s.thirst = clamp01(s.thirst + 0.09 * h);

  s.mood = clamp01(
    s.mood -
      (s.hunger * 0.006 + s.thirst * 0.004 + s.grudge * 0.008) * h -
      (s.energy < 0.2 ? 0.004 * h : 0)
  );
  s.energy = clamp01(s.energy - (s.hunger * 0.004 + s.thirst * 0.003) * h);

  s.mood = clamp01(s.mood + (0.55 - s.mood) * Math.min(1, 0.16 * h));
  s.clingy = clamp01(s.clingy + (0.5 - s.clingy) * Math.min(1, 0.2 * h));
  s.grudge = clamp01(s.grudge * Math.exp(-0.07 * h));
  s.affection = clamp01(s.affection + (0.55 - s.affection) * Math.min(1, 0.01 * h));

  // updated 由调用方设置，方便注入时钟/回放
  return s;
}

const DELTA_SCALE = {
  mood: 0.05,
  clingy: 0.05,
  grudge: 0.08,
  affection: 0.03,
  energy: 0.03,
  hunger: 0.07,
  thirst: 0.07,
};

/** 模型在回复里带的隐藏状态标记，例如 <state mood="+1" grudge="-2"/> */
export function applyDeltas(s, deltas, scale = DELTA_SCALE) {
  for (const [k, v] of Object.entries(deltas || {})) {
    if (!(k in scale) || !Number.isFinite(Number(v))) continue;
    const n = Math.max(-3, Math.min(3, Number(v)));
    s[k] = clamp01(s[k] + n * scale[k]);
  }
  return s;
}
