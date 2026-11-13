@echo off
chcp 65001 >nul
title Piano Viet - dang len web
cd /d "%~dp0"
echo.
echo  Dang dua thay doi len GitHub (file songs.private.js KHONG duoc dua len)...
echo.
git add -A
git commit -m "Cap nhat web %date% %time%" >nul
git push
if errorlevel 1 (
  echo.
  echo  LOI: khong day len duoc. Kiem tra mang / dang nhap GitHub roi thu lai.
) else (
  echo.
  echo  Xong! Khoang 1-2 phut sau web se cap nhat:
  echo    https://kradtneirev.github.io/virtual-piano/
)
echo.
pause
