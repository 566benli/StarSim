require('dotenv').config();
const nodemailer = require('nodemailer');
const dns = require('dns');

// First resolve the IP using the OS resolver (which works)
dns.lookup('smtp.gmail.com', { family: 4 }, (err, ip) => {
  if (err) { console.error('Cannot resolve smtp.gmail.com:', err); process.exit(1); }
  console.log('Resolved smtp.gmail.com to:', ip);
  console.log('Connecting directly to IP (bypassing DNS entirely)...\n');

  const transporter = nodemailer.createTransport({
    host: ip,
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    tls: { servername: 'smtp.gmail.com', rejectUnauthorized: false },
  });

  transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_USER,
    subject: 'StarSim Central Terminal - Email Test',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a1a;color:#e0e0e0;border-radius:12px;">
        <h2 style="color:#00ccff;text-align:center;">Email Delivery Works!</h2>
        <p style="text-align:center;">Your StarSim Central Terminal can now send password reset emails.</p>
        <p style="color:#44ff88;text-align:center;font-weight:bold;">Configuration verified successfully.</p>
      </div>
    `,
  }).then(info => {
    console.log('SUCCESS! Email sent.');
    console.log('SMTP Response:', info.response);
    console.log('Message ID:', info.messageId);
    console.log('\nCheck your inbox at:', process.env.SMTP_USER);
    process.exit(0);
  }).catch(err => {
    console.error('FAILED:', err.message);
    console.error('Code:', err.code);
    process.exit(1);
  });
});
