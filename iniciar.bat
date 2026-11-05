@echo off
title Campanella V7 — Servidor Local
echo ========================================================
echo   CAMPANELLA V7 — SERVIDOR LOCAL
echo   Acesse no navegador: http://127.0.0.1:8001
echo ========================================================
npx.cmd --yes http-server . -p 8001 -a 127.0.0.1 -c-1
pause
