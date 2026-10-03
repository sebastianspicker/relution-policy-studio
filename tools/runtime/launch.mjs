import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const engine = join(root, 'apps/policy-engine');
const workbench = join(root, 'apps/workbench');
const planner = join(root, 'apps/planner');
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(
    [
      'Relution Policy Studio local workbench',
      '',
      'pnpm studio [--port NUMBER] [--data-dir PATH] [--no-open] [--no-build]',
      '',
      'One authenticated loopback host. Default data: ~/.local/share/campusweave',
      'Compatibility: pnpm campusweave (alias); pnpm planner --help; pnpm rexp --help',
    ].join('\n'),
  );
  process.exit(0);
}

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${name}`);
  return args[index + 1];
}

for (let index = 0; index < args.length; index++) {
  if (['--port', '--data-dir'].includes(args[index])) {
    index++;
    continue;
  }
  if (!['--no-open', '--no-build'].includes(args[index])) throw new Error(`Unknown option: ${args[index]}`);
}

const port = Number(option('--port', '8787'));
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be 0–65535');

function run(command, commandArgs, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, commandArgs, {cwd, stdio: 'inherit'});
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolveRun() : reject(new Error(`${command} failed (${code})`))));
  });
}

if (!args.includes('--no-build')) {
  await run('pnpm', ['build:node'], engine);
  await run('pnpm', ['build'], workbench);
}

// Import after the optional build so a fresh checkout loads the just-built host.
const {startStudioHost} = await import('rexp-studio/host');
const host = await startStudioHost({
  dataDir: resolve(option('--data-dir', join(homedir(), '.local/share/campusweave'))),
  port,
  staticRoot: join(workbench, 'dist'),
  planner: {pythonExecutable: join(planner, '.venv/bin/python'), cwd: planner},
});
console.log(`Relution Policy Studio is running locally: ${host.browserUrl}`);

if (!args.includes('--no-open')) {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browser = spawn(command, [host.browserUrl], {stdio: 'ignore'});
  browser.on('error', () => console.log('Open the local URL above in your browser.'));
}

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await host.close();
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
