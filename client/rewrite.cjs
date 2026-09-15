const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function findFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findFiles(fullPath, files);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = findFiles(srcDir);
let changedFiles = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // We only replace '/api/' inside quotes, like '/api/...' or `/api/...`
  // We can match (['"`])\/api\/([^'"`]*)(['"`]) and replace with `${API_BASE_URL}/api/$2`
  
  const regex = /(['"`])(\/api\/[^'"`]*)(['"`])/g;
  
  if (regex.test(content) && !content.includes('API_BASE_URL')) {
    content = content.replace(regex, (match, p1, p2, p3) => {
      if (p1 === "'" || p1 === '"') {
        return `\`\${API_BASE_URL}${p2}\``;
      } else {
        return `\`\${API_BASE_URL}${p2}\``;
      }
    });

    // Add import
    const depth = path.relative(srcDir, path.dirname(file)).split(path.sep).length;
    let importPath = '../'.repeat(depth) + 'config';
    if (depth === 0) importPath = './config';
    // However, since we are in src/something, depth is usually 1, so '../config'
    // let's just make it relative to src:
    const relToSrc = path.relative(path.dirname(file), path.join(srcDir, 'config')).replace(/\\/g, '/');
    const importPathStr = relToSrc.startsWith('.') ? relToSrc : `./${relToSrc}`;

    // Insert import after the last import statement or at the top
    const importStmt = `import { API_BASE_URL } from '${importPathStr}';\n`;
    
    // Find last import
    const importRegex = /^import\s+.*from\s+['"].*['"];?$/gm;
    let lastIndex = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastIndex = importRegex.lastIndex;
    }
    
    if (lastIndex > 0) {
      content = content.slice(0, lastIndex) + '\n' + importStmt + content.slice(lastIndex);
    } else {
      content = importStmt + content;
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Modified ${file}`);
    changedFiles++;
  }
}

console.log(`Changed ${changedFiles} files.`);
