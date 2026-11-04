import {copyFileSync,mkdirSync} from 'node:fs';
const folder=new URL('../dist/apps/server/assets/',import.meta.url);
mkdirSync(folder,{recursive:true});
copyFileSync(new URL('../apps/server/assets/reviewed-demo.json',import.meta.url),new URL('reviewed-demo.json',folder));
