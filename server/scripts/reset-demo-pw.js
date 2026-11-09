const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/easyride')
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users')
  const hash = bcrypt.hashSync('demo1234', 8)
  console.log('fresh hash:', hash)

  const phones = ['+263770000001', '+263771234567', '+263772345678', '+263773456789', '+263774000001', '+263775678901']
  for (const p of phones) {
    const r = await User.updateOne({ phone: p }, { $set: { passwordHash: hash } })
    console.log(`${p}: matched=${r.matchedCount} modified=${r.modifiedCount}`)
  }

  const devine = await User.findOne({ phone: '0771752855' })
  if (!devine) {
    await User.create({
      id: 'u-devine-' + Date.now(),
      fullName: 'Devine Mukwekwezeke',
      phone: '0771752855',
      passwordHash: hash,
      role: 'rider',
      accountStatus: 'active',
      verification: { status: 'approved' },
      createdAt: new Date().toISOString(),
    })
    console.log('Created devine account')
  } else {
    await User.updateOne({ phone: '0771752855' }, { $set: { passwordHash: hash } })
    console.log('Updated devine account')
  }

  for (const p of [...phones, '0771752855']) {
    const u = await User.findOne({ phone: p }, { phone: 1, passwordHash: 1 }).lean()
    console.log(`  ${p} verify:`, bcrypt.compareSync('demo1234', u.passwordHash))
  }
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
