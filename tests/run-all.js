#!/usr/bin/env node
const {execSync}=require("child_process");
const path=require("path");

console.log("Running all tests...\n");

try{
  execSync("npx jest --coverage",{cwd:__dirname,stdio:"inherit"});
  console.log("\nAll tests passed!");
  process.exit(0);
}catch(e){
  console.log("\nSome tests failed!");
  process.exit(1);
}
