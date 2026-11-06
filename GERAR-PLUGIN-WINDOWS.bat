@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale Node.js LTS e tente novamente.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado. Reinstale Node.js LTS.
  pause
  exit /b 1
)
if not exist "node_modules\@remnote\plugin-sdk\package.json" (
  echo Instalando dependencias do plugin pela primeira vez...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failure
)
echo Executando testes e compilando o plugin...
call npm run build
if errorlevel 1 goto failure
if not exist PluginZip.zip goto failure
echo.
echo [PRONTO] PluginZip.zip foi gerado nesta pasta.
echo Esse e o ZIP correto para instalar no RemNote.
pause
exit /b 0
:failure
echo.
echo [ERRO] Nao foi possivel compilar. Verifique a mensagem acima e a conexao.
pause
exit /b 1
