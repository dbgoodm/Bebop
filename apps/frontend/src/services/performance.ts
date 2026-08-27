export function markPerformance(name: string) {
  performance.mark(`bebop:${name}`);
}

export function measurePerformance(name: string, start: string, end = name) {
  try {
    performance.measure(`bebop:${name}`, `bebop:${start}`, `bebop:${end}`);
  } catch {
    // A navigation may be cancelled before its end mark. That is expected.
  }
}
