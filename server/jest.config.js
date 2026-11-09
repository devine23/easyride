module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  verbose: true,
  testTimeout: 15000,
  // Tests that hit MongoDB share a single connection — avoid parallel workers
  // competing for the same test database and leaking sockets.
  maxWorkers: 1,
}
