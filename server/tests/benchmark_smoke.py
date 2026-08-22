import asyncio
import time
import httpx

async def benchmark_endpoint(url: str, concurrency: int = 20, total_requests: int = 100):
    latencies = []
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(timeout=10.0) as client:
        async def make_req():
            async with sem:
                start = time.perf_counter()
                res = await client.get(url)
                latencies.append((time.perf_counter() - start) * 1000)
                return res.status_code

        tasks = [make_req() for _ in range(total_requests)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]
    print(f'Benchmark for {url}: p50={p50:.1f}ms, p95={p95:.1f}ms, p99={p99:.1f}ms')
    assert p95 < 150.0, f'p95 latency {p95:.1f}ms exceeded 150ms SLA'
    return p95

if __name__ == '__main__':
    asyncio.run(benchmark_endpoint('http://127.0.0.1:8000/health'))
