#!/usr/bin/env node
/**
 * Environment Check Script
 * Detect and display current operating system information
 */
const os=require("os");
const platform=process.platform;
const isWindows=platform==="win32";
const isMacOS=platform==="darwin";
const isLinux=platform==="linux";

console.log("=== Environment Check ===");
console.log("");
console.log("Platform:", platform);
console.log("Type:", os.type());
console.log("Release:", os.release());
console.log("Architecture:", os.arch());
console.log("");
console.log("OS Detection:");
console.log("  Windows:", isWindows);
console.log("  macOS:", isMacOS);
console.log("  Linux:", isLinux);
console.log("");
console.log("Recommended Commands:");
if(isWindows){
  console.log("  List files: dir");
  console.log("  Cat file: type file");
  console.log("  Remove: del file");
  console.log("  Copy: copy src dest");
  console.log("  Grep: findstr pattern file");
}else{
  console.log("  List files: ls -la");
  console.log("  Cat file: cat file");
  console.log("  Remove: rm file");
  console.log("  Copy: cp src dest");
  console.log("  Grep: grep pattern file");
}
console.log("");
console.log("Node.js:", process.version);
console.log("Working Dir:", process.cwd());
