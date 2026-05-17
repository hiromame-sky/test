const courses = (window.COURSES || []).map((c, i) => ({...c, index:i, slots:parseSlots(c.schedule, c.section)}));
let wanted = new Set();
let plan = [];
const $ = id => document.getElementById(id);
const state = {q:'', subject:'', campus:'', section:''};

function uniq(a){return [...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'ja'))}
function optFill(id, values){const el=$(id); values.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o)})}
optFill('subject', uniq(courses.map(c=>c.subject)));
optFill('campus', uniq(courses.map(c=>c.campus)));
optFill('section', uniq(courses.map(c=>c.section)));
$('totalCount').textContent = courses.length;

['q','subject','campus','section'].forEach(id=>$(id).addEventListener('input', e=>{state[id]=e.target.value; renderCourses();}));
$('clearBtn').addEventListener('click',()=>{wanted.clear();plan=[];renderAll();});
$('autoBtn').addEventListener('click', autoSchedule);
$('exportBtn').addEventListener('click', exportCsv);

function normalizeDigits(s){return String(s).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0));}
function periodNums(text){
  text = normalizeDigits(text || '');
  const nums=[];
  const range = text.match(/(\d+)\s*限\s*[～~]\s*(\d+)\s*限/);
  if(range){ for(let i=+range[1]; i<=+range[2]; i++) nums.push(i); return nums; }
  const ms = [...text.matchAll(/(\d+)\s*限/g)].map(m=>+m[1]);
  return [...new Set(ms)];
}
function parseSlots(schedule, section){
  const s = normalizeDigits(schedule || '');
  if(s.includes('視聴開始')) return [{day:'映像講座', period:'自由視聴', key:'VIDEO'}];
  const slots=[];
  const parts=s.split(/＆|&/).map(x=>x.trim()).filter(Boolean);
  for(const part of parts){
    const term=part.match(/(\d+)期/);
    const ps=periodNums(part);
    if(term){
      const periods=ps.length?ps:[0];
      periods.forEach(p=>slots.push({day:`${term[1]}期`, period:p?`${p}限`:'時間未指定', key:`T${term[1]}-P${p}`}));
      continue;
    }
    const range=part.match(/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*[～~]\s*(\d{1,2})\/(\d{1,2})/);
    if(range){
      const start=+range[2], end=+range[4], month=+range[1];
      for(let d=start; d<=end; d++) slots.push({day:`${month}/${d}`, period:'全日', key:`D${month}/${d}-ALL`});
      continue;
    }
    const dates=[...part.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map(m=>`${+m[1]}/${+m[2]}`);
    if(dates.length){
      const ps2=ps.length?ps:[0];
      dates.forEach(d=>ps2.forEach(p=>slots.push({day:d, period:p?`${p}限`:'時間未指定', key:`D${d}-P${p}`})));
      continue;
    }
    slots.push({day:s, period:'時間未指定', key:`RAW-${s}`});
  }
  return slots;
}
function filteredCourses(){
  const q=state.q.trim().toLowerCase();
  return courses.filter(c => (!q || [c.course,c.teacher,c.code,c.schedule,c.subject,c.campus].join(' ').toLowerCase().includes(q)) && (!state.subject||c.subject===state.subject) && (!state.campus||c.campus===state.campus) && (!state.section||c.section===state.section));
}
function renderCourses(){
  const list=$('courseList'); list.innerHTML='';
  const arr=filteredCourses(); $('visibleCount').textContent=`${arr.length}件`;
  arr.forEach(c=>{
    const card=document.createElement('article'); card.className='course-card'+(wanted.has(c.course)?' wanted':'');
    card.innerHTML=`<div class="course-main"><div><div class="course-title">${esc(c.course)}</div><div class="meta"><span class="pill">${esc(c.subject)}</span><span class="pill gray">${esc(c.section)}</span><span class="pill gray">${esc(c.campus)} ${esc(c.group||'')}</span><span class="pill gray">${esc(c.schedule)}</span><span class="pill gray">${esc(c.code)}</span><span class="pill gray">${esc(c.teacher)}</span></div></div><div class="course-actions"><button class="small-btn want">候補</button><button class="small-btn add">追加</button></div></div>`;
    card.querySelector('.want').addEventListener('click',()=>{wanted.has(c.course)?wanted.delete(c.course):wanted.add(c.course);renderCourses();});
    card.querySelector('.add').addEventListener('click',()=>{if(!plan.some(x=>x.id===c.id)) plan.push(c);renderPlan();renderTimeline();});
    list.appendChild(card);
  });
}
function conflictsFor(items){
  const used=new Map(), warnings=[];
  items.forEach(c=>c.slots.filter(s=>s.key!=='VIDEO').forEach(s=>{
    const k=s.key; if(!used.has(k)) used.set(k,[]); used.get(k).push(c);
  }));
  used.forEach((v,k)=>{ if(v.length>1) warnings.push({key:k, items:v}); });
  return warnings;
}
function scoreCourse(c, chosen){
  let score=0;
  if($('preferUmeda').checked && c.campus==='梅田') score+=30;
  if($('preferUmeda').checked && c.campus!=='梅田' && c.campus!=='映像') score-=8;
  if($('preferVideo').checked && c.campus==='映像') score+=12;
  if(!$('preferVideo').checked && c.campus==='映像') score-=3;
  const nonVideo=c.slots.filter(s=>s.key!=='VIDEO');
  const existingDays=new Set(chosen.flatMap(x=>x.slots.map(s=>s.day)));
  const newDays=nonVideo.filter(s=>!existingDays.has(s.day)).length;
  if($('compact').checked) score-=newDays*2;
  score-=nonVideo.length*0.1;
  return score;
}
function autoSchedule(){
  const names=[...wanted];
  const selected=[];
  const conflicts=[];
  for(const name of names){
    const opts=courses.filter(c=>c.course===name);
    const ok=opts.filter(o=>conflictsFor([...selected,o]).length===0);
    const pool=ok.length?ok:opts;
    pool.sort((a,b)=>scoreCourse(b,selected)-scoreCourse(a,selected));
    if(pool[0]){
      selected.push(pool[0]);
      if(!ok.length) conflicts.push(name);
    }
  }
  plan=selected;
  renderPlan(conflicts);
  renderTimeline();
}
function renderPlan(forced=[]){
  const list=$('planList'), warns=$('warnings'), summary=$('summary'); list.innerHTML=''; warns.innerHTML=''; summary.innerHTML='';
  const conf=conflictsFor(plan);
  if(forced.length) warns.innerHTML += `<div class="warn">一部の候補は衝突なしで組めませんでした: ${forced.map(esc).join('、')}</div>`;
  conf.forEach(w=>warns.innerHTML += `<div class="warn">${esc(w.key)} で重複: ${w.items.map(x=>esc(x.course+' '+x.code)).join(' / ')}</div>`);
  const days=new Set(plan.flatMap(c=>c.slots.filter(s=>s.key!=='VIDEO').map(s=>s.day)));
  const units=plan.reduce((a,c)=>a+(parseFloat(c.unit)||0),0);
  summary.innerHTML=`<div><b>${plan.length}</b><span>選択講座</span></div><div><b>${days.size}</b><span>通学日・期</span></div><div><b>${units || '-'}</b><span>単位合計</span></div>`;
  $('planCount').textContent=`${plan.length}件`;
  if(!plan.length){list.className='plan-list empty';list.textContent='まだ講座が追加されていません。';return;}
  list.className='plan-list';
  plan.forEach(c=>{
    const has=conf.some(w=>w.items.includes(c));
    const item=document.createElement('article'); item.className='plan-item'+(has?' conflict':'');
    item.innerHTML=`<div class="plan-title">${esc(c.course)}</div><div class="plan-sub">${esc(c.subject)} / ${esc(c.section)} / ${esc(c.campus)} ${esc(c.group||'')} / ${esc(c.schedule)}<br>${esc(c.code)} / ${esc(c.teacher)}</div><button class="small-btn remove">削除</button>`;
    item.querySelector('button').addEventListener('click',()=>{plan=plan.filter(x=>x.id!==c.id);renderPlan();renderTimeline();});
    list.appendChild(item);
  });
}
function renderTimeline(){
  const el=$('timeline'); el.innerHTML='';
  if(!plan.length){el.className='timeline empty';el.textContent='予定を追加すると、日程ごとに整理して表示されます。';return;}
  el.className='timeline';
  const map=new Map();
  plan.forEach(c=>c.slots.forEach(s=>{const k=s.day;if(!map.has(k))map.set(k,[]);map.get(k).push({slot:s,course:c});}));
  const keys=[...map.keys()].sort(naturalDaySort);
  keys.forEach(day=>{
    const block=document.createElement('div'); block.className='day-block'; block.innerHTML=`<h3>${esc(day)}</h3>`;
    map.get(day).sort((a,b)=>String(a.slot.period).localeCompare(String(b.slot.period),'ja')).forEach(x=>{
      const div=document.createElement('div'); div.className='slot'; div.innerHTML=`<div class="slot-time">${esc(x.slot.period)}</div><div><b>${esc(x.course.course)}</b><br><span class="plan-sub">${esc(x.course.campus)} ${esc(x.course.group||'')} / ${esc(x.course.code)} / ${esc(x.course.teacher)}</span></div>`; block.appendChild(div);
    });
    el.appendChild(block);
  });
}
function naturalDaySort(a,b){
  const av=a.match(/(\d+)期/), bv=b.match(/(\d+)期/); if(av&&bv) return +av[1]-+bv[1]; if(av) return -1; if(bv) return 1;
  const ad=a.match(/(\d+)\/(\d+)/), bd=b.match(/(\d+)\/(\d+)/); if(ad&&bd) return (+ad[1]*40+ +ad[2])-(+bd[1]*40+ +bd[2]); if(ad) return -1; if(bd) return 1;
  return a.localeCompare(b,'ja');
}
function exportCsv(){
  if(!plan.length) return;
  const head=['区分','科目','講座名','校舎','組','日程','講座番号','講師名','単位'];
  const body=plan.map(c=>[c.section,c.subject,c.course,c.campus,c.group,c.schedule,c.code,c.teacher,c.unit]);
  const csv=[head,...body].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='umeda-schedule-plan.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function esc(s){return String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function renderAll(){renderCourses();renderPlan();renderTimeline();}
renderAll();
