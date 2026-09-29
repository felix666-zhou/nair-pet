@echo off
rem Create the GitHub repo, push this folder, and enable GitHub Pages.
rem Needs a token in ..\github-token.txt  (see the comments inside that file).
rem ASCII only on purpose: cmd.exe reads .cmd with the OEM codepage.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-repo.ps1"
echo.
pause
