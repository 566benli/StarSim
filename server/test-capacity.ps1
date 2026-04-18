##############################################################################
#  Genesis Error Central Terminal - Capacity / Stress Test
#  Creates many users + saves and measures performance
##############################################################################
$base = "http://localhost:3777"

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  STARSIM CENTRAL TERMINAL — CAPACITY STRESS TEST" -ForegroundColor Cyan
Write-Host "======================================================`n" -ForegroundColor Cyan

# ── Phase 1: Mass user registration ──────────────────────────────────
$batchSizes = @(50, 100, 200, 500)
$totalCreated = 0
$tokens = @()

foreach ($batch in $batchSizes) {
    $target = $totalCreated + $batch
    Write-Host "Registering users $($totalCreated+1) to $target..." -NoNewline
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    
    for ($i = $totalCreated + 1; $i -le $target; $i++) {
        try {
            $body = @{username="stress_user_$i"; password="pass123456"; email="user$i@stress.test"} | ConvertTo-Json -Compress
            $r = Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST -ContentType "application/json" -Body $body
            if ($i -le 20 -or $i % 100 -eq 0) { $tokens += $r.token }
        } catch {
            Write-Host " FAILED at user $i : $_" -ForegroundColor Red
            break
        }
    }
    $totalCreated = $target
    $sw.Stop()
    $rateReg = [math]::Round($batch / $sw.Elapsed.TotalSeconds, 1)
    Write-Host " done in $([math]::Round($sw.Elapsed.TotalSeconds,1))s ($rateReg reg/sec)" -ForegroundColor Green
}

Write-Host "`nTotal users registered: $totalCreated" -ForegroundColor Yellow

# ── Phase 2: Mass save creation ──────────────────────────────────────
Write-Host "`nCreating 3 saves per first 200 users (600 saves)..." -NoNewline
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$saveCount = 0

for ($i = 0; $i -lt [Math]::Min($tokens.Count, 200); $i++) {
    $h = @{Authorization="Bearer $($tokens[$i])"}
    for ($s = 1; $s -le 3; $s++) {
        try {
            $bd = @{
                slotName = "Sim_$($i)_Slot_$s"
                simData = '{"bodies":[{"n":"Star1","m":1},{"n":"P1","m":0.001},{"n":"P2","m":0.002}],"t":' + (Get-Random -Min 10 -Max 99999) + '}'
                bodyCount = (Get-Random -Min 1 -Max 20)
                simTime = (Get-Random -Min 10 -Max 999999)
            } | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri "$base/api/saves" -Method POST -ContentType "application/json" -Headers $h -Body $bd | Out-Null
            $saveCount++
        } catch { }
    }
}
$sw.Stop()
$rateSave = [math]::Round($saveCount / $sw.Elapsed.TotalSeconds, 1)
Write-Host " done: $saveCount saves in $([math]::Round($sw.Elapsed.TotalSeconds,1))s ($rateSave save/sec)" -ForegroundColor Green

# ── Phase 3: Query performance ───────────────────────────────────────
Write-Host "`n─── Query Performance Under Load ───" -ForegroundColor Yellow

# Stats endpoint
$sw = [System.Diagnostics.Stopwatch]::StartNew()
for ($i = 0; $i -lt 50; $i++) {
    Invoke-RestMethod -Uri "$base/api/terminal/stats" | Out-Null
}
$sw.Stop()
$msPerStats = [math]::Round($sw.Elapsed.TotalMilliseconds / 50, 1)
Write-Host "  /api/terminal/stats:  ${msPerStats}ms avg (50 calls)" -ForegroundColor $(if($msPerStats -lt 100){"Green"}else{"Yellow"})

# Login endpoint
$sw = [System.Diagnostics.Stopwatch]::StartNew()
for ($i = 0; $i -lt 50; $i++) {
    $body = @{username="stress_user_$(Get-Random -Min 1 -Max $totalCreated)"; password="pass123456"} | ConvertTo-Json -Compress
    try { Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $body | Out-Null } catch {}
}
$sw.Stop()
$msPerLogin = [math]::Round($sw.Elapsed.TotalMilliseconds / 50, 1)
Write-Host "  /api/auth/login:      ${msPerLogin}ms avg (50 calls)" -ForegroundColor $(if($msPerLogin -lt 200){"Green"}else{"Yellow"})

# My saves endpoint  
if ($tokens.Count -gt 0) {
    $h = @{Authorization="Bearer $($tokens[0])"}
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    for ($i = 0; $i -lt 50; $i++) {
        Invoke-RestMethod -Uri "$base/api/saves" -Headers $h | Out-Null
    }
    $sw.Stop()
    $msPerSaves = [math]::Round($sw.Elapsed.TotalMilliseconds / 50, 1)
    Write-Host "  /api/saves (list):    ${msPerSaves}ms avg (50 calls)" -ForegroundColor $(if($msPerSaves -lt 100){"Green"}else{"Yellow"})
}

# ── Phase 4: Check final state ───────────────────────────────────────
Write-Host "`n─── Final State ───" -ForegroundColor Yellow
$stats = Invoke-RestMethod -Uri "$base/api/terminal/stats"
Write-Host "  Users:        $($stats.userCount)"
Write-Host "  Saves:        $($stats.saveCount)"
Write-Host "  Total bodies: $($stats.totalBodies)"
Write-Host "  Leaderboard top 3:"
for ($i = 0; $i -lt [Math]::Min(3, $stats.topCreators.Count); $i++) {
    $c = $stats.topCreators[$i]
    Write-Host "    #$($i+1) $($c.username): $($c.total_bodies) bodies, $($c.save_count) saves"
}

# ── Phase 5: Database file size ──────────────────────────────────────
$dbPath = "c:\Users\Administrator\Desktop\StarSim\server\data\genesiserror.db"
$dbSize = (Get-Item $dbPath).Length
$dbSizeKB = [math]::Round($dbSize / 1024, 1)
$dbSizeMB = [math]::Round($dbSize / 1048576, 2)
Write-Host "`n  DB file size: ${dbSizeKB} KB (${dbSizeMB} MB)"
$estPerUser = [math]::Round($dbSize / $stats.userCount, 0)
Write-Host "  ~${estPerUser} bytes per user (with saves)"

# ── Capacity estimate ────────────────────────────────────────────────
Write-Host "`n─── CAPACITY ESTIMATES ───" -ForegroundColor Cyan
$memLimit = 512  # MB — conservative for a small VPS
$diskLimit = 10  # GB
$estUsersPer100MB = [math]::Round(100 * 1048576 / $estPerUser)
$estUsersPerGB = [math]::Round(1073741824 / $estPerUser)
$estUsersIn10GB = [math]::Round(10 * 1073741824 / $estPerUser)
Write-Host "  Per 100 MB disk:   ~$($estUsersPer100MB.ToString('N0')) users"
Write-Host "  Per 1 GB disk:     ~$($estUsersPerGB.ToString('N0')) users"
Write-Host "  Per 10 GB disk:    ~$($estUsersIn10GB.ToString('N0')) users"

# Concurrent performance estimate  
$reqPerSec = [math]::Round(1000 / $msPerStats)
Write-Host "`n  Dashboard queries/sec:  ~$reqPerSec (single-threaded)"
Write-Host "  Login throughput:        ~$([math]::Round(1000 / $msPerLogin)) login/sec"

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  CAPACITY TEST COMPLETE" -ForegroundColor Cyan
Write-Host "======================================================`n" -ForegroundColor Cyan
