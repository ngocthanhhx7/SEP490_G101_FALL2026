# Performance diagnostics

`dispatch-benchmark.js` measures the existing dispatch service with synthetic
in-process repository/ranker ports, 100 candidates and concurrency 1. Run from
`backend/` with `node scripts/performance/dispatch-benchmark.js`; pass another
checkout's backend directory to compare the same harness against that source.
It prints timing summaries and port call counts only. It does not connect to
MongoDB, test browser pages or verify booking confirmation under load.

Keep actual query plans and journey/load evidence in
[doc/testing](../../../doc/testing/README.md). The
[P44 record](../../../doc/testing/p44-performance.md) lists the missing
integration gates and how to collect the next measurements.
