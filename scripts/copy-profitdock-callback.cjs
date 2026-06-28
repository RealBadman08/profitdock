const fs = require('fs');
const path = require('path');

const project_root = path.resolve(__dirname, '..');
const source_path = path.join(project_root, 'public', 'profitdock-auth-callback.html');
const dist_path = path.join(project_root, 'dist', 'profitdock-auth-callback.html');

if (!fs.existsSync(source_path)) {
    throw new Error(`ProfitDock callback source was not found: ${source_path}`);
}

fs.copyFileSync(source_path, dist_path);
console.log(`Copied ProfitDock callback page to ${dist_path}`);
