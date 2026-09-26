#!/bin/bash
# Run with a double-click on macOS, or: bash Import-Blender.command
cd -- "$(dirname -- "$0")" || exit 1
fail() {
  printf '\n%s\n' "$1"
  if [ -t 0 ]; then read -r -p 'Press Return to close. ' _answer; fi
  exit 1
}
[ -f import_scene.py ] && [ -f scene.json ] && [ -d frames ] || fail 'Extract the entire ZIP first. Keep this launcher beside import_scene.py, scene.json, frames/ and resources/.'
blender_bin="${BLENDER_EXECUTABLE:-}"
if [ -z "$blender_bin" ]; then
  for app in /Applications/Blender.app "$HOME/Applications/Blender.app" /Applications/Blender*.app "$HOME"/Applications/Blender*.app; do
    if [ -x "$app/Contents/MacOS/Blender" ]; then
      blender_bin="$app/Contents/MacOS/Blender"
      break
    fi
  done
fi
if [ -z "$blender_bin" ]; then blender_bin="$(command -v blender || true)"; fi
[ -x "$blender_bin" ] || fail 'Blender was not found. Install Blender 4.2 or newer in Applications, or set BLENDER_EXECUTABLE to its executable path.'
printf 'Opening Blender and importing the scene. Large scenes can take several minutes.\nSave the result in Blender with File > Save As.\n'
"$blender_bin" --factory-startup --python-exit-code 1 --python "$PWD/import_scene.py"
result=$?
[ "$result" -eq 0 ] || fail 'Blender could not finish. Check the error above. Blender 4.2 or newer is required.'
