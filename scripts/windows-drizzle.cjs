// Some restricted Windows environments do not expose an OS account record.
const os=require('node:os');const userInfo=os.userInfo;
os.userInfo=(...args)=>{try{return userInfo(...args)}catch{return {username:process.env.USERNAME||'codex'}}};
process.argv=[process.execPath,require.resolve('../node_modules/drizzle-kit/bin.cjs'),...process.argv.slice(2)];
require('../node_modules/drizzle-kit/bin.cjs');
