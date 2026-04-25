import { execSync } from 'child_process';
import fs from 'fs';

try {
    const output = execSync('npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss', { encoding: 'utf8', stdio: 'pipe' });
    fs.writeFileSync('push_error_actual.txt', output);
    console.log('Success!');
} catch (error) {
    let msg = error.stdout + '\n' + error.stderr;
    fs.writeFileSync('push_error_actual.txt', msg);
    console.error('Failed as expected.');
}
