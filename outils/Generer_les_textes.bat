@echo off
chcp 65001 >nul
rem Studio S : PNG de titre et de synthés. Sans argument : tout ce qui manque. Avec des codes : ces conférences-là.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generer.ps1" %*
if "%~1"=="" pause
