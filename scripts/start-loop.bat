@echo off
echo Shopee Auto-Fetcher - Running every 3 minutes
echo Press Ctrl+C to stop
echo.

:loop
cls
echo [%date% %time%] Running scraper...

REM Open Shopee in Chrome
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window "https://seller.shopee.com.my/portal/sale/order?type=shipping"

echo [%date% %time%] Chrome opened. Run your UI.Vision macro manually, or use UI.Vision Pro scheduler.
echo [%date% %time%] Waiting 3 minutes...

REM Wait 3 minutes
timeout /t 180 /nobreak >nul

goto loop
