const { execSync } = require('child_process');
const { existsSync } = require('fs');

/**
 * Applies migrations to the dedicated test database (TEST_DATABASE_URL). Non-destructive:
 * every run creates fresh tenants/users with unique identifiers, so no reset is needed.
 */
module.exports = async () => {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/test/.test(url)) throw new Error('Refusing to run e2e tests: TEST_DATABASE_URL must point to a *test* database');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
};
