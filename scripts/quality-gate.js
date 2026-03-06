#!/usr/bin/env node
const fs=require("fs");const path=require("path");
const cwd=process.cwd();
console.log("=== Quality Gate ===");
let pass=true;
// Check for package.json
if(fs.existsSync(path.join(cwd,"package.json"))){console.log("[OK] package.json exists");}else{console.log("[WARN] No package.json");}
// Check for .gitignore
if(fs.existsSync(path.join(cwd,".gitignore"))){console.log("[OK] .gitignore exists");}else{console.log("[WARN] No .gitignore");}
// Check for console.log in src
const src=path.join(cwd,"src");if(fs.existsSync(src)){const files=fs.readdirSync(src).filter(f=>f.endsWith(".js")||f.endsWith(".ts"));let hasLog=false;files.forEach(f=>{const c=fs.readFileSync(path.join(src,f),"utf-8");if(c.includes("console.log"))hasLog=true;});if(hasLog){console.log("[WARN] console.log found in src");}else{console.log("[OK] No console.log in src");}}
console.log("\nStatus:",pass?"PASS":"FAIL");
