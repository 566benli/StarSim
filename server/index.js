require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ───── API Routes ─────
app.use('/api/auth', require('./auth'));
app.use('/api/simulations', require('./simulations'));

// ───── Stats endpoint for terminal dashboard ─────
app.get('/api/stats', (_req, res) => {
  res.json(db.getStats());
});

// ───── Password reset page (served as HTML) ─────
app.get('/reset-password', (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Genesis Error (创世错误) - Reset Password</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:rgba(20,20,50,0.9);border:1px solid rgba(100,120,255,0.2);border-radius:16px;padding:40px;max-width:400px;width:90%}
h2{color:#00ccff;margin-bottom:20px;text-align:center}
input{width:100%;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:15px;margin-bottom:12px}
input:focus{outline:none;border-color:#4488ff}
button{width:100%;padding:12px;background:linear-gradient(135deg,#4488ff,#00ccff);border:none;border-radius:8px;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
button:hover{opacity:0.9}
.msg{margin-top:12px;text-align:center;font-size:14px}
.msg.ok{color:#44ff88}.msg.err{color:#ff4466}
</style></head><body>
<div class="card">
<h2>Reset Password</h2>
<input type="password" id="pw1" placeholder="New password (min 6 chars)">
<input type="password" id="pw2" placeholder="Confirm password">
<button onclick="doReset()">Reset Password</button>
<div class="msg" id="msg"></div>
</div>
<script>
async function doReset(){
  const pw1=document.getElementById('pw1').value,pw2=document.getElementById('pw2').value,msg=document.getElementById('msg');
  if(pw1.length<6){msg.className='msg err';msg.textContent='Password must be at least 6 characters';return}
  if(pw1!==pw2){msg.className='msg err';msg.textContent='Passwords do not match';return}
  const token=new URLSearchParams(location.search).get('token');
  if(!token){msg.className='msg err';msg.textContent='Missing reset token';return}
  try{
    const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,newPassword:pw1})});
    const d=await r.json();
    if(r.ok){msg.className='msg ok';msg.textContent=d.message+' You can close this page.'}
    else{msg.className='msg err';msg.textContent=d.error||'Reset failed'}
  }catch(e){msg.className='msg err';msg.textContent='Network error'}
}
</script></body></html>`);
});

// ───── Central Terminal Dashboard ─────
app.get('/terminal', (_req, res) => {
  res.sendFile(path.join(__dirname, 'terminal.html'));
});

// ───── Initialize DB and start server ─────
db.load();
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  Genesis Error Central Terminal          ║`);
  console.log(`  ║  Server running on port ${String(PORT).padEnd(17)}║`);
  console.log(`  ║                                          ║`);
  console.log(`  ║  API:      http://localhost:${PORT}/api     ║`);
  console.log(`  ║  Terminal: http://localhost:${PORT}/terminal ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
