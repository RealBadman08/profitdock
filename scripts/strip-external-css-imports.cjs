const fs = require('fs');
const path = require('path');

const distCssDir = path.resolve(__dirname, '..', 'dist', 'static', 'css');
const blockedImportPattern =
    /@import\s+(?:url\()?["']https:\/\/(?:fonts\.googleapis\.com|cdn\.jsdelivr\.net)\/[^"')]+["']\)?[^;]*;/g;

function getCssFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return getCssFiles(fullPath);
        return entry.isFile() && entry.name.endsWith('.css') ? [fullPath] : [];
    });
}

let strippedCount = 0;

for (const filePath of getCssFiles(distCssDir)) {
    const original = fs.readFileSync(filePath, 'utf8');
    const cleaned = original.replace(blockedImportPattern, () => {
        strippedCount += 1;
        return '/* stripped external CSS import */';
    });

    if (cleaned !== original) {
        fs.writeFileSync(filePath, cleaned);
    }
}

console.log(`Stripped ${strippedCount} external CSS import${strippedCount === 1 ? '' : 's'} from generated CSS.`);
