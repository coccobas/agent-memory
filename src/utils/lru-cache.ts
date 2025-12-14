export interface LRUCacheOptions {
    maxSize: number;
    maxMemoryMB?: number; // Optional memory limit
    ttlMs?: number;       // Optional Time To Live
    onEvict?: (key: string, value: unknown) => void;
}

interface CacheEntry<T> {
    value: T;
    size: number;
    timestamp: number;
}

export class LRUCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private readonly maxSize: number;
    private readonly maxMemoryMB?: number;
    private readonly ttlMs?: number;
    private readonly onEvict?: (key: string, value: unknown) => void;

    constructor(options: LRUCacheOptions) {
        this.maxSize = options.maxSize;
        this.maxMemoryMB = options.maxMemoryMB;
        this.ttlMs = options.ttlMs;
        this.onEvict = options.onEvict;
    }

    set(key: string, value: T): void {
        // If updating existing, delete first to refresh position (LRU)
        if (this.cache.has(key)) {
            this.delete(key);
        }

        const entry: CacheEntry<T> = {
            value,
            size: this.estimateSize(value),
            timestamp: Date.now()
        };

        // Check memory pressure before adding
        if (this.checkMemoryPressure()) {
            this.evictBatch(0.1); // Evict 10% if under pressure
        }

        this.cache.set(key, entry);
        this.evictToLimits();
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        // Check TTL
        if (this.ttlMs && (Date.now() - entry.timestamp > this.ttlMs)) {
            this.delete(key);
            return undefined;
        }

        // Refresh position (LRU)
        this.cache.delete(key);
        this.cache.set(key, entry);

        return entry.value;
    }

    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        if (this.ttlMs && (Date.now() - entry.timestamp > this.ttlMs)) {
            this.delete(key);
            return false;
        }

        return true;
    }

    delete(key: string): boolean {
        const entry = this.cache.get(key);
        if (entry) {
            this.onEvict?.(key, entry.value);
            return this.cache.delete(key);
        }
        return false;
    }

    clear(): void {
        if (this.onEvict) {
            for (const [key, entry] of this.cache) {
                this.onEvict(key, entry.value);
            }
        }
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }

    get stats(): { size: number; memoryMB: number } {
        return {
            size: this.size,
            memoryMB: this.calculateTotalMemoryMB()
        };
    }

    private estimateSize(value: unknown): number {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 100; // Fallback estimate
        }
    }

    private calculateTotalMemoryMB(): number {
        let totalBytes = 0;
        for (const entry of this.cache.values()) {
            totalBytes += entry.size;
        }
        return totalBytes / 1024 / 1024;
    }

    private evictToLimits(): void {
        // Evict by size
        while (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.delete(firstKey);
            else break;
        }

        // Evict by memory if set
        if (this.maxMemoryMB) {
            while (this.calculateTotalMemoryMB() > this.maxMemoryMB && this.cache.size > 0) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey) this.delete(firstKey);
                else break;
            }
        }
    }

    private checkMemoryPressure(): boolean {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        const heapTotalMB = usage.heapTotal / 1024 / 1024;
        return (heapUsedMB / heapTotalMB) > 0.85; // 85% threshold
    }

    private evictBatch(percentage: number): void {
        const targetSize = Math.floor(this.cache.size * (1 - percentage));
        while (this.cache.size > targetSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.delete(firstKey);
            else break;
        }
    }
}
