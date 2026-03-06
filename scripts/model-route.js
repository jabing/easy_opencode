#!/usr/bin/env node
const fs=require("fs");const path=require("path");
const CONFIG=path.join(__dirname,"..",".opencode","opencode.json");
const args=process.argv.slice(2);
console.log("=== Model Route ===");
let cfg;try{cfg=JSON.parse(fs.readFileSync(CONFIG,"utf-8"));}catch(e){console.log("Error loading config");process.exit(1);}
if(args[0]==="--reset"){cfg.model="zhipuai-coding-plan/glm-5";cfg.small_model="zhipuai-coding-plan/glm-4.5-flash";fs.writeFileSync(CONFIG,JSON.stringify(cfg,null,2));console.log("Reset to defaults");process.exit(0);}
if(args.length===2){const task=args[0],model=args[1];if(task==="coding"){cfg.model=model;fs.writeFileSync(CONFIG,JSON.stringify(cfg,null,2));console.log("Set coding model:",model);}else{console.log("Unknown task:",task);}process.exit(0);}
console.log("Current model:",cfg.model||"default");
console.log("Small model:",cfg.small_model||"default");
console.log("Usage: node model-route.js task model");
