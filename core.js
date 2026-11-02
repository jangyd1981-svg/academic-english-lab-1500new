/* Academic English Lab 6 — deterministic, offline learning engine. */
(function (root) {
  'use strict';
  const SCHEMA = 6;
  function dayKey(now = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get = t => p.find(v => v.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function validDay(s) {return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
  function addDays(d,n) {if(!validDay(d)) throw new Error('날짜 형식 오류'); return new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
  function initial(dataset,day=dayKey()) {return {schema:SCHEMA,dataset,created:day,updated:Date.now(),lessons:{},cards:{},quizLog:[],settings:{voiceRate:0.9},backupAt:null};}
  function courseOrder(words) {
    const groups = new Map();
    words.forEach(w=>{if(!groups.has(w.category))groups.set(w.category,[]);groups.get(w.category).push(w.id);});
    const queues=[...groups.values()];const order=[]; let k=0;
    while(order.length<words.length) {for(const q of queues) if(k<q.length) order.push(q[k]);k++;}
    return order;
  }
  function ensureDaily(s,day,order) {
    if(!validDay(day)) throw new Error('잘못된 학습일');
    if(Object.prototype.hasOwnProperty.call(s.lessons,day))return s.lessons[day];
    const used=new Set(Object.values(s.lessons).flat());
    Object.entries(s.cards).forEach(([id,c])=>{if(c.seen>0) used.add(id);});
    const ids=order.filter(id=>!used.has(id)).slice(0,15);
    s.lessons[day]=ids;s.updated=Date.now();return ids;
  }
  function card(s,id) {
    if(!s.cards[id])s.cards[id]={seen:0,repetitions:0,interval:0,due:null,lastDate:null,lastGrade:null,wrong:false,attempts:0,correct:0,successDate:null};
    return s.cards[id];
  }
  function grade(s,id,rating,day=dayKey()) {
    if(!['again','known','easy'].includes(rating))throw new Error('잘못된 평가');
    const c=card(s,id);c.seen++;
    if(rating==='again'){c.interval=0;c.due=day;c.wrong=true;}
    else {
      if(c.successDate!==day) {c.repetitions++;c.successDate=day;}
      const intervals=[1,3,7,14,30,60];
      c.interval=intervals[Math.min(c.repetitions-1+(rating==='easy'?1:0),intervals.length-1)];
      c.due=addDays(day,c.interval);
    }
    c.lastDate=day;c.lastGrade=rating;s.updated=Date.now();return c;
  }
  function answer(s,id,correct,day=dayKey()) {
    const c=card(s,id);c.attempts++;if(correct)c.correct++;
    if(!correct)c.wrong=true;
    grade(s,id,correct?'known':'again',day);
    return c;
  }
  function due(s,day,order) {return order.filter(id=>s.cards[id]?.due && s.cards[id].due<=day);}
  function wrong(s,order) {return order.filter(id=>s.cards[id]?.wrong);}
  function streak(s,day) {
    const days=new Set(Object.values(s.cards).map(c=>c.lastDate).filter(Boolean));
    // Logs preserve study days even when later reviews replace card dates.
    Object.keys(s.studyDays||{}).forEach(d=>days.add(d));
    let d=days.has(day)?day:addDays(day,-1),n=0;
    while(days.has(d)){n++;d=addDays(d,-1);}return n;
  }
  function noteStudy(s,day){if(!s.studyDays)s.studyDays={};s.studyDays[day]=true;}
  function stats(s,day,order) {
    const cards=Object.values(s.cards);const learned=cards.filter(c=>c.seen>0).length;
    const solid=cards.filter(c=>c.repetitions>=3 && c.lastGrade!=='again').length;
    const today=s.lessons[day]||[];
    return {learned,solid,wrong:wrong(s,order).length,due:due(s,day,order).length,assigned:new Set(Object.values(s.lessons).flat()).size,
      todayDone:today.filter(id=>s.cards[id]?.lastDate===day).length,streak:streak(s,day),days:Object.keys(s.studyDays||{}).length};
  }
  function shuffle(a,random=Math.random){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
  function choices(target,words,random=Math.random) {
    const seen=new Set([target.kr]);const pool=shuffle(words.filter(w=>w.id!==target.id),random);const out=[{id:target.id,text:target.kr}];
    for(const w of pool){if(!seen.has(w.kr)){seen.add(w.kr);out.push({id:w.id,text:w.kr});if(out.length===4)break;}}
    return shuffle(out,random);
  }
  const safeInt=(n,max=1000000)=>Number.isFinite(n)?Math.max(0,Math.min(max,Math.floor(n))):0;
  function sanitize(raw,validIds,dataset) {
    if(!raw || typeof raw!=='object'||Array.isArray(raw)||raw.schema!==SCHEMA || !raw.cards || typeof raw.cards!=='object'||Array.isArray(raw.cards)||!raw.lessons||typeof raw.lessons!=='object'||Array.isArray(raw.lessons))throw new Error('Academic English Lab 6 백업 형식이 아닙니다. 이전 백업은 아래의 이전 버전 가져오기를 사용하세요.');
    const s=initial(dataset,validDay(raw.created)?raw.created:dayKey());let skipped=0;
    for(const [id,c] of Object.entries(raw.cards)) {
      if(!validIds.has(id)){skipped++;continue;}if(!c||typeof c!=='object'||Array.isArray(c)){skipped++;continue;}
      const z=card(s,id);for(const k of ['seen','repetitions','interval','attempts','correct']) z[k]=safeInt(c[k]);
      z.correct=Math.min(z.correct,z.attempts);z.wrong=c.wrong===true;
      z.lastDate=validDay(c.lastDate)?c.lastDate:null;z.successDate=validDay(c.successDate)?c.successDate:null;z.due=validDay(c.due)?c.due:null;
      z.lastGrade=['again','known','easy','imported'].includes(c.lastGrade)?c.lastGrade:null;
    }
    const used=new Set();
    for(const d of Object.keys(raw.lessons).filter(validDay).sort()){
      if(!Array.isArray(raw.lessons[d]))continue;
      s.lessons[d]=[];
      for(const id of raw.lessons[d]) {if(!validIds.has(id)||used.has(id)||s.lessons[d].length>=15){skipped++;continue;}used.add(id);s.lessons[d].push(id);}
    }
    s.studyDays={};Object.keys(raw.studyDays||{}).filter(validDay).forEach(d=>{s.studyDays[d]=true;});
    s.quizLog=(Array.isArray(raw.quizLog)?raw.quizLog:[]).filter(q=>q && validDay(q.date)).slice(-500).map(q=>({date:q.date,total:safeInt(q.total,1500),correct:Math.min(safeInt(q.correct,1500),safeInt(q.total,1500))}));
    s.settings.voiceRate=typeof raw.settings?.voiceRate==='number'?Math.min(1.2,Math.max(0.6,raw.settings.voiceRate)):0.9;
    s.backupAt=typeof raw.backupAt==='number'?raw.backupAt:null;
    return {state:s,skipped};
  }
  function merge(a,b){
    const s=JSON.parse(JSON.stringify(a));
    for(const [id,c] of Object.entries(b.cards)){
      const old=s.cards[id];
      if(!old){s.cards[id]=c;continue;}
      const newer=(c.lastDate||'')>(old.lastDate||'')?c:old;
      s.cards[id]={...newer,seen:Math.max(c.seen,old.seen),repetitions:Math.max(c.repetitions,old.repetitions),attempts:Math.max(c.attempts,old.attempts),correct:Math.max(c.correct,old.correct),wrong:c.wrong||old.wrong};
    }
    const used=new Set(Object.values(s.lessons).flat());
    for(const d of Object.keys(b.lessons).sort()){
      if(!s.lessons[d])s.lessons[d]=[];
      for(const id of b.lessons[d])if(!used.has(id)&&s.lessons[d].length<15){s.lessons[d].push(id);used.add(id);}
    }
    s.studyDays={...(a.studyDays||{}),...(b.studyDays||{})};
    // Merge identical backup logs without doubling them, preserving repeated sessions.
    const countsA=new Map(),countsB=new Map(),entries=new Map();
    for(const [logs,counts] of [[a.quizLog||[],countsA],[b.quizLog||[],countsB]])for(const q of logs){const k=JSON.stringify(q);counts.set(k,(counts.get(k)||0)+1);entries.set(k,q);}
    s.quizLog=[];for(const [k,q] of entries)for(let i=0;i<Math.max(countsA.get(k)||0,countsB.get(k)||0);i++)s.quizLog.push(q);
    s.quizLog.sort((x,y)=>x.date.localeCompare(y.date));s.quizLog=s.quizLog.slice(-500);
    s.settings={...a.settings,...b.settings};s.backupAt=Math.max(a.backupAt||0,b.backupAt||0)||null;
    s.updated=Date.now();return s;
  }
  function fromLegacy(raw,map,byWord,dataset,day=dayKey()){
    if(!raw||!Array.isArray(raw.learned)||!Array.isArray(raw.review))throw new Error('이전 백업은 learned와 review 배열이 필요합니다.');
    const s=initial(dataset,day);let skipped=0,matched=new Set();
    for(const type of ['learned','review'])for(const oldId of raw[type]){
      const word=map[String(oldId)];const id=word&&byWord.get(word);
      if(!id){skipped++;continue;}
      const c=card(s,id);c.seen=1;c.repetitions=type==='learned'?Math.max(1,c.repetitions):c.repetitions;c.lastGrade='imported';c.due=day;c.wrong=c.wrong||type==='review';matched.add(id);
    }
    return {state:s,skipped,matched:matched.size};
  }
  const api={SCHEMA,dayKey,validDay,addDays,initial,courseOrder,ensureDaily,card,grade,answer,due,wrong,stats,noteStudy,shuffle,choices,sanitize,merge,fromLegacy};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AELCore=api;
})(typeof window!=='undefined'?window:globalThis);
