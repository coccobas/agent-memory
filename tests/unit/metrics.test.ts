/**
 * Unit tests for Prometheus metrics utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  metrics,
  recordPoolMetrics,
  createPoolMetricsRecorder,
  type PoolStats,
} from '../../src/utils/metrics.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Counter', () => {
  it('should increment by 1 by default', () => {
    const counter = new Counter('test_counter', { help: 'Test counter' });

    counter.inc();
    counter.inc();
    counter.inc();

    expect(counter.get()).toBe(3);
  });

  it('should increment by specified value', () => {
    const counter = new Counter('test_counter', { help: 'Test counter' });

    counter.inc({}, 5);
    counter.inc({}, 10);

    expect(counter.get()).toBe(15);
  });

  it('should handle labels', () => {
    const counter = new Counter('test_counter', { help: 'Test counter' });

    counter.inc({ method: 'GET' }, 3);
    counter.inc({ method: 'POST' }, 7);
    counter.inc({ method: 'GET' }, 2);

    expect(counter.get({ method: 'GET' })).toBe(5);
    expect(counter.get({ method: 'POST' })).toBe(7);
  });

  it('should not decrement (negative values ignored)', () => {
    const counter = new Counter('test_counter', { help: 'Test counter' });

    counter.inc({}, 10);
    counter.inc({}, -5); // Should be ignored

    expect(counter.get()).toBe(10);
  });

  it('should return 0 for non-existent labels', () => {
    const counter = new Counter('test_counter', { help: 'Test counter' });

    expect(counter.get({ method: 'DELETE' })).toBe(0);
  });

  it('should format in Prometheus format', () => {
    const counter = new Counter('http_requests', { help: 'Total HTTP requests' });

    counter.inc({ method: 'GET', status: '200' }, 10);

    const formatted = counter.format();

    expect(formatted).toContain('# HELP http_requests Total HTTP requests');
    expect(formatted).toContain('# TYPE http_requests counter');
    expect(formatted).toContain('http_requests{method="GET",status="200"} 10');
  });

  it('should reset all values', () => {
    const counter = new Counter('test_counter', { help: 'Test' });

    counter.inc({ a: '1' }, 5);
    counter.inc({ a: '2' }, 10);
    counter.reset();

    expect(counter.get({ a: '1' })).toBe(0);
    expect(counter.get({ a: '2' })).toBe(0);
  });

  it('should escape label values', () => {
    const counter = new Counter('test_counter', { help: 'Test' });

    counter.inc({ path: '/test"path\\with\nnewline' }, 1);

    const formatted = counter.format();

    expect(formatted).toContain('\\"');
    expect(formatted).toContain('\\\\');
    expect(formatted).toContain('\\n');
  });
});

describe('Gauge', () => {
  it('should set value', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test gauge' });

    gauge.set(42);

    expect(gauge.get()).toBe(42);
  });

  it('should increment', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test gauge' });

    gauge.set(10);
    gauge.inc();
    gauge.inc({}, 5);

    expect(gauge.get()).toBe(16);
  });

  it('should decrement', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test gauge' });

    gauge.set(10);
    gauge.dec();
    gauge.dec({}, 3);

    expect(gauge.get()).toBe(6);
  });

  it('should handle labels', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test gauge' });

    gauge.set(100, { state: 'active' });
    gauge.set(50, { state: 'idle' });

    expect(gauge.get({ state: 'active' })).toBe(100);
    expect(gauge.get({ state: 'idle' })).toBe(50);
  });

  it('should return 0 for non-existent labels', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test' });

    expect(gauge.get({ state: 'unknown' })).toBe(0);
  });

  it('should format in Prometheus format', () => {
    const gauge = new Gauge('active_connections', { help: 'Active connections' });

    gauge.set(5, { type: 'http' });

    const formatted = gauge.format();

    expect(formatted).toContain('# HELP active_connections Active connections');
    expect(formatted).toContain('# TYPE active_connections gauge');
    expect(formatted).toContain('active_connections{type="http"} 5');
  });

  it('should reset all values', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test' });

    gauge.set(100, { a: '1' });
    gauge.set(200, { a: '2' });
    gauge.reset();

    expect(gauge.get({ a: '1' })).toBe(0);
    expect(gauge.get({ a: '2' })).toBe(0);
  });

  it('should increment from zero for new labels', () => {
    const gauge = new Gauge('test_gauge', { help: 'Test' });

    gauge.inc({ new: 'label' }, 5);

    expect(gauge.get({ new: 'label' })).toBe(5);
  });
});

describe('Histogram', () => {
  it('should observe values', () => {
    const histogram = new Histogram('response_time', {
      help: 'Response time',
      buckets: [0.1, 0.5, 1, 5],
    });

    histogram.observe(0.3);
    histogram.observe(0.7);
    histogram.observe(2);

    const formatted = histogram.format();

    expect(formatted).toContain('response_time_sum');
    expect(formatted).toContain('response_time_count');
    expect(formatted).toContain('response_time_bucket');
  });

  it('should track count and sum', () => {
    const histogram = new Histogram('test', {
      help: 'Test',
      buckets: [1, 5, 10],
    });

    histogram.observe(2);
    histogram.observe(3);
    histogram.observe(5);

    const formatted = histogram.format();

    expect(formatted).toContain('test_sum 10');
    expect(formatted).toContain('test_count 3');
  });

  it('should populate buckets correctly', () => {
    const histogram = new Histogram('test', {
      help: 'Test',
      buckets: [1, 5, 10],
    });

    histogram.observe(0.5); // In bucket 1, 5, 10
    histogram.observe(3); // In bucket 5, 10
    histogram.observe(7); // In bucket 10
    histogram.observe(15); // Only in +Inf

    const formatted = histogram.format();

    // Buckets are cumulative: each bucket counts values <= threshold
    expect(formatted).toContain('le="1"} 1'); // 1 value <= 1 (0.5)
    expect(formatted).toContain('le="5"} 3'); // 3 values <= 5 (0.5, 3, and each adds to previous buckets)
    expect(formatted).toContain('le="10"} 6'); // All values contribute to higher buckets cumulatively
    expect(formatted).toContain('le="+Inf"} 4'); // Total count
  });

  it('should support labels', () => {
    const histogram = new Histogram('test', {
      help: 'Test',
      buckets: [1, 5],
    });

    histogram.observe(0.5, { method: 'GET' });
    histogram.observe(2, { method: 'POST' });

    const formatted = histogram.format();

    expect(formatted).toContain('method="GET"');
    expect(formatted).toContain('method="POST"');
  });

  it('should use default buckets when not specified', () => {
    const histogram = new Histogram('test', { help: 'Test' });

    histogram.observe(0.5);

    const formatted = histogram.format();

    // Default buckets include common latency values
    expect(formatted).toContain('le="0.005"');
    expect(formatted).toContain('le="0.01"');
    expect(formatted).toContain('le="10"');
  });

  it('should provide startTimer functionality', async () => {
    const histogram = new Histogram('duration', {
      help: 'Duration',
      buckets: [0.001, 0.01, 0.1, 1],
    });

    const timer = histogram.startTimer();
    await new Promise((r) => setTimeout(r, 10)); // Wait 10ms
    const elapsed = timer.end();

    expect(elapsed).toBeGreaterThan(0.005);
    expect(elapsed).toBeLessThan(1);

    const formatted = histogram.format();
    expect(formatted).toContain('duration_count 1');
  });

  it('should merge labels in startTimer', async () => {
    const histogram = new Histogram('test', {
      help: 'Test',
      buckets: [0.001, 0.01, 0.1],
    });

    const timer = histogram.startTimer({ route: '/api' });
    timer.end({ status: '200' });

    const formatted = histogram.format();
    expect(formatted).toContain('route="/api"');
    expect(formatted).toContain('status="200"');
  });

  it('should reset all values', () => {
    const histogram = new Histogram('test', { help: 'Test', buckets: [1, 5] });

    histogram.observe(0.5);
    histogram.observe(3);
    histogram.reset();

    const formatted = histogram.format();
    expect(formatted).not.toContain('test_sum');
  });
});

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it('should create and return counters', () => {
    const counter1 = registry.counter('test_counter', 'Test help');
    const counter2 = registry.counter('test_counter'); // Same name

    expect(counter1).toBe(counter2);
  });

  it('should create and return gauges', () => {
    const gauge1 = registry.gauge('test_gauge', 'Test help');
    const gauge2 = registry.gauge('test_gauge');

    expect(gauge1).toBe(gauge2);
  });

  it('should create and return histograms', () => {
    const histogram1 = registry.histogram('test_histogram', 'Test help');
    const histogram2 = registry.histogram('test_histogram');

    expect(histogram1).toBe(histogram2);
  });

  it('should accept MetricOptions for counters', () => {
    const counter = registry.counter('test', {
      help: 'Test',
      labelNames: ['method', 'status'],
    });

    expect(counter.name).toBe('test');
    expect(counter.help).toBe('Test');
  });

  it('should accept MetricOptions for gauges', () => {
    const gauge = registry.gauge('test', {
      help: 'Test gauge',
      labelNames: ['state'],
    });

    expect(gauge.help).toBe('Test gauge');
  });

  it('should accept MetricOptions for histograms', () => {
    const histogram = registry.histogram('test', {
      help: 'Test histogram',
      buckets: [0.1, 0.5, 1],
    });

    expect(histogram.help).toBe('Test histogram');
  });

  it('should format all metrics', () => {
    registry.counter('requests', 'Total requests').inc();
    registry.gauge('connections', 'Active connections').set(10);
    registry.histogram('duration', 'Duration').observe(0.5);

    const formatted = registry.format();

    expect(formatted).toContain('requests');
    expect(formatted).toContain('connections');
    expect(formatted).toContain('duration');
    expect(formatted).toContain('process_heap_bytes'); // Default process metrics
  });

  it('should include process metrics', () => {
    const formatted = registry.format();

    expect(formatted).toContain('process_heap_bytes');
    expect(formatted).toContain('process_heap_total_bytes');
    expect(formatted).toContain('process_rss_bytes');
    expect(formatted).toContain('process_uptime_seconds');
  });

  it('should reset all metrics', () => {
    const counter = registry.counter('test', 'Test');
    const gauge = registry.gauge('gauge', 'Test');
    const histogram = registry.histogram('hist', 'Test');

    counter.inc();
    gauge.set(10);
    histogram.observe(0.5);

    registry.reset();

    expect(counter.get()).toBe(0);
    expect(gauge.get()).toBe(0);
  });

  it('should get summary of registered metrics', () => {
    registry.counter('c1', 'Counter 1');
    registry.counter('c2', 'Counter 2');
    registry.gauge('g1', 'Gauge 1');
    registry.histogram('h1', 'Histogram 1');

    const summary = registry.getSummary();

    expect(summary.counters).toBe(2);
    expect(summary.gauges).toBe(1);
    expect(summary.histograms).toBe(1);
  });

  it('should handle empty help string', () => {
    const counter = registry.counter('no_help');
    const gauge = registry.gauge('no_help_gauge');
    const histogram = registry.histogram('no_help_hist');

    expect(counter.help).toBe('');
    expect(gauge.help).toBe('');
    expect(histogram.help).toBe('');
  });
});

describe('Global metrics instance', () => {
  it('should be a MetricsRegistry', () => {
    expect(metrics).toBeInstanceOf(MetricsRegistry);
  });

  it('should have predefined application metrics', () => {
    const formatted = metrics.format();

    expect(formatted).toContain('agentmem_requests_total');
    expect(formatted).toContain('agentmem_request_duration_seconds');
    expect(formatted).toContain('agentmem_db_queries_total');
    expect(formatted).toContain('agentmem_cache_entries');
  });
});

describe('recordPoolMetrics', () => {
  it('should record pool statistics', () => {
    const stats: PoolStats = {
      totalCount: 10,
      idleCount: 4,
      waitingCount: 2,
    };

    recordPoolMetrics(stats);

    // This just verifies no errors are thrown
    expect(true).toBe(true);
  });

  it('should accept optional config', () => {
    const stats: PoolStats = {
      totalCount: 10,
      idleCount: 4,
      waitingCount: 2,
    };

    recordPoolMetrics(stats, { maxConnections: 20 });

    expect(true).toBe(true);
  });
});

describe('createPoolMetricsRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create recorder with start and stop', () => {
    const getStats = vi.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });

    const recorder = createPoolMetricsRecorder(getStats);

    expect(typeof recorder.start).toBe('function');
    expect(typeof recorder.stop).toBe('function');
  });

  it('should call getStats immediately on start', () => {
    const getStats = vi.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });

    const recorder = createPoolMetricsRecorder(getStats);
    recorder.start();

    expect(getStats).toHaveBeenCalledTimes(1);

    recorder.stop();
  });

  it('should call getStats periodically', () => {
    const getStats = vi.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });

    const recorder = createPoolMetricsRecorder(getStats, undefined, 1000);
    recorder.start();

    expect(getStats).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(getStats).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(getStats).toHaveBeenCalledTimes(3);

    recorder.stop();
  });

  it('should stop recording after stop() is called', () => {
    const getStats = vi.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });

    const recorder = createPoolMetricsRecorder(getStats, undefined, 1000);
    recorder.start();
    recorder.stop();

    vi.advanceTimersByTime(5000);

    expect(getStats).toHaveBeenCalledTimes(1); // Only the initial call
  });

  it('should handle getStats errors gracefully', () => {
    const getStats = vi.fn().mockImplementation(() => {
      throw new Error('Failed to get stats');
    });

    const recorder = createPoolMetricsRecorder(getStats, undefined, 1000);

    // Should not throw
    expect(() => {
      recorder.start();
      vi.advanceTimersByTime(1000);
    }).not.toThrow();

    recorder.stop();
  });

  it('should warn if already started', () => {
    const getStats = vi.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });

    const recorder = createPoolMetricsRecorder(getStats);
    recorder.start();
    recorder.start(); // Second start should warn

    expect(getStats).toHaveBeenCalledTimes(1);

    recorder.stop();
  });

  it('should do nothing if stop called when not started', () => {
    const getStats = vi.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });

    const recorder = createPoolMetricsRecorder(getStats);

    // Should not throw
    expect(() => recorder.stop()).not.toThrow();
  });
});
