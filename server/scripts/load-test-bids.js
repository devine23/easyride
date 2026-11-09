#!/usr/bin/env node
/**
 * Load test for the bidding broadcast path.
 *
 * Creates N bids in parallel against a running server and reports:
 *   - total throughput (bids/sec)
 *   - latency: p50, p95, p99, max
 *   - broadcast fan-out stats (how many drivers received each bid)
 *
 * Not part of CI — run manually against a dev server:
 *   node scripts/load-test-bids.js 50
 *
 * Prereq: a real rider account must exist. We log in once, then reuse the
 * token for all parallel bid POSTs.
 *
 * Observations from a 30-req local run:
 *   - OSRM routing (external) dominates latency (p50 ~3s). Production should
 *     cache common origin/dest pairs or move to Google Directions.
 *   - "Max 1 open bid per client" is checked but NOT atomic — concurrent POSTs
 *     from the same client can all succeed. Partial unique index on
 *     (clientId, status='open') would fix this cleanly.
 */
'use strict'
const http = require('http')

const BASE   = process.env.BASE   || 'http://localhost:5000'
const PHONE  = process.env.PHONE  || '+263771234567'
const PASS   = process.env.PASS   || 'demo1234'
const N      = parseInt(process.argv[2] || '50', 10)

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const url  = new URL(path, BASE)
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        let parsed
        try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = raw }
        resolve({ status: res.statusCode, body: parsed })
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function pct(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function main() {
  console.log(`[load-test] ${N} parallel POST /api/bids against ${BASE}`)

  // 1) Log in once
  const loginStart = Date.now()
  const login = await request('POST', '/api/auth/login', { phone: PHONE, password: PASS })
  if (login.status !== 200) {
    console.error(`[load-test] Login failed (${login.status}):`, login.body)
    process.exit(1)
  }
  const token = login.body.token
  console.log(`[load-test] Logged in as ${login.body.user.fullName} (${Date.now() - loginStart} ms)`)

  // 2) Clear any existing open bid so the first attempt isn't a BID_ALREADY_OPEN
  await request('DELETE', `/api/bids/_noop`, null, token).catch(() => {})

  // 3) Fire N bids in parallel
  const bidBody = {
    pickup:   { lat: -17.83, lng: 31.05 },
    dropoff:  { lat: -17.80, lng: 31.03 },
    pickupAddress:  'Load test pickup',
    dropoffAddress: 'Load test dropoff',
    category: 'Economy',
    offer: 4.50,
  }

  const start = Date.now()
  const results = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const t0 = Date.now()
      const r = await request('POST', '/api/bids', bidBody, token)
      return { i, ms: Date.now() - t0, status: r.status, body: r.body }
    })
  )
  const totalMs = Date.now() - start

  // 4) Clean up — delete the one open bid we may have created
  const open = results.find(r => r.status === 200)
  if (open?.body?.bid?.id) {
    await request('DELETE', `/api/bids/${open.body.bid.id}`, null, token).catch(() => {})
  }

  // 5) Report
  const latencies = results.map(r => r.ms).sort((a, b) => a - b)
  const byStatus  = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
  const broadcasts = results.filter(r => r.status === 200).map(r => r.body.broadcast || 0)
  const avgBroadcast = broadcasts.length ? broadcasts.reduce((a, b) => a + b, 0) / broadcasts.length : 0

  console.log()
  console.log('─── Results ─────────────────────────────')
  console.log(`Requests:     ${N}`)
  console.log(`Total time:   ${totalMs} ms`)
  console.log(`Throughput:   ${(N / (totalMs / 1000)).toFixed(1)} req/s`)
  console.log()
  console.log('Latency (ms):')
  console.log(`  p50:        ${pct(latencies, 50)}`)
  console.log(`  p95:        ${pct(latencies, 95)}`)
  console.log(`  p99:        ${pct(latencies, 99)}`)
  console.log(`  max:        ${latencies[latencies.length - 1]}`)
  console.log()
  console.log('Status distribution:')
  for (const [s, c] of Object.entries(byStatus)) console.log(`  ${s}:        ${c}`)
  console.log()
  console.log(`Avg broadcast fan-out (on success): ${avgBroadcast.toFixed(1)} drivers`)
  console.log('─────────────────────────────────────────')

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
