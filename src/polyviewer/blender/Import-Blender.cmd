@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if not exist "import_scene.py" goto incomplete
if not exist "scene.json" goto incomplete
if not exist "frames\" goto incomplete
if defined BLENDER_EXECUTABLE goto launch
for /f "delims=" %%B in ('where blender.exe 2^>nul') do set "BLENDER_EXECUTABLE=%%B"
if defined BLENDER_EXECUTABLE goto launch
for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender*") do if exist "%%~D\blender.exe" set "BLENDER_EXECUTABLE=%%~D\blender.exe"
if defined BLENDER_EXECUTABLE goto launch
for /d %%D in ("%LOCALAPPDATA%\Programs\Blender Foundation\Blender*") do if exist "%%~D\blender.exe" set "BLENDER_EXECUTABLE=%%~D\blender.exe"
if defined BLENDER_EXECUTABLE goto launch
echo Blender was not found. Install Blender 4.2 or newer from blender.org.
echo For a portable installation, set BLENDER_EXECUTABLE to the full blender.exe path.
pause
exit /b 1
:incomplete
echo Extract the entire ZIP first. Keep this launcher beside import_scene.py,
echo scene.json, frames and resources.
pause
exit /b 1
:launch
if not exist "%BLENDER_EXECUTABLE%" (
  echo The BLENDER_EXECUTABLE path does not exist.
  pause
  exit /b 1
)
echo Opening Blender and importing the scene. Large scenes can take several minutes.
echo Save the result in Blender with File ^> Save As.
"%BLENDER_EXECUTABLE%" --factory-startup --python-exit-code 1 --python "%CD%\import_scene.py"
if errorlevel 1 (
  echo Blender could not finish. Check the error above. Blender 4.2 or newer is required.
  pause
  exit /b 1
)
endlocal
