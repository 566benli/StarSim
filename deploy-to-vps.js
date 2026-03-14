/**
 * Deploy StarSim Central Terminal to VPS
 * Uploads files via SFTP, then runs deploy.sh via SSH
 */
const { Client } = require('ssh2');
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');

const VPS = {
  host: '66.42.51.85',
  port: 22,
  username: 'root',
  password: 'H{z4@WW-#7LQPgP}',
};
const REMOTE_DIR = '/opt/starsim-terminal';
const LOCAL_DIR = path.join(__dirname, 'server');

const FILES = [
  'server.js',
  'database.js',
  'package.json',
  'ecosystem.config.js',
  'deploy.sh',
  '.env.production',
  'nginx.conf',
  'public/index.html',
];

async function main() {
  console.log('\n  ✦  StarSim VPS Deployment\n');

  // Step 1: Upload files via SFTP
  console.log('[1/3] Uploading files via SFTP...');
  const sftp = new SftpClient();
  try {
    await sftp.connect(VPS);
    await sftp.mkdir(REMOTE_DIR, true);
    await sftp.mkdir(REMOTE_DIR + '/public', true);

    for (const file of FILES) {
      const local = path.join(LOCAL_DIR, file);
      const remote = REMOTE_DIR + '/' + file;
      if (fs.existsSync(local)) {
        await sftp.put(local, remote);
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ⚠ ${file} (not found, skipping)`);
      }
    }
    await sftp.end();
    console.log('  Files uploaded!\n');
  } catch (err) {
    console.error('SFTP error:', err.message);
    try { await sftp.end(); } catch {}
    process.exit(1);
  }

  // Step 2: Run deploy.sh via SSH
  console.log('[2/3] Running deploy script on VPS (this takes ~2 minutes)...');
  await runSSH(`cd ${REMOTE_DIR} && chmod +x deploy.sh && bash deploy.sh`);

  // Step 3: Verify
  console.log('\n[3/3] Verifying...');
  await runSSH(`curl -s http://localhost:3777/api/health`);

  console.log('\n  ✦  Deployment complete!');
  console.log(`  Dashboard: http://${VPS.host}`);
  console.log(`  API:       http://${VPS.host}/api\n`);
}

function runSSH(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { conn.end(); return reject(err); }
        stream.on('data', (d) => process.stdout.write(d.toString()));
        stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
        stream.on('close', () => { conn.end(); resolve(); });
      });
    });
    conn.on('error', reject);
    conn.connect(VPS);
  });
}

main().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });
