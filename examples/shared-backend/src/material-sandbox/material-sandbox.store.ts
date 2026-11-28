/**
 * L3 沙箱文档的内存 LRU（base-screen-docs ADR-0118 §4）：按内容哈希寻址，示例后端用内存存储，
 * 不落盘、不持久化——重启即丢，前端按 ADR-0117 的约定重新 PUT 即可（文档对每个包恒定，宿主随时
 * 能重算）。容量与过期两条线都够才留：64 份 / 共 64MB / 24 小时未访问即逐出。
 */

interface SandboxDocumentEntry {
  readonly html: string;
  readonly csp: string;
  readonly bytes: number;
  storedAt: number;
}

const MAX_ENTRIES = 64;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_AGE_MS = 24 * 60 * 60 * 1000;

export class MaterialSandboxStore {
  // Map 的插入顺序即最近使用顺序：命中时重新 `set` 一次把它移到最后。
  readonly #entries = new Map<string, SandboxDocumentEntry>();
  #totalBytes = 0;

  /** 存一份文档；覆盖同哈希的旧值（哈希即内容，正常不会出现内容不同但哈希相同）。 */
  put(hash: string, html: string, csp: string): void {
    this.#evictExpired();
    const bytes = Buffer.byteLength(html, 'utf8');
    const existing = this.#entries.get(hash);
    if (existing !== undefined) this.#totalBytes -= existing.bytes;
    this.#entries.delete(hash);
    this.#entries.set(hash, { html, csp, bytes, storedAt: Date.now() });
    this.#totalBytes += bytes;
    this.#evictOverCapacity();
  }

  /** 取一份文档；命中时刷新访问时间并移到 LRU 末尾。 */
  get(hash: string): SandboxDocumentEntry | undefined {
    this.#evictExpired();
    const entry = this.#entries.get(hash);
    if (entry === undefined) return undefined;
    entry.storedAt = Date.now();
    this.#entries.delete(hash);
    this.#entries.set(hash, entry);
    return entry;
  }

  has(hash: string): boolean {
    return this.get(hash) !== undefined;
  }

  #evictExpired(): void {
    const cutoff = Date.now() - MAX_ENTRY_AGE_MS;
    for (const [hash, entry] of this.#entries) {
      if (entry.storedAt >= cutoff) break; // Map 按插入顺序迭代，最旧的在前。
      this.#totalBytes -= entry.bytes;
      this.#entries.delete(hash);
    }
  }

  #evictOverCapacity(): void {
    for (const [hash, entry] of this.#entries) {
      if (this.#entries.size <= MAX_ENTRIES && this.#totalBytes <= MAX_TOTAL_BYTES) break;
      this.#totalBytes -= entry.bytes;
      this.#entries.delete(hash);
    }
  }
}
