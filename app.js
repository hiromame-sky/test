const courses = (window.COURSES || []).map((c, i) => ({...c, index:i, slots:parseSlots(c.schedule, c.section, c.campus)}));
let wanted = new Set();
let plan = [];
const $ = id => document.getElementById(id);
const state = {q:'', subject:'', section:''};
const SETTINGS_KEY = 'umedaSchedulerCommonSettingsV7';
const LEGACY_KEYS = ['umedaSchedulerSettingsV6','umedaSchedulerSettingsV5'];

function uniq(a){return [...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'ja'))}
function optFill(id, values){const el=$(id); values.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o)})}
function normalizeDigits(s){return String(s || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0));}
function normalizeName(s){return normalizeDigits(s).replace(/\s+/g,'').trim();}
function esc(s){return String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function escAttr(s){return esc(s).replace(/'/g,'&#39;');}
function courseName(c){return String(c?.displayCourse || c?.course || c?.name || c?.title || c?.['講座名'] || '').trim();}
function groupKeyFor(c){return [sectionBucket(c.section), c.subject || '未分類', courseName(c)].join('__');}

const courseGroups = buildCourseGroups(courses);
optFill('subject', uniq(courses.map(c=>c.subject)));
optFill('section', uniq(courses.map(c=>sectionBucket(c.section))));
renderTeacherPicker();
renderCampusPicker();
loadSettings();
renderCommonSummaries();
$('totalCount').textContent = courseGroups.length;

['q','subject','section'].forEach(id=>$(id).addEventListener('input', e=>{state[id]=e.target.value; renderCourseNames();}));
$('teacherCheckboxList').addEventListener('change',e=>{if(e.target.matches('.teacher-check')){saveSettings(); renderCommonSummaries(); renderCourseNames(); if(plan.length) renderPlan();}});
$('campusCheckboxList').addEventListener('change',e=>{if(e.target.matches('.campus-check')){saveSettings(); renderCommonSummaries(); if(plan.length) renderPlan();}});
$('clearCommonSettingsBtn').addEventListener('click',()=>{document.querySelectorAll('.teacher-check,.campus-check').forEach(o=>o.checked=false); $('preferVideo').checked=false; $('compact').checked=true; saveSettings(); renderCommonSummaries(); renderCourseNames(); if(plan.length){autoSchedule();}});
$('clearBtn').addEventListener('click',()=>{wanted.clear();plan=[];renderAll();});
$('autoBtn').addEventListener('click', autoSchedule);
$('exportBtn').addEventListener('click', exportCsv);
['preferVideo','compact'].forEach(id=>$(id).addEventListener('change',()=>{saveSettings(); if(plan.length) renderPlan();}));

function buildCourseGroups(items){
  const map=new Map();
  for(const c of items){
    const name=courseName(c);
    if(!name) continue;
    c.displayCourse=name;
    const key=groupKeyFor(c);
    c.courseGroupId=key;
    if(!map.has(key)) map.set(key,{id:key,name, subject:c.subject || '未分類', sections:new Set(), campuses:new Set(), teachers:new Set(), options:[]});
    const g=map.get(key);
    g.sections.add(sectionBucket(c.section));
    g.campuses.add(c.campus);
    g.teachers.add(c.teacher);
    g.options.push(c);
  }
  return [...map.values()].map(g=>({
    ...g,
    sections:[...g.sections],
    campuses:[...g.campuses],
    teachers:[...g.teachers],
    optionCount:g.options.length
  })).sort((a,b)=>bucketOrder(a.sections[0])-bucketOrder(b.sections[0]) || a.subject.localeCompare(b.subject,'ja') || a.name.localeCompare(b.name,'ja'));
}


function renderTeacherPicker(){
  const box=$('teacherCheckboxList');
  const teachers=uniq(courses.map(c=>c.teacher));
  box.innerHTML=teachers.map(t=>`<label class="choice"><input type="checkbox" class="teacher-check" value="${escAttr(t)}"><span>${esc(t)}</span></label>`).join('');
}
function renderCampusPicker(){
  const box=$('campusCheckboxList');
  const campuses=uniq(courses.map(c=>c.campus));
  box.innerHTML=campuses.map(t=>`<label class="choice"><input type="checkbox" class="campus-check" value="${escAttr(t)}"><span>${esc(t)}</span></label>`).join('');
}
function selectedValues(sel){return [...document.querySelectorAll(sel+':checked')].map(o=>o.value).filter(Boolean);}
function preferredTeachers(){return selectedValues('.teacher-check');}
function preferredCampuses(){return selectedValues('.campus-check');}
function renderCommonSummaries(){
  renderPickerLabel('teacherPickerLabel', preferredTeachers(), '先生を選択', '名');
  renderPickerLabel('campusPickerLabel', preferredCampuses(), '校舎を選択', '件');
  renderChipSummary('preferredTeacherSummary', preferredTeachers(), '優先講師は未設定です。');
  renderChipSummary('preferredCampusSummary', preferredCampuses(), '優先校舎は未設定です。');
}
function renderPickerLabel(id, values, empty, suffix){$(id).textContent=values.length?`選択中: ${values.length}${suffix}`:empty;}
function renderChipSummary(id, values, empty){
  const el=$(id);
  if(!values.length){el.className='chip-summary empty'; el.textContent=empty; return;}
  el.className='chip-summary'; el.innerHTML=values.map(v=>`<span>${esc(v)}</span>`).join('');
}
function loadSettings(){
  let saved={};
  try{
    const raw=localStorage.getItem(SETTINGS_KEY) || LEGACY_KEYS.map(k=>localStorage.getItem(k)).find(Boolean) || '{}';
    saved=JSON.parse(raw);
  }catch(e){}
  const teachers=new Set(saved.preferredTeachers || []);
  const campuses=new Set(saved.preferredCampuses || (saved.preferUmeda ? ['梅田'] : []));
  document.querySelectorAll('.teacher-check').forEach(o=>{o.checked=teachers.has(o.value);});
  document.querySelectorAll('.campus-check').forEach(o=>{o.checked=campuses.has(o.value);});
  if(typeof saved.preferVideo==='boolean') $('preferVideo').checked=saved.preferVideo;
  if(typeof saved.compact==='boolean') $('compact').checked=saved.compact;
}
function saveSettings(){
  const data={preferredTeachers:preferredTeachers(), preferredCampuses:preferredCampuses(), preferVideo:$('preferVideo').checked, compact:$('compact').checked};
  try{localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));}catch(e){}
}

function sectionBucket(section){
  if(String(section).includes('特訓')) return '夏期特訓';
  if(String(section).includes('講習')) return '夏期講習';
  return section || 'その他';
}
function bucketOrder(name){if(name==='夏期特訓') return 1; if(name==='夏期講習') return 2; return 9;}
function filteredGroups(){
  const q=state.q.trim().toLowerCase();
  return courseGroups.filter(g=>(!q || [g.name,g.subject,...g.sections,...g.campuses,...g.teachers].join(' ').toLowerCase().includes(q)) && (!state.subject || g.subject===state.subject) && (!state.section || g.sections.includes(state.section)));
}
function groupHasPreferredTeacher(g){return g.options.some(o=>teacherPriority(o)>0);}
function renderCourseNames(){
  const list=$('courseList'); list.innerHTML='';
  const arr=filteredGroups(); $('visibleCount').textContent=`${arr.length}件`;
  if(!arr.length){list.innerHTML='<div class="empty-message">条件に一致する講座名がありません。</div>'; return;}
  const grouped=new Map();
  arr.forEach(g=>{
    const section=g.sections.includes('夏期特訓') ? '夏期特訓' : (g.sections.includes('夏期講習') ? '夏期講習' : (g.sections[0] || 'その他'));
    if(!grouped.has(section)) grouped.set(section,new Map());
    const subjects=grouped.get(section);
    if(!subjects.has(g.subject || '未分類')) subjects.set(g.subject || '未分類', []);
    subjects.get(g.subject || '未分類').push(g);
  });
  [...grouped.entries()].sort((a,b)=>bucketOrder(a[0])-bucketOrder(b[0]) || a[0].localeCompare(b[0],'ja')).forEach(([bucket, subjectMap], bucketIndex)=>{
    const total=[...subjectMap.values()].reduce((n,v)=>n+v.length,0);
    const bucketDetails=document.createElement('details'); bucketDetails.className='accordion bucket-accordion'; bucketDetails.open=true;
    bucketDetails.innerHTML=`<summary><span class="summary-title">${esc(bucket)}</span><span class="summary-count">${total}件</span></summary>`;
    const subjectWrap=document.createElement('div'); subjectWrap.className='subject-wrap';
    [...subjectMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ja')).forEach(([subject, items])=>{
      const details=document.createElement('details'); details.className='accordion subject-accordion'; details.open=true;
      details.innerHTML=`<summary><span class="summary-title">${esc(subject)}</span><span class="summary-count">${items.length}件</span></summary>`;
      const inner=document.createElement('div'); inner.className='subject-course-list';
      items.sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(g=>inner.appendChild(renderGroupCard(g)));
      details.appendChild(inner); subjectWrap.appendChild(details);
    });
    bucketDetails.appendChild(subjectWrap); list.appendChild(bucketDetails);
  });
}
function renderGroupCard(g){
  const isWanted=wanted.has(g.id);
  const preferred=groupHasPreferredTeacher(g);
  const card=document.createElement('article'); card.className='course-card'+(isWanted?' wanted':'')+(preferred?' teacher-priority':'');
  const settingsTags=[];
  if(preferred) settingsTags.push('<span class="pill preferred-pill">優先講師候補あり</span>');
  const campusHit=g.campuses.some(c=>preferredCampuses().includes(c));
  if(campusHit) settingsTags.push('<span class="pill preferred-pill">優先校舎候補あり</span>');
  card.innerHTML=`
    <div class="course-main">
      <div>
        <div class="course-title">${esc(g.name)}</div>
        <div class="meta">
          <span class="pill">${esc(g.subject)}</span>
          ${g.sections.map(s=>`<span class="pill gray">${esc(s)}</span>`).join('')}
          <span class="pill gray">候補 ${g.optionCount}件</span>
          <span class="pill gray">校舎 ${esc(g.campuses.join('・'))}</span>
          ${settingsTags.join('')}
        </div>
      </div>
      <div class="course-actions"><button class="small-btn want">${isWanted?'候補から外す':'候補に入れる'}</button></div>
    </div>
    <details class="variant-details"><summary>組・校舎・講師候補を見る</summary><div class="variant-list">${renderVariantRows(g.options)}</div></details>`;
  card.querySelector('.want').addEventListener('click',()=>{wanted.has(g.id)?wanted.delete(g.id):wanted.add(g.id); renderCourseNames(); renderCandidateBox();});
  return card;
}
function renderVariantRows(opts){
  return opts.map(c=>`<div class="variant-row"><b>${esc(c.campus)} ${esc(c.group||'')}</b><span>${esc(c.schedule)}</span><span>${esc(c.code)}</span><span>${esc(c.teacher)}</span></div>`).join('');
}
function renderCandidateBox(){
  const el=$('candidateBox'); const ids=[...wanted];
  if(!ids.length){el.className='candidate-box empty'; el.textContent='「候補に入れる」を押した講座名がここに入ります。'; return;}
  const groups=ids.map(id=>courseGroups.find(g=>g.id===id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  el.className='candidate-box';
  el.innerHTML=groups.map(g=>`<span>${esc(g.name)} <small>${esc(g.subject)}・${esc(g.sections.join(' / '))}</small> <button class="x" data-id="${escAttr(g.id)}">×</button></span>`).join('');
  el.querySelectorAll('.x').forEach(btn=>btn.addEventListener('click',()=>{wanted.delete(btn.dataset.id); renderCandidateBox(); renderCourseNames();}));
}

function periodNums(text){
  text=normalizeDigits(text||''); const nums=[];
  const range=text.match(/(\d+)\s*限\s*[～~]\s*(\d+)\s*限/);
  if(range){for(let i=+range[1]; i<=+range[2]; i++) nums.push(i); return nums;}
  return [...new Set([...text.matchAll(/(\d+)\s*限/g)].map(m=>+m[1]))];
}
function makeSlot(day,p,campus){return {day,period:p?`${p}限`:'時間未指定',periodNo:p||0,campus:campus||'',key:`${day}-P${p||0}`};}
function parseSlots(schedule, section, campus){
  const s=normalizeDigits(schedule||'');
  if(s.includes('視聴開始')) return [{day:'映像講座',period:'自由視聴',periodNo:0,campus:'映像',key:'VIDEO'}];
  const slots=[]; const parts=s.split(/＆|&/).map(x=>x.trim()).filter(Boolean);
  for(const part of parts){
    const term=part.match(/(\d+)期/); const ps=periodNums(part);
    if(term){(ps.length?ps:[0]).forEach(p=>slots.push(makeSlot(`${term[1]}期`,p,campus))); continue;}
    const range=part.match(/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*[～~]\s*(\d{1,2})\/(\d{1,2})/);
    if(range){const start=+range[2], end=+range[4], month=+range[1]; for(let d=start; d<=end; d++) slots.push({day:`${month}/${d}`,period:'全日',periodNo:99,campus:campus||'',key:`${month}/${d}-ALL`}); continue;}
    const dates=[...part.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map(m=>`${+m[1]}/${+m[2]}`);
    if(dates.length){dates.forEach(d=>(ps.length?ps:[0]).forEach(p=>slots.push(makeSlot(d,p,campus)))); continue;}
    slots.push({day:s,period:'時間未指定',periodNo:0,campus:campus||'',key:`RAW-${s}`});
  }
  return slots;
}
function realSlots(c){return c.slots.filter(s=>s.key!=='VIDEO');}
function slotOverlaps(a,b){if(a.day!==b.day) return false; if(a.periodNo===99 || b.periodNo===99) return true; if(!a.periodNo || !b.periodNo) return false; return a.periodNo===b.periodNo;}
function campusMoveProblem(a,b){
  if(a.day!==b.day) return false;
  if(!a.periodNo || !b.periodNo || a.periodNo===99 || b.periodNo===99) return false;
  if(!a.campus || !b.campus || a.campus===b.campus) return false;
  const diff=Math.abs(a.periodNo-b.periodNo); if(diff!==1) return false;
  const pair=[a.periodNo,b.periodNo].sort((x,y)=>x-y).join('-');
  return pair !== '2-3';
}
function issuesFor(items){
  const issues=[];
  for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++){
    const a=items[i], b=items[j];
    for(const sa of realSlots(a)) for(const sb of realSlots(b)){
      if(slotOverlaps(sa,sb)) issues.push({type:'conflict',day:sa.day,period:sa.periodNo===99?'全日':sa.period,items:[a,b]});
      else if(campusMoveProblem(sa,sb)) issues.push({type:'move',day:sa.day,period:`${Math.min(sa.periodNo,sb.periodNo)}限→${Math.max(sa.periodNo,sb.periodNo)}限`,items:[a,b],campuses:[sa.campus,sb.campus]});
    }
  }
  return issues;
}
function issuePenalty(items){return issuesFor(items).reduce((n,x)=>n+(x.type==='conflict'?1000000:25000),0);}
function teacherPriority(c){
  const terms=preferredTeachers(); if(!terms.length) return 0;
  const teacher=normalizeName(c.teacher); let best=0;
  for(const raw of terms){const t=normalizeName(raw); if(!t) continue; if(teacher===t) best=Math.max(best,120); else if(teacher.includes(t)||t.includes(teacher)) best=Math.max(best,80);}
  return best;
}
function campusPriority(c){
  const campuses=preferredCampuses(); if(!campuses.length) return 0;
  const idx=campuses.indexOf(c.campus);
  if(idx>=0) return 80 - idx*6;
  if(c.campus==='映像' && $('preferVideo').checked) return 15;
  return -12;
}
function scoreCourse(c, chosen){
  let score=0;
  score += teacherPriority(c);
  score += campusPriority(c);
  if($('preferVideo').checked && c.campus==='映像') score+=30;
  if(!$('preferVideo').checked && c.campus==='映像') score-=20;
  const nonVideo=realSlots(c);
  const existingDays=new Set(chosen.flatMap(x=>realSlots(x).map(s=>s.day)));
  const newDays=[...new Set(nonVideo.map(s=>s.day))].filter(d=>!existingDays.has(d)).length;
  if($('compact').checked) score-=newDays*3;
  score-=nonVideo.length*0.08;
  return score;
}
function stateScore(items){
  let score=items.length*10000 - issuePenalty(items);
  items.forEach((c,i)=>score+=scoreCourse(c,items.slice(0,i)));
  const days=new Set(items.flatMap(x=>realSlots(x).map(s=>s.day)));
  if($('compact').checked) score-=days.size*7;
  return score;
}
function autoSchedule(){
  const ids=[...wanted];
  if(!ids.length){plan=[]; renderPlan(['講座名候補が選択されていません。']); renderTimeline(); return;}
  const groups=ids.map(id=>courseGroups.find(g=>g.id===id)).filter(Boolean).map(g=>({name:g.name, opts:g.options}));
  let states=[{items:[], score:0}]; const beamSize=240;
  for(const group of groups){
    const next=[];
    for(const st of states){
      const sorted=[...group.opts].sort((a,b)=>scoreCourse(b,st.items)-scoreCourse(a,st.items));
      for(const opt of sorted){const items=[...st.items,opt]; next.push({items, score:stateScore(items)});}
    }
    next.sort((a,b)=>b.score-a.score); states=dedupeStates(next).slice(0,beamSize);
  }
  const feasible=states.filter(st=>issuesFor(st.items).filter(x=>x.type==='conflict').length===0);
  const best=(feasible.length?feasible:states).sort((a,b)=>b.score-a.score)[0];
  plan=best?best.items:[];
  renderPlan(feasible.length?[]:['完全に重複しない組み合わせが見つからない可能性があります。']);
  renderTimeline();
}
function dedupeStates(states){const seen=new Set(), out=[]; for(const st of states){const k=st.items.map(x=>x.id).join('|'); if(seen.has(k)) continue; seen.add(k); out.push(st);} return out;}

function renderPlan(extraWarnings=[]){
  const list=$('planList'), warns=$('warnings'), summary=$('summary'); list.innerHTML=''; warns.innerHTML=''; summary.innerHTML='';
  extraWarnings.forEach(w=>warns.innerHTML+=`<div class="warn">${esc(w)}</div>`);
  const issues=issuesFor(plan);
  issues.forEach(w=>{
    const msg=w.type==='conflict'
      ? `${esc(w.day)} ${esc(w.period)}で重複: ${w.items.map(x=>esc(courseName(x)+' '+x.code)).join(' / ')}`
      : `${esc(w.day)} ${esc(w.period)}の校舎移動が不可: ${w.items.map(x=>esc(courseName(x)+' '+x.campus)).join(' / ')}。2限と3限の間のみ移動可能として判定しています。`;
    warns.innerHTML+=`<div class="warn">${msg}</div>`;
  });
  if(plan.length && !issues.length) warns.innerHTML=`<div class="ok">重複なし。校舎移動は「2限と3限の間のみ可能」として判定済みです。</div>`;
  const days=new Set(plan.flatMap(c=>realSlots(c).map(s=>s.day)));
  const units=plan.reduce((a,c)=>a+(parseFloat(c.unit)||0),0);
  const teacherHits=plan.filter(c=>teacherPriority(c)>0).length;
  const campusHits=plan.filter(c=>campusPriority(c)>0 && preferredCampuses().length).length;
  summary.innerHTML=`<div><b>${plan.length}</b><span>講座</span></div><div><b>${days.size}</b><span>通学日・期</span></div><div><b>${units || '-'}</b><span>単位合計</span></div><div><b>${teacherHits}</b><span>優先講師一致</span></div><div><b>${campusHits}</b><span>優先校舎一致</span></div>`;
  $('planCount').textContent=`${plan.length}件`;
  if(!plan.length){list.className='plan-list empty'; list.textContent='まだ予定がありません。'; return;}
  list.className='plan-list';
  plan.forEach(c=>{
    const has=issues.some(w=>w.items.includes(c));
    const item=document.createElement('article'); item.className='plan-item'+(has?' conflict':'')+(teacherPriority(c)>0?' preferred':'');
    item.innerHTML=`<div class="plan-title">${esc(courseName(c))}</div><div class="plan-sub">${esc(c.subject)} / ${esc(c.section)} / ${esc(c.campus)} ${esc(c.group||'')} / ${esc(c.schedule)}<br>${esc(c.code)} / ${esc(c.teacher)}${teacherPriority(c)>0?' / 優先講師一致':''}${preferredCampuses().includes(c.campus)?' / 優先校舎一致':''}</div><button class="small-btn remove">この講座を外す</button>`;
    item.querySelector('button').addEventListener('click',()=>{wanted.delete(c.courseGroupId); plan=plan.filter(x=>x.id!==c.id); renderCandidateBox(); renderCourseNames(); renderPlan(); renderTimeline();});
    list.appendChild(item);
  });
}
function renderTimeline(){
  const el=$('timeline'); el.innerHTML='';
  if(!plan.length){el.className='timeline empty'; el.textContent='予定を作成すると、日程ごとに整理して表示されます。'; return;}
  el.className='timeline'; const map=new Map();
  plan.forEach(c=>c.slots.forEach(s=>{const k=s.day; if(!map.has(k)) map.set(k,[]); map.get(k).push({slot:s,course:c});}));
  [...map.keys()].sort(naturalDaySort).forEach(day=>{
    const block=document.createElement('div'); block.className='day-block'; block.innerHTML=`<h3>${esc(day)}</h3>`;
    map.get(day).sort((a,b)=>periodSortValue(a.slot)-periodSortValue(b.slot)).forEach(x=>{
      const div=document.createElement('div'); div.className='slot'; div.innerHTML=`<div class="slot-time">${esc(x.slot.period)}</div><div><b>${esc(courseName(x.course))}</b><br><span class="plan-sub">${esc(x.course.campus)} ${esc(x.course.group||'')} / ${esc(x.course.code)} / ${esc(x.course.teacher)}</span></div>`; block.appendChild(div);
    });
    el.appendChild(block);
  });
}
function periodSortValue(s){return s.periodNo===99?99:(s.periodNo||0);}
function naturalDaySort(a,b){
  const av=a.match(/(\d+)期/), bv=b.match(/(\d+)期/); if(av&&bv) return +av[1]-+bv[1]; if(av) return -1; if(bv) return 1;
  const ad=a.match(/(\d+)\/(\d+)/), bd=b.match(/(\d+)\/(\d+)/); if(ad&&bd) return (+ad[1]*40+ +ad[2])-(+bd[1]*40+ +bd[2]); if(ad) return -1; if(bd) return 1;
  return a.localeCompare(b,'ja');
}
function exportCsv(){
  if(!plan.length) return;
  const head=['区分','科目','講座名','校舎','組','日程','講座番号','講師名','単位'];
  const body=plan.map(c=>[c.section,c.subject,courseName(c),c.campus,c.group,c.schedule,c.code,c.teacher,c.unit]);
  const csv=[head,...body].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='umeda-schedule-plan.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function renderAll(){renderCourseNames(); renderCandidateBox(); renderPlan(); renderTimeline();}
renderAll();
