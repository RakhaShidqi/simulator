@echo off
echo ========================================
echo   DEMO CYBERSECURITY - NGROK TUNNEL
echo ========================================
echo.

:: Jalankan server Node
start /B node server.js
echo [✓] Server started on port 3000
timeout /t 3 /nobreak > nul

:: Jalankan ngrok
echo [*] Starting ngrok tunnel...
start /B ngrok http 3000

:: Tunggu tunnel siap
timeout /t 5 /nobreak > nul

:: Buka dashboard ngrok
start http://localhost:4040

:: Dapatkan URL
echo.
echo ========================================
echo TUNNEL AKTIF! Lihat URL di:
echo http://localhost:4040
echo.
echo LINK UNTUK KORBAN: http://localhost:3000/demo
echo (ganti dengan URL ngrok yang muncul)
echo ========================================
echo.
echo Tekan Ctrl+C untuk menghentikan...
pause
