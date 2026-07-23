$ErrorActionPreference = "Continue"

# Start Next.js server in background
$process = Start-Process -FilePath "npx" -ArgumentList "serve", ".next", "-l", "3000" -WorkingDirectory $PWD -PassThru -WindowStyle Hidden

Write-Host "Server started with PID: $($process.Id)"
Write-Host "Open http://localhost:3000 in your browser"

# Wait a bit then verify
Start-Sleep -Seconds 2

if ($process.HasExited) {
    Write-Host "Server exited with code: $($process.ExitCode)"
} else {
    Write-Host "Server is running!"
}
