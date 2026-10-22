import { spawn } from 'child_process';
import async from 'async';
import { exponentialBackoff } from './lib/retry';

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

// A script that keeps crashing (e.g. a dependency is down) is restarted with exponential backoff
// instead of every second; the counter resets once the script has stayed up for a minute.
const STABLE_RUN_MS = 60 * 1000;
const restartAttempts: { [script: string]: number } = {};

function restartLater(script, scriptName, startedAt) {
  if (Date.now() - startedAt >= STABLE_RUN_MS) {
    restartAttempts[script] = 0;
  }
  const attempt = restartAttempts[script] || 0;
  restartAttempts[script] = attempt + 1;
  const delay = exponentialBackoff(attempt);
  console.error(`\x1b[31m[ERROR]\x1b[0m Restarting ${scriptName} in ${(delay / 1000).toFixed(1)}s...`);
  setTimeout(() => runScript(script), delay);
}

function runScript(script) {
  const scriptPath = `${__dirname}/${script}`;
  const scriptName = script.split('/')[0].split('.')[0];
  const startedAt = Date.now();
  let restarting = false;
  // 'error' and 'close' can both fire for the same child, restart it once.
  const restart = () => {
    if (!restarting) {
      restarting = true;
      restartLater(script, scriptName, startedAt);
    }
  };

  const node = spawn('node', [scriptPath]);
  console.log(`\x1b[33m[INFO]\x1b[0m Started script: ${scriptName} (PID: ${node.pid})`);

  node.stdout.on('data', data => console.log(`\x1b[35m${scriptName} \x1b[0m| ${data}`));
  node.stderr.on('data', data => console.error(`\x1b[31m${scriptName} \x1b[0m| ${data}`));
  process.stdin.pipe(node.stdin);

  node.on('close', code => {
    if (code === 0) {
      console.log(`\x1b[32m[INFO]\x1b[0m Script ${scriptName} exited successfully with code ${code}.`);
    } else {
      console.error(`\x1b[31m[ERROR]\x1b[0m Script ${scriptName} exited with code ${code}.`);
      restart();
    }
  });

  node.on('error', err => {
    console.error(`\x1b[31m[ERROR]\x1b[0m Failed to spawn script ${scriptName}:`, err);
    restart();
  });
}
