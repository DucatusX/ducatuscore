import { spawn } from 'child_process';
import async from 'async';

var scripts = [
  'messagebroker/messagebroker.js',
  'bcmonitor/bcmonitor.js',
  'emailservice/emailservice.js',
  'pushnotificationsservice/pushnotificationsservice.js',
  'fiatrateservice/fiatrateservice.js',
  'dws.js'
];

const cronEnabled = process.env.DUC_CRON_SENDER_ENABLED;
if (cronEnabled && cronEnabled !== 'false') scripts.push('duc-cron-sender/index.js');

if (process.env.MODE === 'dev') {
  scripts.forEach(path => {
    require(`./${path}`);
  });
} else {
  async.eachSeries(scripts, function(script, callback) {
    runScript(script);
    callback();
  });
}

function runScript(script) {
  const scriptPath = `${__dirname}/${script}`;
  const scriptName = script.split('/')[0].split('.')[0];

  const node = spawn('node', [scriptPath]);
  console.log(`\x1b[33m[INFO]\x1b[0m Started script: ${scriptName} (PID: ${node.pid})`);

  node.stdout.on('data', data => console.log(`\x1b[35m${scriptName} \x1b[0m| ${data}`));
  node.stderr.on('data', data => console.error(`\x1b[31m${scriptName} \x1b[0m| ${data}`));
  process.stdin.pipe(node.stdin);

  node.on('close', code => {
    if (code === 0) {
      console.log(`\x1b[32m[INFO]\x1b[0m Script ${scriptName} exited successfully with code ${code}.`);
    } else {
      console.error(`\x1b[31m[ERROR]\x1b[0m Script ${scriptName} exited with code ${code}. Restarting...`);
      setTimeout(() => {
        runScript(script);
      }, 1000); // Restart after a 1-second delay
    }
  });

  node.on('error', err => {
    console.error(`\x1b[31m[ERROR]\x1b[0m Failed to spawn script ${scriptName}:`, err);
    setTimeout(() => {
      runScript(script);
    }, 1000);
  });
}
