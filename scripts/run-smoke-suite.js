#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

const SMOKE_SCRIPTS = [
  'test:file-storage:smoke',
  'test:security:smoke',
  'test:secrets:smoke',
  'test:cost-control:smoke',
  'test:email-control:smoke',
  'test:platform-control:smoke',
  'test:platform-owner-control:smoke',
  'test:notification-control:smoke',
  'test:tenant-isolation:smoke',
  'test:account-security:smoke',
  'test:attendance:smoke',
  'test:onboarding:smoke',
  'test:policy:smoke',
  'test:legal:smoke',
  'test:live-controls:smoke',
  'test:live-whiteboard:smoke',
  'test:live-breakout:smoke',
  'test:live-polling:smoke',
  'test:live-recording-consent:smoke',
  'test:live-recording-storage:smoke'
];

function parseArgs(argv) {
  return {
    continueOnFailure: argv.includes('--continue')
  };
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function runNpmScript(scriptName) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', scriptName], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', (error) => {
      resolve({
        scriptName,
        ok: false,
        code: null,
        signal: null,
        error: error?.message || String(error)
      });
    });

    child.on('exit', (code, signal) => {
      resolve({
        scriptName,
        ok: code === 0,
        code,
        signal,
        error: null
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passed = [];
  const failed = [];
  const skipped = [];

  printHeader('Ordered Smoke Suite');
  console.log(`Mode: ${args.continueOnFailure ? 'continue after failures' : 'stop on first failure'}`);
  console.log(`Scripts: ${SMOKE_SCRIPTS.length}`);

  for (let index = 0; index < SMOKE_SCRIPTS.length; index += 1) {
    const scriptName = SMOKE_SCRIPTS[index];
    printHeader(`${index + 1}/${SMOKE_SCRIPTS.length} ${scriptName}`);
    const result = await runNpmScript(scriptName);

    if (result.ok) {
      passed.push(scriptName);
      console.log(`[smoke-suite] passed: ${scriptName}`);
      continue;
    }

    failed.push({
      scriptName,
      code: result.code,
      signal: result.signal,
      error: result.error
    });
    console.log(`[smoke-suite] failed: ${scriptName}`);
    if (result.code !== null) console.log(`[smoke-suite] exit code: ${result.code}`);
    if (result.signal) console.log(`[smoke-suite] signal: ${result.signal}`);
    if (result.error) console.log(`[smoke-suite] error: ${result.error}`);

    if (!args.continueOnFailure) {
      for (let skipIndex = index + 1; skipIndex < SMOKE_SCRIPTS.length; skipIndex += 1) {
        skipped.push(SMOKE_SCRIPTS[skipIndex]);
      }
      break;
    }
  }

  printHeader('Summary');
  console.log(`Passed: ${passed.length}`);
  if (passed.length) {
    for (const scriptName of passed) console.log(`- ${scriptName}`);
  }

  console.log(`Failed: ${failed.length}`);
  if (failed.length) {
    for (const item of failed) {
      const suffix = item.code !== null
        ? `exit=${item.code}`
        : item.signal
          ? `signal=${item.signal}`
          : item.error
            ? `error=${item.error}`
            : 'unknown';
      console.log(`- ${item.scriptName} (${suffix})`);
    }
  }

  console.log(`Skipped: ${skipped.length}`);
  if (skipped.length) {
    for (const scriptName of skipped) console.log(`- ${scriptName}`);
  }

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[smoke-suite] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
