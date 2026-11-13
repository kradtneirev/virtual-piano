@echo off
chcp 65001 >nul
title Piano Viet - may chu cho dien thoai
cd /d "%~dp0"
echo.
echo ============================================================
echo   PIANO VIET - mo tren dien thoai
echo ============================================================
echo   1) Dien thoai va may tinh phai cung mang Wi-Fi.
echo   2) Tren dien thoai, mo trinh duyet (Chrome / Safari) va go
echo      mot trong cac dia chi sau:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo        http://%%a:8000
echo.
echo   3) Neu Windows hoi ve tuong lua (Firewall), chon "Mang rieng tu"
echo      (Private) roi bam Cho phep (Allow access).
echo   4) Giu cua so nay mo trong luc choi. Dong cua so = tat may chu.
echo ============================================================
echo.
python -m http.server 8000 --bind 0.0.0.0
if errorlevel 1 (
  echo.
  echo Khong chay duoc "python". Hay cai Python tu python.org roi thu lai.
  pause
)
