@echo off
REM ts-edit.cmd - Run ts-edit with UTF-8 encoding
REM Usage: ts-edit --file src/example.ts --list-functions

chcp 65001 >nul 2>&1
node "%~dp0ts-edit.js" %*
