const crypto = require('crypto')

// Paynow verifies callbacks by SHA-512 hashing the concatenated field values
// (in request order, excluding `hash`) + integration key, then uppercasing.
// Timing-safe comparison avoids leaking info via response time.
function verifyPaynowHash(fields, integrationKey) {
  if (!integrationKey) return false
  const provided = fields.hash || fields.Hash
  if (!provided) return false

  const concat = Object.entries(fields)
    .filter(([k]) => k.toLowerCase() !== 'hash')
    .map(([, v]) => String(v))
    .join('') + integrationKey

  const computed = crypto.createHash('sha512').update(concat).digest('hex').toUpperCase()
  const a = Buffer.from(computed)
  const b = Buffer.from(String(provided).toUpperCase())
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function createPaynowHash(fields, integrationKey) {
  const concat = Object.entries(fields)
    .filter(([k]) => k.toLowerCase() !== 'hash')
    .map(([, v]) => String(v))
    .join('') + integrationKey
  return crypto.createHash('sha512').update(concat).digest('hex').toUpperCase()
}

module.exports = { verifyPaynowHash, createPaynowHash }
