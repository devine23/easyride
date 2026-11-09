const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const User = require('../src/models/User')

async function main() {
  await mongoose.connect('mongodb://localhost:27017/easygoo')
  const phone = '+263770000001'
  const u = await User.findOne({ phone })
  console.log('Found:', !!u)
  if (u) {
    console.log('  schema paths:', Object.keys(u.schema.paths).slice(0, 30))
    console.log('  u.passwordHash:', u.passwordHash)
    console.log('  u.get(passwordHash):', u.get('passwordHash'))
    console.log('  u.toObject().passwordHash:', u.toObject().passwordHash)
    console.log('  verify demo1234 vs u.passwordHash:', bcrypt.compareSync('demo1234', u.passwordHash || ''))
  }
  const uLean = await User.findOne({ phone }).lean()
  console.log('  lean.passwordHash:', uLean?.passwordHash)
  console.log('  verify demo1234 vs lean:', bcrypt.compareSync('demo1234', uLean?.passwordHash || ''))
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
