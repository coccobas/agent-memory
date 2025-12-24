/**
 * Prometheus Metrics Utility
 *
 * Provides lightweight Prometheus-compatible metrics collection without
 * external dependencies. Supports counters, gauges, and histograms.
 *
 * Metrics are exposed in Prometheus text format at /metrics endpoint.
 *
 * Usage:
 *   import { metrics } from './metrics.js';
 *
 *   // Counter
 *   metrics.counter('requests_total', 'Total requests').inc();
 *   metrics.counter('requests_total').inc({ method: 'GET', status: '200' });
 *
 *   // Gauge
 *   metrics.gauge('active_connections', 'Active connections').set(5);
 *
 *   // Histogram
 *   const timer = metrics.histogram('request_duration_seconds', 'Request duration').startTimer();
 *   // ... do work ...
 *   timer.end({ method: 'GET' });
 */

import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('metrics');

// =============================================================================
// TYPES
// =============================================================================

export interface Labels {
  [key: string]: string;
}

export interface MetricOptions {
  help: string;
  labelNames?: string[];
  buckets?: number[]; // For histograms only
}

interface MetricValue {
  value: number;
  labels: Labels;
  timestamp?: number;
}

interface HistogramValue {
  buckets: Map<number, number>;
  sum: number;
  count: number;
  labels: Labels;
}

type MetricType = 'counter' | 'gauge' | 'histogram';

// =============================================================================
// METRIC CLASSES
// =============================================================================

/**
 * Base metric class
 */
abstract class Metric {
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];
  abstract readonly type: MetricType;

  constructor(name: string, options: MetricOptions) {
    this.name = name;
    this.help = options.help;
    this.labelNames = options.labelNames ?? [];
  }

  protected labelsToKey(labels: Labels): string {
    if (Object.keys(labels).length === 0) return '';
    const sorted = Object.entries(labels)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${sorted}}`;
  }

  protected formatLabels(labels: Labels): string {
    if (Object.keys(labels).length === 0) return '';
    const formatted = Object.entries(labels)
      .map(([k, v]) => `${k}="${this.escapeLabel(v)}"`)
      .join(',');
    return `{${formatted}}`;
  }

  protected escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  abstract format(): string;
  abstract reset(): void;
}

/**
 * Counter metric - can only increase
 */
export class Counter extends Metric {
  readonly type = 'counter' as const;
  private values: Map<string, MetricValue> = new Map();

  inc(labels: Labels = {}, value: number = 1): void {
    if (value < 0) {
      logger.warn({ metric: this.name, value }, 'Counter cannot be decremented');
      return;
    }
    const key = this.labelsToKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { value, labels });
    }
  }

  get(labels: Labels = {}): number {
    const key = this.labelsToKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  format(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    for (const [, mv] of this.values) {
      lines.push(`${this.name}${this.formatLabels(mv.labels)} ${mv.value}`);
    }
    return lines.join('\n');
  }

  reset(): void {
    this.values.clear();
  }
}

/**
 * Gauge metric - can increase or decrease
 */
export class Gauge extends Metric {
  readonly type = 'gauge' as const;
  private values: Map<string, MetricValue> = new Map();

  set(value: number, labels: Labels = {}): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, { value, labels });
  }

  inc(labels: Labels = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { value, labels });
    }
  }

  dec(labels: Labels = {}, value: number = 1): void {
    this.inc(labels, -value);
  }

  get(labels: Labels = {}): number {
    const key = this.labelsToKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  format(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);
    for (const [, mv] of this.values) {
      lines.push(`${this.name}${this.formatLabels(mv.labels)} ${mv.value}`);
    }
    return lines.join('\n');
  }

  reset(): void {
    this.values.clear();
  }
}

/**
 * Histogram metric - tracks distributions
 */
export class Histogram extends Metric {
  readonly type = 'histogram' as const;
  private readonly buckets: number[];
  private values: Map<string, HistogramValue> = new Map();

  constructor(name: string, options: MetricOptions) {
    super(name, options);
    // Default buckets suitable for latency in seconds
    this.buckets = options.buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  observe(value: number, labels: Labels = {}): void {
    const key = this.labelsToKey(labels);
    let hv = this.values.get(key);
    if (!hv) {
      hv = {
        buckets: new Map(this.buckets.map((b) => [b, 0])),
        sum: 0,
        count: 0,
        labels,
      };
      this.values.set(key, hv);
    }

    hv.sum += value;
    hv.count++;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        hv.buckets.set(bucket, (hv.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }

  startTimer(labels: Labels = {}): { end: (endLabels?: Labels) => number } {
    const start = process.hrtime.bigint();
    return {
      end: (endLabels?: Labels) => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e9; // Convert to seconds
        this.observe(elapsed, { ...labels, ...endLabels });
        return elapsed;
      },
    };
  }

  format(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);

    for (const [, hv] of this.values) {
      const labelStr = this.formatLabels(hv.labels);
      const labelPrefix = labelStr ? labelStr.slice(0, -1) + ',' : '{';

      // Bucket values (cumulative)
      let cumulative = 0;
      for (const bucket of this.buckets) {
        cumulative += hv.buckets.get(bucket) ?? 0;
        const bucketLabel = `${labelPrefix}le="${bucket}"}`;
        lines.push(`${this.name}_bucket${bucketLabel} ${cumulative}`);
      }
      // +Inf bucket
      const infLabel = `${labelPrefix}le="+Inf"}`;
      lines.push(`${this.name}_bucket${infLabel} ${hv.count}`);

      // Sum and count
      lines.push(`${this.name}_sum${labelStr} ${hv.sum}`);
      lines.push(`${this.name}_count${labelStr} ${hv.count}`);
    }
    return lines.join('\n');
  }

  reset(): void {
    this.values.clear();
  }
}

// =============================================================================
// METRICS REGISTRY
// =============================================================================

/**
 * Central metrics registry
 */
export class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  /**
   * Get or create a counter
   */
  counter(name: string, helpOrOptions?: string | MetricOptions): Counter {
    let counter = this.counters.get(name);
    if (!counter) {
      const options =
        typeof helpOrOptions === 'string'
          ? { help: helpOrOptions }
          : (helpOrOptions ?? { help: '' });
      counter = new Counter(name, options);
      this.counters.set(name, counter);
    }
    return counter;
  }

  /**
   * Get or create a gauge
   */
  gauge(name: string, helpOrOptions?: string | MetricOptions): Gauge {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      const options =
        typeof helpOrOptions === 'string'
          ? { help: helpOrOptions }
          : (helpOrOptions ?? { help: '' });
      gauge = new Gauge(name, options);
      this.gauges.set(name, gauge);
    }
    return gauge;
  }

  /**
   * Get or create a histogram
   */
  histogram(name: string, helpOrOptions?: string | MetricOptions): Histogram {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      const options =
        typeof helpOrOptions === 'string'
          ? { help: helpOrOptions }
          : (helpOrOptions ?? { help: '' });
      histogram = new Histogram(name, options);
      this.histograms.set(name, histogram);
    }
    return histogram;
  }

  /**
   * Format all metrics in Prometheus text format
   */
  format(): string {
    const parts: string[] = [];

    // Add default process metrics
    parts.push(this.formatProcessMetrics());

    // Add custom metrics
    for (const counter of this.counters.values()) {
      parts.push(counter.format());
    }
    for (const gauge of this.gauges.values()) {
      parts.push(gauge.format());
    }
    for (const histogram of this.histograms.values()) {
      parts.push(histogram.format());
    }

    return parts.filter((p) => p.length > 0).join('\n\n');
  }

  /**
   * Format process-level metrics
   */
  private formatProcessMetrics(): string {
    const lines: string[] = [];
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    lines.push('# HELP process_heap_bytes Process heap size in bytes');
    lines.push('# TYPE process_heap_bytes gauge');
    lines.push(`process_heap_bytes ${mem.heapUsed}`);

    lines.push('');
    lines.push('# HELP process_heap_total_bytes Process total heap size in bytes');
    lines.push('# TYPE process_heap_total_bytes gauge');
    lines.push(`process_heap_total_bytes ${mem.heapTotal}`);

    lines.push('');
    lines.push('# HELP process_rss_bytes Process resident set size in bytes');
    lines.push('# TYPE process_rss_bytes gauge');
    lines.push(`process_rss_bytes ${mem.rss}`);

    lines.push('');
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${uptime}`);

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }
    for (const gauge of this.gauges.values()) {
      gauge.reset();
    }
    for (const histogram of this.histograms.values()) {
      histogram.reset();
    }
  }

  /**
   * Get summary of registered metrics
   */
  getSummary(): { counters: number; gauges: number; histograms: number } {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const metrics = new MetricsRegistry();

// =============================================================================
// PRE-DEFINED APPLICATION METRICS
// =============================================================================

// Request metrics
export const requestCounter = metrics.counter('agentmem_requests_total', {
  help: 'Total number of requests',
  labelNames: ['method', 'handler', 'status'],
});

export const requestDuration = metrics.histogram('agentmem_request_duration_seconds', {
  help: 'Request duration in seconds',
  labelNames: ['method', 'handler'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// Database metrics
export const dbQueryCounter = metrics.counter('agentmem_db_queries_total', {
  help: 'Total number of database queries',
  labelNames: ['operation', 'table'],
});

export const dbQueryDuration = metrics.histogram('agentmem_db_query_duration_seconds', {
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

export const dbPoolGauge = metrics.gauge('agentmem_db_pool_connections', {
  help: 'Database connection pool status',
  labelNames: ['state'], // idle, active, waiting
});

// Embedding metrics
export const embeddingCounter = metrics.counter('agentmem_embeddings_total', {
  help: 'Total number of embedding operations',
  labelNames: ['provider', 'status'],
});

export const embeddingDuration = metrics.histogram('agentmem_embedding_duration_seconds', {
  help: 'Embedding generation duration in seconds',
  labelNames: ['provider'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

// Cache metrics
export const cacheGauge = metrics.gauge('agentmem_cache_entries', {
  help: 'Number of entries in cache',
  labelNames: ['cache_type'],
});

export const cacheHitCounter = metrics.counter('agentmem_cache_hits_total', {
  help: 'Cache hit count',
  labelNames: ['cache_type'],
});

export const cacheMissCounter = metrics.counter('agentmem_cache_misses_total', {
  help: 'Cache miss count',
  labelNames: ['cache_type'],
});

// Circuit breaker metrics
export const circuitBreakerGauge = metrics.gauge('agentmem_circuit_breaker_state', {
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'],
});

// Dead letter queue metrics
export const dlqGauge = metrics.gauge('agentmem_dlq_entries', {
  help: 'Number of entries in dead letter queue',
  labelNames: ['type', 'operation'],
});

export const dlqRetryCounter = metrics.counter('agentmem_dlq_retries_total', {
  help: 'Total DLQ retry attempts',
  labelNames: ['type', 'status'],
});

// Error metrics
export const errorCounter = metrics.counter('agentmem_errors_total', {
  help: 'Total number of errors',
  labelNames: ['code', 'component'],
});
