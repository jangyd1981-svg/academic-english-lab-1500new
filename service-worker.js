'use strict';
const PREFIX='ael1500:'+self.registration.scope+':';
const CACHE=PREFIX+'6.0.0-r1';
const ASSETS=['./','./index.html','./styles.css','./core.js','./app.js','./words.js','./legacy.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./guide.html','./review.html','./vocabulary.json','./LICENSES.txt'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys()){if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);}await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(req,{ignoreSearch:true});if(hit)return hit;try{const response=await fetch(req);if(response.ok&&response.type==='basic'&&url.pathname.endsWith('.html'))await cache.put(req,response.clone());return response;}catch(err){if(req.mode==='navigate')return await cache.match('./index.html');throw err;}})());
});
