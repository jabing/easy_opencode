#!/usr/bin/env node
const fs=require("fs");const os=require("os");const path=require("path");
const LOOP_FILE=path.join(os.tmpdir(),"eoc-loop.json");
console.log("=== Loop Status ===");
if(fs.existsSync(LOOP_FILE)){const d=JSON.parse(fs.readFileSync(LOOP_FILE));console.log("Task:",d.task);console.log("Started:",d.started);console.log("Iteration:",d.current,"/",d.maxIterations);}else{console.log("No active loop");}
