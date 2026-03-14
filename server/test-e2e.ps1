##############################################################################
#  StarSim Central Terminal — End-to-End Test
#  Tests BOTH user perspective AND terminal perspective
##############################################################################
$base = "http://localhost:3777"
$pass = 0; $fail = 0

function Assert($label, $cond) {
    if ($cond) {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $label" -ForegroundColor Red
        $script:fail++
    }
}

function POST($path, $body) {
    return Invoke-RestMethod -Uri "$base$path" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
}
function GET($path, $token) {
    $h = @{}; if ($token) { $h["Authorization"] = "Bearer $token" }
    return Invoke-RestMethod -Uri "$base$path" -Headers $h
}
function DELETE($path, $token) {
    $h = @{Authorization="Bearer $token"}
    return Invoke-RestMethod -Uri "$base$path" -Method DELETE -Headers $h
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  STARSIM CENTRAL TERMINAL — END-TO-END TEST" -ForegroundColor Cyan
Write-Host "======================================================`n" -ForegroundColor Cyan

# ── PHASE 1: Terminal sees empty state ─────────────────────────────────
Write-Host "─── PHASE 1: Terminal — Empty State ───" -ForegroundColor Yellow
$stats = GET "/api/terminal/stats"
Assert "0 users on fresh DB" ($stats.userCount -eq 0)
Assert "0 saves on fresh DB" ($stats.saveCount -eq 0)
Assert "0 bodies on fresh DB" ($stats.totalBodies -eq 0)
Assert "Empty leaderboard" ($stats.topCreators.Count -eq 0)
Assert "Empty recent activity" ($stats.recentSaves.Count -eq 0)

# ── PHASE 2: User A registers ─────────────────────────────────────────
Write-Host "`n─── PHASE 2: User A — Registration ───" -ForegroundColor Yellow
$regA = POST "/api/auth/register" @{username="alice_stargazer"; password="cosmic123"; email="alice@stars.com"}
$tokenA = $regA.token
Assert "User A registered (got token)" ($tokenA.Length -gt 20)
Assert "Username correct" ($regA.user.username -eq "alice_stargazer")
Assert "Email stored" ($regA.user.email -eq "alice@stars.com")
Assert "Has password flag" ($regA.user.hasPassword -eq $true)

# Terminal should now see 1 user
$stats = GET "/api/terminal/stats"
Assert "Terminal sees 1 user" ($stats.userCount -eq 1)

# ── PHASE 3: User A logs in ───────────────────────────────────────────
Write-Host "`n─── PHASE 3: User A — Login ───" -ForegroundColor Yellow
$loginA = POST "/api/auth/login" @{username="alice_stargazer"; password="cosmic123"}
Assert "Login succeeded (got token)" ($loginA.token.Length -gt 20)
Assert "Login returns correct user" ($loginA.user.username -eq "alice_stargazer")

# Verify /me endpoint
$meA = GET "/api/auth/me" $tokenA
Assert "/me returns correct user" ($meA.user.username -eq "alice_stargazer")

# ── PHASE 4: User A creates cloud saves ───────────────────────────────
Write-Host "`n─── PHASE 4: User A — Cloud Saves ───" -ForegroundColor Yellow
$simData1 = @{bodies=@(@{name="Sun";mass=1},{name="Earth";mass=0.000003},{name="Mars";mass=0.0000003}); time=42.5} | ConvertTo-Json -Compress
$h = @{Authorization="Bearer $tokenA"}

$s1 = Invoke-RestMethod -Uri "$base/api/saves" -Method POST -ContentType "application/json" -Headers $h -Body (@{slotName="Solar System Classic"; simData=$simData1; bodyCount=3; simTime=42.5} | ConvertTo-Json -Compress)
Assert "Save 1 created (id=$($s1.id))" ($s1.id -gt 0)

$simData2 = @{bodies=@(@{name="Sirius";mass=2.1},{name="PlanetX";mass=0.01},{name="PlanetY";mass=0.005},{name="Moon1";mass=0.0001},{name="Moon2";mass=0.00005}); time=1337} | ConvertTo-Json -Compress
$s2 = Invoke-RestMethod -Uri "$base/api/saves" -Method POST -ContentType "application/json" -Headers $h -Body (@{slotName="Binary Star Chaos"; simData=$simData2; bodyCount=5; simTime=1337} | ConvertTo-Json -Compress)
Assert "Save 2 created (id=$($s2.id))" ($s2.id -gt 0)

$simData3 = @{bodies=@(@{name="BlackHole";mass=1000000}); time=9999999} | ConvertTo-Json -Compress
$s3 = Invoke-RestMethod -Uri "$base/api/saves" -Method POST -ContentType "application/json" -Headers $h -Body (@{slotName="Black Hole Orbit"; simData=$simData3; bodyCount=1; simTime=9999999} | ConvertTo-Json -Compress)
Assert "Save 3 created" ($s3.id -gt 0)

# ── PHASE 5: Terminal sees User A's activity ──────────────────────────
Write-Host "`n─── PHASE 5: Terminal — Sees User A Activity ───" -ForegroundColor Yellow
$stats = GET "/api/terminal/stats"
Assert "Terminal: 1 user" ($stats.userCount -eq 1)
Assert "Terminal: 3 saves" ($stats.saveCount -eq 3)
Assert "Terminal: 9 total bodies (3+5+1)" ($stats.totalBodies -eq 9)
Assert "Leaderboard: alice is #1" ($stats.topCreators[0].username -eq "alice_stargazer")
Assert "Leaderboard: alice has 9 bodies" ($stats.topCreators[0].total_bodies -eq 9)
Assert "Recent: latest save on top" ($stats.recentSaves[0].slot_name -eq "Black Hole Orbit")
Assert "Recent: shows 3 entries" ($stats.recentSaves.Count -eq 3)

# ── PHASE 6: User B registers and saves ──────────────────────────────
Write-Host "`n─── PHASE 6: User B — Register + Save ───" -ForegroundColor Yellow
$regB = POST "/api/auth/register" @{username="bob_voyager"; password="nebula456"; email="bob@galaxy.io"}
$tokenB = $regB.token
Assert "User B registered" ($tokenB.Length -gt 20)

$hB = @{Authorization="Bearer $tokenB"}
$simB = @{bodies=@(1..12 | ForEach-Object { @{name="Planet$_";mass=(Get-Random -Minimum 1 -Maximum 100)/1000} }); time=500} | ConvertTo-Json -Compress
$sB = Invoke-RestMethod -Uri "$base/api/saves" -Method POST -ContentType "application/json" -Headers $hB -Body (@{slotName="12-Planet Mega System"; simData=$simB; bodyCount=12; simTime=500} | ConvertTo-Json -Compress)
Assert "Bob's save created" ($sB.id -gt 0)

# ── PHASE 7: User C registers (no saves — pure lurker) ───────────────
Write-Host "`n─── PHASE 7: User C — Register Only (no saves) ───" -ForegroundColor Yellow
$regC = POST "/api/auth/register" @{username="charlie_lurker"; password="dark789"; email="charlie@void.net"}
Assert "User C registered" ($regC.token.Length -gt 20)

# ── PHASE 8: Terminal — Full multi-user state ─────────────────────────
Write-Host "`n─── PHASE 8: Terminal — Full Multi-User Dashboard ───" -ForegroundColor Yellow
$stats = GET "/api/terminal/stats"
Assert "Terminal: 3 users" ($stats.userCount -eq 3)
Assert "Terminal: 4 total saves" ($stats.saveCount -eq 4)
Assert "Terminal: 21 total bodies (9+12)" ($stats.totalBodies -eq 21)

$leader = $stats.topCreators[0]
# Bob has 12, Alice has 9
Assert "Leaderboard #1: bob (12 bodies)" ($leader.username -eq "bob_voyager" -and $leader.total_bodies -eq 12)
$leader2 = $stats.topCreators[1]
Assert "Leaderboard #2: alice (9 bodies)" ($leader2.username -eq "alice_stargazer" -and $leader2.total_bodies -eq 9)
$leader3 = $stats.topCreators[2]
Assert "Leaderboard #3: charlie (0 bodies)" ($leader3.username -eq "charlie_lurker" -and $leader3.total_bodies -eq 0)

Assert "Recent: Bob's save is newest" ($stats.recentSaves[0].username -eq "bob_voyager")

# ── PHASE 9: User A loads and verifies their save data ────────────────
Write-Host "`n─── PHASE 9: User A — Load Back Save Data ───" -ForegroundColor Yellow
$mySaves = GET "/api/saves" $tokenA
Assert "Alice sees 3 saves" ($mySaves.saves.Count -eq 3)

$loaded = GET "/api/saves/$($s1.id)" $tokenA
Assert "Loaded save has correct slot name" ($loaded.save.slot_name -eq "Solar System Classic")
Assert "Loaded save has sim_data" ($loaded.save.sim_data.Length -gt 10)
$parsed = $loaded.save.sim_data | ConvertFrom-Json
Assert "Loaded data has 3 bodies" ($parsed.bodies.Count -eq 3)
Assert "First body is Sun" ($parsed.bodies[0].name -eq "Sun")

# ── PHASE 10: User A's personal stats in terminal ────────────────────
Write-Host "`n─── PHASE 10: User A — My Stats (Terminal) ───" -ForegroundColor Yellow
$myStats = GET "/api/terminal/my-stats" $tokenA
Assert "My saves: 3" ($myStats.saveCount -eq 3)
Assert "My total bodies: 9" ($myStats.totalBodies -eq 9)

# ── PHASE 11: User A deletes a save, terminal updates ────────────────
Write-Host "`n─── PHASE 11: Delete Save — Terminal Updates ───" -ForegroundColor Yellow
$del = DELETE "/api/saves/$($s3.id)" $tokenA
Assert "Delete succeeded" ($del.message -eq "Save deleted")

$stats = GET "/api/terminal/stats"
Assert "Terminal: now 3 saves" ($stats.saveCount -eq 3)
Assert "Terminal: now 20 bodies (8+12)" ($stats.totalBodies -eq 20)

# ── PHASE 12: User A overwrites existing save ────────────────────────
Write-Host "`n─── PHASE 12: User A — Overwrite Save ───" -ForegroundColor Yellow
$simUpdated = @{bodies=@(@{name="Sun";mass=1},{name="Earth";mass=0.000003},{name="Mars";mass=0.0000003},{name="Jupiter";mass=0.001}); time=100} | ConvertTo-Json -Compress
$sUpd = Invoke-RestMethod -Uri "$base/api/saves" -Method POST -ContentType "application/json" -Headers $h -Body (@{slotName="Solar System Classic"; simData=$simUpdated; bodyCount=4; simTime=100} | ConvertTo-Json -Compress)
Assert "Overwrite used same ID" ($sUpd.id -eq $s1.id)
Assert "Overwrite message" ($sUpd.message -eq "Save updated")

$stats = GET "/api/terminal/stats"
Assert "Terminal: still 3 saves (overwrite, not new)" ($stats.saveCount -eq 3)
Assert "Terminal: 21 bodies now (4+5+12)" ($stats.totalBodies -eq 21)

# ── PHASE 13: Login validation tests ─────────────────────────────────
Write-Host "`n─── PHASE 13: Auth Error Handling ───" -ForegroundColor Yellow
$errored = $false
try { POST "/api/auth/login" @{username="alice_stargazer"; password="WRONG"} } catch { $errored = $true }
Assert "Wrong password rejected" $errored

$errored = $false
try { POST "/api/auth/register" @{username="alice_stargazer"; password="anything"} } catch { $errored = $true }
Assert "Duplicate username rejected" $errored

$errored = $false
try { POST "/api/auth/register" @{username="ab"; password="short"} } catch { $errored = $true }
Assert "Short username rejected" $errored

$errored = $false
try { GET "/api/saves" "invalid-token-here" } catch { $errored = $true }
Assert "Invalid token rejected" $errored

# ── PHASE 14: Password reset flow ────────────────────────────────────
Write-Host "`n─── PHASE 14: Password Reset Flow ───" -ForegroundColor Yellow
$forgot = POST "/api/auth/forgot" @{email="alice@stars.com"}
Assert "Forgot password accepted" ($forgot.message -like "*reset link*")

# ── SUMMARY ───────────────────────────────────────────────────────────
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  TEST RESULTS: $pass PASSED, $fail FAILED" -ForegroundColor $(if($fail -eq 0){"Green"}else{"Red"})
Write-Host "======================================================`n" -ForegroundColor Cyan
