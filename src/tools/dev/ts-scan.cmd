@echo off
REM ts-scan.cmd - Run ts-scan with UTF-8 encoding
REM Usage: ts-scan --dir src --search services

chcp 65001 >nul 2>&1
node "%~dp0ts-scan.js" %*
