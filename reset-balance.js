require('dotenv').config();
const { get, run } = require('./src/db/sqlite');

(async () => {
  try {
    // Find user by ID 1 (the only active user)
    const user = await get('SELECT id, username FROM users WHERE id = 1');
    if (user) {
      console.log('✓ Found user:', user.username, '(ID:', user.id + ')');
      
      // Reset balance
      await run('UPDATE users SET pol_balance = 0 WHERE id = ?', [user.id]);
      await run('UPDATE users_temp_power SET balance = 0, lifetime_mined = 0 WHERE user_id = ?', [user.id]);
      console.log('✓ Balance reset to 0 POL');
      console.log('✓ Ready to receive fresh mining rewards at 0.10 POL per 10-min block');
    } else {
      console.log('✗ User not found');
    }
    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
})();
