import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const patterns = {
  // Common prefixes
  'Google API Key': /AIza[0-9A-Za-z-_]{35}/,
  'OpenRouter Key': /sk-or-v1-[a-zA-Z0-9]{64}/,
  'Bearer Token': /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/,
  'Private Key': /-----BEGIN PRIVATE KEY-----/
};

const ignoredDirs = ['.git', 'node_modules', 'dist', 'build', 'coverage'];

function scanDir(dir) {
  let foundSecrets = false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.includes(entry.name)) {
        const hasSecrets = scanDir(path.join(dir, entry.name));
        if (hasSecrets) foundSecrets = true;
      }
    } else {
      const ext = path.extname(entry.name);
      // Skip known binary or very large files generally not useful to regex scan or safe
      if (['.json', '.md', '.ts', '.tsx', '.js', '.jsx', '.css', '.html'].includes(ext) || entry.name === '.env.example') {
        const filePath = path.join(dir, entry.name);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          for (const [name, regex] of Object.entries(patterns)) {
            if (regex.test(content)) {
              console.error(`❌ [WARNING] Potential secret found: ${name} in ${filePath}`);
              foundSecrets = true;
            }
          }
        } catch (err) {
          // Ignore read errors
        }
      }
    }
  }
  return foundSecrets;
}

console.log("Scanning for secrets...");
const found = scanDir(rootDir);

if (found) {
  console.error("\nRun failed: Please remove the real secrets and use environment variables instead.");
  process.exit(1);
} else {
  console.log("✅ No clear plain-text secrets found in standard source files.");
  process.exit(0);
}
