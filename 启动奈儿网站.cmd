@echo off
rem Nair web pet - start the tiny local server (PowerShell only) and open the browser.
rem ASCII only on purpose: cmd.exe reads this file with the OEM codepage.
rem Port: change 8080 below, or run: powershell -ExecutionPolicy Bypass -File serve.ps1 8081
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" 8080
