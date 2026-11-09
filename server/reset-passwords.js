const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
require('dotenv').config()

mongoose.connect('mongodb://127.0.0.1:27017/easyride').then(async () => {
  const User = require('./src/models/User')

  const updates = [
    { email: 'admin@easyride.co.zw', password: 'admin1234' },
    { email: 'rider@demo.com',       password: 'demo1234'  },
    { email: 'corp@demo.com',        password: 'demo1234'  },
    { email: 'driver@demo.com',      password: 'demo1234'  },
    { email: 'tmoyo@demo.com',       password: 'demo1234'  },
    { email: 'g.mupfumi@corp.co.zw', password: 'demo1234'  },
  ]

  for (const u of updates) {
    const hash = await bcrypt.hash(u.password, 10)
    const result = await User.updateOne({ email: u.email }, { $set: { passwordHash: hash } })
    console.log(u.email, result.modifiedCount ? 'updated' : 'not found')
  }

  console.log('Done')
  mongoose.disconnect()
})
