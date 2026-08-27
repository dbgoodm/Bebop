use std::time::Instant;

/// Lightweight timing span for UI-critical paths. It logs slow operations to
/// the desktop process log without adding a telemetry dependency.
pub(crate) struct Span {
    name: &'static str,
    started: Instant,
}

impl Span {
    pub(crate) fn new(name: &'static str) -> Self {
        Self {
            name,
            started: Instant::now(),
        }
    }
}

impl Drop for Span {
    fn drop(&mut self) {
        let elapsed = self.started.elapsed();
        if elapsed.as_millis() >= 25 {
            eprintln!(
                "bebop.timing name={} elapsed_ms={}",
                self.name,
                elapsed.as_millis()
            );
        }
    }
}
