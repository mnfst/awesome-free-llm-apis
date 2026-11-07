@echo off
setlocal

where gh >nul 2>nul
if errorlevel 1 (
	echo GitHub CLI is not installed yet.
	echo Opening the official GitHub CLI download page...
	start "" "https://cli.github.com/"
	echo Install GitHub CLI, then double-click this file again.
	pause
	exit /b 1
)

gh auth status --hostname github.com >nul 2>nul
if errorlevel 1 (
	echo A browser window will open so you can sign in to GitHub.
	gh auth login --hostname github.com --web --scopes repo
) else (
	echo Confirm GitHub access for creating public website repositories.
	gh auth refresh --hostname github.com --scopes repo
)

if errorlevel 1 (
	echo GitHub sign-in did not complete. Run this file again to retry.
	pause
	exit /b 1
)

echo.
echo GitHub connection ready:
gh api user --jq ".login"
echo.
echo Noah Tool AI can now publish websites after you review and confirm them.
pause
endlocal
