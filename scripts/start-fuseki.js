const { exec } = require('child_process');
const os = require('os');
const path = require('path');

const fusekiDir = path.resolve(__dirname, '../fuseki');
const isWindows = os.platform() === 'win32';
const command = isWindows ? 'fuseki-server.bat' : './fuseki-server.sh';

const fusekiProcess = exec(command, { cwd: fusekiDir });

fusekiProcess.stdout.on('data', (data) => {
    console.log(data.toString());
});

fusekiProcess.stderr.on('data', (data) => {
    console.error(data.toString());
});

fusekiProcess.on('exit', (code) => {
    console.log(`Fuseki server exited with code ${code}`);
});
