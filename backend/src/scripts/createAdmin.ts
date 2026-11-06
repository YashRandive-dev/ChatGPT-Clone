/**
 * Creates an admin account or promotes an existing user.
 * Usage: npm run seed:admin -- admin@example.com "Admin Name" "StrongPassw0rd"
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { User } from '../models/User';
import { hashPassword } from '../controllers/authController';

async function run() {
  const [email, name = 'Administrator', password] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npm run seed:admin -- <email> [name] [password]');
    process.exit(1);
  }
  await connectDatabase();
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.role = 'admin';
    existing.emailVerified = true;
    if (password) existing.password = await hashPassword(password);
    await existing.save();
    console.log(`Promoted ${existing.email} to admin.`);
  } else {
    if (!password || password.length < 8) {
      console.error('A password of at least 8 characters is required to create a new admin.');
      process.exit(1);
    }
    await User.create({ email, name, password: await hashPassword(password), role: 'admin', emailVerified: true });
    console.log(`Created admin ${email}.`);
  }
  await disconnectDatabase();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
