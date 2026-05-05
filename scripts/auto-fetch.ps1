# Shopee Order Auto-Fetcher - Smart Refresh Version
# Opens Chrome once, then refreshes every 3 minutes
# Press Ctrl+C to stop

# Load Windows Forms for SendKeys
Add-Type -AssemblyName System.Windows.Forms

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$shopeeUrl = "https://seller.shopee.com.my/portal/sale/order?type=toship&source=all&sort_by=ship_by_date_asc"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Shopee Auto-Fetcher (Refresh Mode)" -ForegroundColor Green
Write-Host "Opens once, refreshes every 3 min" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Green

# Check if Chrome is already running with Shopee
$existingChrome = Get-Process | Where-Object { 
    $_.ProcessName -eq "chrome" -and $_.MainWindowTitle -like "*Shopee*" 
}

if (-not $existingChrome) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Opening Chrome with Shopee..." -ForegroundColor Cyan
    Start-Process $chromePath -ArgumentList "--new-window", "--app=$shopeeUrl"
    Start-Sleep -Seconds 5  # Wait for page load
} else {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Chrome already open, will refresh..." -ForegroundColor Gray
}

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] IMPORTANT: Start your UI.Vision macro now!" -ForegroundColor Magenta
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] The macro should auto-run on page load/refresh" -ForegroundColor Magenta
Write-Host ""

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    # Find Chrome window and refresh (F5)
    $chrome = Get-Process | Where-Object { 
        $_.ProcessName -eq "chrome" -and $_.MainWindowTitle -like "*Shopee*" 
    } | Select-Object -First 1
    
    if ($chrome) {
        Write-Host "[$timestamp] Refreshing Shopee page..." -ForegroundColor Cyan
        # Bring to front briefly then refresh
        Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class WinAPI {
                [DllImport("user32.dll")]
                public static extern bool SetForegroundWindow(IntPtr hWnd);
                [DllImport("user32.dll")]
                public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                public const int SW_MINIMIZE = 6;
                public const int SW_RESTORE = 9;
            }
"@
        [WinAPI]::ShowWindow($chrome.MainWindowHandle, 9) | Out-Null  # Restore
        [WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
        Start-Sleep -Milliseconds 500
        [System.Windows.Forms.SendKeys]::SendWait("{F5}")  # Refresh
        Start-Sleep -Milliseconds 500
        [WinAPI]::ShowWindow($chrome.MainWindowHandle, 6) | Out-Null  # Minimize
    } else {
        Write-Host "[$timestamp] Chrome not found, reopening..." -ForegroundColor Yellow
        Start-Process $chromePath -ArgumentList "--new-window", "--app=$shopeeUrl"
    }
    
    Write-Host "[$timestamp] Waiting 60 seconds... (minimize this window if you want)" -ForegroundColor Gray
    Start-Sleep -Seconds 60
}
