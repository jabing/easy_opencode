const fs = require('fs'); 
let content = fs.readFileSync('README.md', 'utf8'); 
 
// Fix the broken Features section (line 10) 
const brokenLine = `## Features\\\\n\\\\n### ECC v1.8.0 Improvements (2026-03-06)\\\\n\\\\n- **Hook Runtime Controls** - Environment-based hook configuration\\\\n- **Session Recovery** - Validate and recover corrupted sessions\\\\n- **5 New Commands** - harness-audit, loop-start, loop-status, quality-gate, model-route\\\\n- **Code Quality** - Prettier config and Plankton skill\\\\n- **Test Infrastructure** - Jest setup for unit testing\\\\n\\\\n`; 
 
const fixedContent = `## Features 
 
### ✨ New: Token Recovery (2026-03-07) 
 
- **Token Recovery Command** - \\\`/token-recover\\\` for automatic token limit handling 
- **Token Management Skill** - Proactive token monitoring and smart compaction 
- **Quick Reference Guide** - One-page token recovery cheat sheet 
 
### ECC v1.8.0 Improvements (2026-03-06) 
 
- **Hook Runtime Controls** - Environment-based hook configuration 
- **Session Recovery** - Validate and recover corrupted sessions 
- **5 New Commands** - harness-audit, loop-start, loop-status, quality-gate, model-route 
- **Code Quality** - Prettier config and Plankton skill 
- **Test Infrastructure** - Jest setup for unit testing 
`; 
 
content = content.replace(brokenLine, fixedContent); 
 
// Update agent and command counts 
content = content.replace('13 specialized agents, 50+ skills, 33 commands', '14 specialized agents, 50+ skills, 34 commands'); 
content = content.replace('### 🤖 13 Specialized Agents', '### 🤖 14 Specialized Agents'); 
content = content.replace('### 🛠️ 33 Commands', '### 🛠️ 34 Commands'); 
 
fs.writeFileSync('README.md', content); 
console.log('✓ README.md fixed');
