import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Explicit test device only: never change a connected physical phone's settings.
const adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const run=(args,options={})=>execFileSync(adb,['-s','emulator-5554',...args],{maxBuffer:24*1024*1024,...options});
if(process.argv[2]==='launch') {
  run(['shell','am','force-stop','com.plajah.app']);
  run(['shell',"run-as com.plajah.app sh -c 'mkdir -p shared_prefs && cat > shared_prefs/plajah_shell.xml'"],{
    input:'<?xml version="1.0" encoding="utf-8" standalone="yes" ?><map><boolean name="plajah_native_shell" value="true" /></map>'
  });
  console.log(run(['shell','am','start','-n','com.plajah.app/.MainActivity']).toString());
} else if(process.argv[2]==='capture') {
  fs.mkdirSync('artifacts',{recursive:true});
  fs.writeFileSync('artifacts/chora-night-native.png',run(['exec-out','screencap','-p']));
  console.log('artifacts/chora-night-native.png');
} else if(process.argv[2]==='hierarchy') {
  run(['shell','uiautomator','dump','/sdcard/chora-ui.xml']);
  console.log(run(['shell','cat','/sdcard/chora-ui.xml']).toString());
} else throw new Error('Use launch, capture, or hierarchy.');
