#!/usr/bin/env node
const fs=require("fs");const path=require("path");const os=require("os");
const LOOP_FILE=path.join(os.tmpdir(),"eoc-loop.json");
const task=process.argv[2];
if(task==="--stop"){if(fs.existsSync(LOOP_FILE)){fs.unlinkSync(LOOP_FILE);console.log("Loop stopped");}else{console.log("No active loop");}process.exit(0);}
if(task==="--status"){if(fs.existsSync(LOOP_FILE)){const d=JSON.parse(fs.readFileSync(LOOP_FILE));console.log("Active:",d.task);console.log("Started:",d.started);}else{console.log("No active loop");}process.exit(0);}
if(!task){console.log("Usage: node loop-start.js <task>");process.exit(1);}
const data={task,started:new Date().toISOString(),maxIterations:10,current:0};
fs.writeFileSync(LOOP_FILE,JSON.stringify(data,null,2));
console.log("Loop started:",task);
console.log("Max iterations:",data.maxIterations);
