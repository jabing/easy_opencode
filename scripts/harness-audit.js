#!/usr/bin/env node
const fs=require("fs");const path=require("path");
const CONFIG=path.join(__dirname,"..",".opencode","opencode.json");
function audit(){
  let cfg;try{cfg=JSON.parse(fs.readFileSync(CONFIG,"utf-8"));}catch(e){console.log("FAIL: Cannot load config");return 1;}
  let err=0,warn=0,info=0;
  if(!cfg.agent){console.log("WARN: No agents");warn++;}else{info++;console.log("OK: Agents:",Object.keys(cfg.agent).length);}
  if(!cfg.command){console.log("WARN: No commands");warn++;}else{info++;console.log("OK: Commands:",Object.keys(cfg.command).length);}
  if(!cfg.instructions){console.log("WARN: No instructions");warn++;}else{info++;console.log("OK: Instructions:",cfg.instructions.length);}
  console.log("\nStatus:",err===0?"PASS":"FAIL");
  console.log("Errors:",err+", Warnings:",warn+", Info:",info);
  return err===0?0:1;
}
process.exit(audit());
