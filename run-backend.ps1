cd C:\dev\pharmacy-system\backend
$env:PORT=3001
node src/index.js 2>&1 | Tee-Object -FilePath C:\dev\pharmacy-system\backend.log -Append
