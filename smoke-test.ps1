# delly-api smoke test â€” customer lifecycle
param(
  [string]$Server = 'http://127.0.0.1:7456'
)

$script:AdminToken = (Invoke-RestMethod -Uri "$Server/auth/login" -Method Post -ContentType 'application/json' -Body (ConvertToJson @{ phone='09120000000'; password='admin-123456' }) -TimeoutSec 15).accessToken

function Do-Build {
  param([string]$method, [string]$path, [object]$body, [string]$auth)
  try {
    if ($body -eq $null) {
      return Invoke-RestMethod -Uri "$Server$path" -Method $method -ContentType 'application/json' -Headers @{ Authorization='Bearer ' + $auth } -TimeoutSec 15
    } else {
      return Invoke-RestMethod -Uri "$Server$path" -Method $method -ContentType 'application/json' -Body (ConvertToJson $body) -Headers @{ Authorization='Bearer ' + $auth } -TimeoutSec 15
    }
  } catch {
    Write-Error "Request $method $path failed: $_"
    exit 1
  }
}

Write-Output '=== 1. create a customer ==='
$cust = Do-Build Post '/auth/login' @{ phone='09121111111'; password='cust-123456' } $null
Write-Output ('   created id=' + $cust.user.id + ' role=' + $cust.user.role + ' name=' + $cust.user.name + ' verified=' + $cust.user.verified)

Write-Output '=== 2. profile incomplete (no badge yet) ==='
$check = Do-Build Get '/users/me/check' $null $cust.accessToken
Write-Output ('   incomplete=' + $check.incomplete)
Write-Output ('   missing=' + ($check.missing -join ','))

Write-Output '=== 3. place MANUAL buy (unverified) ==='
$r = Do-Build Post '/trade/orders' @{ symbol='GOLD18'; side='BUY'; grams=1.0 } $cust.accessToken
$orderId = $r.id
Write-Output ('   order id=' + $orderId)
Write-Output ('   status=' + $r.status + ' grams=' + $r.grams + ' amount=' + $r.amount + ' fee=' + $r.fee + ' price=' + $r.price + ' fulfillment=' + $r.fulfillment + ' addr=' + $r.deliveryAddress)

Write-Output '=== 4. submit receipt + fulfillment choice (PICKUP) ==='
$r2 = Do-Build Post "/trade/orders/$orderId/receipt" @{ receiptPath='UPLOADS/2026-10-12_123.pdf'; receiptNote='ÙÛŒØ´ Ø¨Ø§Ù†Ú©'; fulfillment='PICKUP'; deliveryAddress='' } $cust.accessToken
Write-Output ('   now status=' + $r2.status)

Write-Output '=== 5. customer wallet (untouched â€” no gold, no cash) ==='
$w = Do-Build Get '/trade/wallet' $null $cust.accessToken
Write-Output ('   cash=' + $w.balance + ' goldGram=' + $w.positions.GOLD18.grams)

Write-Output '=== 6. manager queue (SUPER_ADMIN) ==='
$q = Do-Build Get '/trade/review-queue' $null $script:AdminToken
Write-Output ('   queue length=' + $q.Count + ' for ' + $q[0].user.name + ' status=' + $q[0].status)

Write-Output '=== 7. approve ==='
$r3 = Do-Build Post "/trade/orders/$orderId/review" @{ approve=$true; note='Ù¾Ø±Ø¯Ø§Ø²Ø´ Ø§Ù†Ø¬Ø§Ù… Ø´Ø¯' } $script:AdminToken
Write-Output ('   approved status=' + $r3.status + ' gramsNow=' + $r3.grams)

Write-Output '=== 8. customer sees their gold ==='
$p = Do-Build Get '/trade/positions' $null $cust.accessToken
Write-Output ('   GOLD18=' + $p.GOLD18.grams + ' at ' + $p.GOLD18.avgCost + ' Toman/g')

Write-Output '=== 9. trial balance ==='
$t = Do-Build Get '/reports/trial-balance' $null $script:AdminToken
Write-Output ('   difference=' + $t.difference + ' balanced=' + $t.balanced)

Write-Output '=== 10. sign out ==='
Invoke-RestMethod -Uri "$Server/auth/logout" -Method Post -ContentType 'application/json' -Body (ConvertToJson @{ refreshToken='' }) -TimeoutSec 15
Write-Output 'DONE'

