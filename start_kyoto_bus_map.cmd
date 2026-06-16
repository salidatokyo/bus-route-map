@echo off
setlocal
cd /d "%~dp0"

set "PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"

start "" http://127.0.0.1:8000/index.html
"%PYTHON%" -m http.server 8000 --bind 127.0.0.1
