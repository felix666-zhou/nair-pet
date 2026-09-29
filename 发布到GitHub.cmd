@echo off
rem ============================================================
rem  Publish this folder to GitHub (for GitHub Pages hosting)
rem  ASCII only on purpose: cmd.exe reads .cmd with the OEM codepage.
rem ============================================================
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [X] git not found. Install Git first: https://git-scm.com/download/win
  pause
  exit /b 1
)

echo.
echo   Step 1: create an EMPTY repository on github.com
echo           (do NOT add README / .gitignore / license)
echo   Step 2: paste its address below, e.g.
echo           https://github.com/yourname/nair-pet.git
echo.
set /p REPO=  Repo address: 
if "%REPO%"=="" goto :end

git config --global user.name >nul 2>nul
if errorlevel 1 (
  set /p GITNAME=  Your name for git commits: 
  set /p GITMAIL=  Your email for git commits: 
  git config --global user.name "%GITNAME%"
  git config --global user.email "%GITMAIL%"
)

git remote remove origin >nul 2>nul
git remote add origin "%REPO%"
git branch -M main
echo.
echo   Uploading (about 55 MB, may take a few minutes) ...
git push -u origin main
if errorlevel 1 (
  echo.
  echo   [X] Push failed. Common reasons:
  echo       - wrong repo address
  echo       - GitHub requires a token instead of a password:
  echo         Settings - Developer settings - Personal access tokens - repo scope
  pause
  exit /b 1
)

echo.
echo   Done. Now enable the website:
echo     open  %REPO%
echo     Settings - Pages - Source: "Deploy from a branch"
echo     Branch: main   Folder: / (root)   then Save
echo.
echo   Your URL will be:
echo     https://YOUR-NAME.github.io/REPO-NAME/
echo.
:end
pause
