import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const credentialPatterns = [
  ['OpenAI/Anthropic credential', /\bsk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9_-]{24,}/],
  ['Google credential', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['Groq credential', /\bgsk_[0-9A-Za-z]{25,}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

/** Return locations and credential names only; never return matching values. */
export function scanBrowserCredentials(directory, environment) {
  const secrets = Object.entries(environment).filter(([name, value]) =>
    /(?:API_?KEY|ACCESS_?TOKEN|SECRET|PASSWORD|PRIVATE_?KEY)/i.test(name)
    && typeof value === 'string' && value.length >= 12
    && !/^(?:placeholder|your[_-]|replace[_-]|example)/i.test(value));
  const findings = [];
  const visit = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = resolve(folder, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!entry.isFile()) continue;
      const contents = readFileSync(file);
      const types = secrets.filter(([, value]) => contents.includes(Buffer.from(value))).map(([name]) => name);
      const text = contents.toString('utf8');
      for (const [name, pattern] of credentialPatterns) if (pattern.test(text)) types.push(name);
      if (types.length) findings.push({ file: relative(directory, file), types: [...new Set(types)] });
    }
  };
  if (!statSync(directory).isDirectory()) throw new Error('Build output directory is required.');
  visit(directory);
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] || 'dist');
  try {
    const findings = scanBrowserCredentials(directory, loadEnv(process.env.NODE_ENV || 'production', process.cwd(), ''));
    if (findings.length) {
      console.error('Browser credential check failed (credential values withheld):');
      for (const finding of findings) console.error(`${finding.file}: ${finding.types.join(', ')}`);
      process.exitCode = 1;
    } else console.log('Browser credential check passed: no configured secrets or provider credentials found.');
  } catch {
    console.error('Browser credential check could not inspect the build output. Build the app first.');
    process.exitCode = 1;
  }
}
