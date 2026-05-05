@echo off
REM Shopee Order Auto-Fetcher - Runs every 3 minutes
REM This batch opens Chrome with Shopee and triggers UI.Vision macro

echo [%date% %time%] Starting Shopee scraper...

REM Kill any existing Chrome instances (optional - remove if you want to keep other tabs)
REM taskkill /F /IM chrome.exe /T 2>nul

REM Open Shopee Seller page
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "https://seller.shopee.com.my/portal/sale/order?type=shipping"

echo [%date% %time%] Chrome opened. UI.Vision macro should auto-run if set to run on page load.
echo [%date% %time%] Done. Waiting 3 minutes before next run...

REM Wait 3 minutes (180 seconds)
timeout /t 180 /nobreak >nul

REM Loop - this will keep running
goto :eof
