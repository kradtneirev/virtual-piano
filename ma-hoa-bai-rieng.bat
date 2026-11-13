@echo off
chcp 65001 >nul
title Piano Viet - ma hoa bai rieng tu
cd /d "%~dp0"
echo.
echo ============================================================
echo   MA HOA BAI RIENG TU (songs.private.js)
echo   Mat khau chi nhap o day, khong luu o dau ca. Hay nho ky!
echo ============================================================
echo.
node tools\ma-hoa-bai-rieng.js
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
echo.
choice /m "Dua len web luon"
if errorlevel 2 exit /b 0
call "%~dp0dang-len-web.bat"
