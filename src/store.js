// 极简 JSON 持久化。生产环境可以换成数据库，只要实现 load/save。
import fs from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  load(fallback = null) {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  save(obj) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, this.file); // 原子替换，避免写一半被杀
  }
}
