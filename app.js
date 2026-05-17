const courses = (window.COURSES || []).map((c, i) => ({...c, index:i, slots:parseSlots(c.schedule, c.section, c.campus)}));
let wanted = new Set();
let plan = [];
const $ = id => document.getElementById(id);
const state = {q:'', subject:'', campus:'', section:''};

function uniq(a){return [...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'ja'))}
function optFill(id, values){const el=$(id); values.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o)})}
optFill('subject', uniq(courses.map(c=>c.subject)));
optFill('campus', uniq(courses.map(c=>c.campus)));
optFill('section', uniq(courses.map(c=>c.section)));
optFill('preferredTeachers', uniq(courses.map(c=>c.teacher)));
$('totalCount').textContent = courses.length;

['q','subject','campus','section'].forEach(id=>$(id).addEventListener('input', e=>{state[id]=e.target.value; renderCourses();}));
$('preferredTeachers').addEventListener('change',()=>{if(plan.length) renderPlan();});
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
function makeSlot(day, p, campus){
  const periodLabel = p ? `${p}限` : '時間未指定';
  return {day, period:periodLabel, periodNo:p || 0, campus:campus || '', key:`${day}-P${p || 0}`};
}
function parseSlots(schedule, section, campus){
  const s = normalizeDigits(schedule || '');
  if(s.includes('視聴開始')) return [{day:'映像講座', period:'自由視聴', periodNo:0, campus:'映像', key:'VIDEO'}];
  const slots=[];
  const parts=s.split(/＆|&/).map(x=>x.trim()).filter(Boolean);
  for(const part of parts){
    const term=part.match(/(\d+)期/);
    const ps=periodNums(part);
    if(term){
      const periods=ps.length?ps:[0];
      periods.forEach(p=>slots.push(makeSlot(`${term[1]}期`, p, campus)));
      continue;
    }
    const range=part.match(/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*[～~]\s*(\d{1,2})\/(\d{1,2})/);
    if(range){
      const start=+range[2], end=+range[4], month=+range[1];
      for(let d=start; d<=end; d++) slots.push({day:`${month}/${d}`, period:'全日', periodNo:99, campus:campus || '', key:`${month}/${d}-ALL`});
      continue;
    }
    const dates=[...part.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map(m=>`${+m[1]}/${+m[2]}`);
    if(dates.length){
      const ps2=ps.length?ps:[0];
      dates.forEach(d=>ps2.forEach(p=>slots.push(makeSlot(d, p, campus))));
      continue;
    }
    slots.push({day:s, period:'時間未指定', periodNo:0, campus:campus || '', key:`RAW-${s}`});
  }
  return slots;
}
function preferredTeacherTerms(){
  const el = $('preferredTeachers');
  if(!el) return [];
  return [...el.selectedOptions].map(o=>normalizeDigits(o.value || o.textContent || '').trim()).filter(Boolean);
}
function teacherPriority(c){
  const terms=preferredTeacherTerms();
  if(!terms.length) return 0;
  const teacher=normalizeDigits(c.teacher || '').replace(/\s+/g,'');
  let best=0;
  for(const raw of terms){
    const t=normalizeDigits(raw).replace(/\s+/g,'');
    if(!t) continue;
    if(teacher === t) best=Math.max(best, 70);
    else if(teacher.includes(t) || t.includes(teacher)) best=Math.max(best, 55);
  }
  return best;
}
function filteredCourses(){
  const q=state.q.trim().toLowerCase();
  return courses.filter(c => (!q || [c.course,c.teacher,c.code,c.schedule,c.subject,c.campus].join(' ').toLowerCase().includes(q)) && (!state.subject||c.subject===state.subject) && (!state.campus||c.campus===state.campus) && (!state.section||c.section===state.section));
}
function sectionBucket(section){
  if(String(section).includes('特訓')) return '夏期特訓';
  if(String(section).includes('講習')) return '夏期講習';
  return section || 'その他';
}
function bucketOrder(name){
  if(name==='夏期特訓') return 1;
  if(name==='夏期講習') return 2;
  return 9;
}
function renderCourseCard(c){
  const isWanted=wanted.has(c.course);
  const card=document.createElement('article'); card.className='course-card'+(isWanted?' wanted':'');
  card.innerHTML=`<div class="course-main"><div><div class="course-title">${esc(c.course)}</div><div class="meta"><span class="pill">${esc(c.subject)}</span><span class="pill gray">${esc(c.section)}</span><span class="pill gray">${esc(c.campus)} ${esc(c.group||'')}</span><span class="pill gray">${esc(c.schedule)}</span><span class="pill gray">${esc(c.code)}</span><span class="pill gray">${esc(c.teacher)}</span></div></div><div class="course-actions"><button class="small-btn want">${isWanted?'候補解除':'候補'}</button><button class="small-btn add">追加</button></div></div>`;
  card.querySelector('.want').addEventListener('click',()=>{wanted.has(c.course)?wanted.delete(c.course):wanted.add(c.course);renderCourses();renderCandidateBox();});
  card.querySelector('.add').addEventListener('click',()=>{if(!plan.some(x=>x.id===c.id)) plan.push(c);renderPlan();renderTimeline();});
  return card;
}
function renderCourses(){
  const list=$('courseList'); list.innerHTML='';
  const arr=filteredCourses(); $('visibleCount').textContent=`${arr.length}件`;
  if(!arr.length){
    list.innerHTML='<div class="empty-message">条件に一致する講座がありません。</div>';
    return;
  }

  const grouped=new Map();
  arr.forEach(c=>{
    const bucket=sectionBucket(c.section);
    if(!grouped.has(bucket)) grouped.set(bucket, new Map());
    const subjects=grouped.get(bucket);
    if(!subjects.has(c.subject || '未分類')) subjects.set(c.subject || '未分類', []);
    subjects.get(c.subject || '未分類').push(c);
  });

  [...grouped.entries()]
    .sort((a,b)=>bucketOrder(a[0])-bucketOrder(b[0]) || a[0].localeCompare(b[0],'ja'))
    .forEach(([bucket, subjectMap], bucketIndex)=>{
      const total=[...subjectMap.values()].reduce((n,v)=>n+v.length,0);
      const bucketDetails=document.createElement('details');
      bucketDetails.className='accordion bucket-accordion';
      bucketDetails.open=true;
      bucketDetails.innerHTML=`<summary><span class="summary-title">${esc(bucket)}</span><span class="summary-count">${total}件</span></summary>`;

      const subjectWrap=document.createElement('div');
      subjectWrap.className='subject-wrap';
      [...subjectMap.entries()]
        .sort((a,b)=>a[0].localeCompare(b[0],'ja'))
        .forEach(([subject, items])=>{
          const details=document.createElement('details');
          details.className='accordion subject-accordion';
          details.open = arr.length <= 80 || bucketIndex === 0;
          details.innerHTML=`<summary><span class="summary-title">${esc(subject)}</span><span class="summary-count">${items.length}件</span></summary>`;
          const inner=document.createElement('div');
          inner.className='subject-course-list';
          items.forEach(c=>inner.appendChild(renderCourseCard(c)));
          details.appendChild(inner);
          subjectWrap.appendChild(details);
        });
      bucketDetails.appendChild(subjectWrap);
      list.appendChild(bucketDetails);
    });
}
function realSlots(c){return c.slots.filter(s=>s.key!=='VIDEO');}
function slotOverlaps(a,b){
  if(a.day!==b.day) return false;
  if(a.periodNo===99 || b.periodNo===99) return true;
  if(!a.periodNo || !b.periodNo) return false;
  return a.periodNo===b.periodNo;
}
function campusMoveProblem(a,b){
  if(a.day!==b.day) return false;
  if(!a.periodNo || !b.periodNo || a.periodNo===99 || b.periodNo===99) return false;
  if(!a.campus || !b.campus || a.campus===b.campus) return false;
  const diff=Math.abs(a.periodNo-b.periodNo);
  if(diff!==1) return false;
  const pair=[a.periodNo,b.periodNo].sort((x,y)=>x-y).join('-');
  return pair !== '2-3';
}
function issuesFor(items){
  const issues=[];
  for(let i=0;i<items.length;i++){
    for(let j=i+1;j<items.length;j++){
      const a=items[i], b=items[j];
      for(const sa of realSlots(a)) for(const sb of realSlots(b)){
        if(slotOverlaps(sa,sb)) issues.push({type:'conflict', day:sa.day, period:sa.periodNo===99?'全日':sa.period, items:[a,b]});
        else if(campusMoveProblem(sa,sb)) issues.push({type:'move', day:sa.day, period:`${Math.min(sa.periodNo,sb.periodNo)}限→${Math.max(sa.periodNo,sb.periodNo)}限`, items:[a,b], campuses:[sa.campus,sb.campus]});
      }
    }
  }
  return issues;
}
function conflictCount(items){return issuesFor(items).filter(x=>x.type==='conflict').length;}
function issuePenalty(items){
  return issuesFor(items).reduce((n,x)=>n+(x.type==='conflict'?100000:25000),0);
}
function scoreCourse(c, chosen){
  let score=0;
  if($('preferUmeda').checked && c.campus==='梅田') score+=30;
  if($('preferUmeda').checked && c.campus!=='梅田' && c.campus!=='映像') score-=8;
  if($('preferVideo').checked && c.campus==='映像') score+=12;
  if(!$('preferVideo').checked && c.campus==='映像') score-=3;
  score += teacherPriority(c);
  const nonVideo=realSlots(c);
  const existingDays=new Set(chosen.flatMap(x=>realSlots(x).map(s=>s.day)));
  const newDays=[...new Set(nonVideo.map(s=>s.day))].filter(d=>!existingDays.has(d)).length;
  if($('compact').checked) score-=newDays*2;
  score-=nonVideo.length*0.1;
  return score;
}
function stateScore(items){
  let score=items.length*1000 - issuePenalty(items);
  items.forEach((c,i)=> score+=scoreCourse(c, items.slice(0,i)));
  const days=new Set(items.flatMap(x=>realSlots(x).map(s=>s.day)));
  if($('compact').checked) score-=days.size*4;
  return score;
}
function autoSchedule(){
  const names=[...wanted];
  if(!names.length){ plan=[]; renderPlan(['候補が選択されていません。']); renderTimeline(); return; }
  const groups=names.map(name=>({name, opts:courses.filter(c=>c.course===name)})).filter(g=>g.opts.length);
  let states=[{items:[], score:0}];
  const beamSize=180;
  for(const group of groups){
    const next=[];
    for(const st of states){
      const sorted=[...group.opts].sort((a,b)=>scoreCourse(b,st.items)-scoreCourse(a,st.items));
      for(const opt of sorted){
        const items=[...st.items,opt];
        next.push({items, score:stateScore(items)});
      }
    }
    next.sort((a,b)=>b.score-a.score);
    states=dedupeStates(next).slice(0,beamSize);
  }
  const best=states.sort((a,b)=>b.score-a.score)[0];
  plan=best ? best.items : [];
  renderPlan();
  renderTimeline();
}
function dedupeStates(states){
  const seen=new Set(), out=[];
  for(const st of states){
    const k=st.items.map(x=>x.id).join('|');
    if(seen.has(k)) continue;
    seen.add(k); out.push(st);
  }
  return out;
}
function renderCandidateBox(){
  const el=$('candidateBox');
  const names=[...wanted].sort((a,b)=>a.localeCompare(b,'ja'));
  if(!names.length){el.className='candidate-box empty';el.textContent='「候補」を押した講座がここに入ります。自動作成では、同じ講座名の複数候補から最適な組・校舎・講師を選びます。';return;}
  el.className='candidate-box';
  el.innerHTML=names.map(n=>`<span>${esc(n)} <button class="x" data-name="${escAttr(n)}">×</button></span>`).join('');
  el.querySelectorAll('.x').forEach(btn=>btn.addEventListener('click',()=>{wanted.delete(btn.dataset.name);renderCandidateBox();renderCourses();}));
}
function renderPlan(extraWarnings=[]){
  const list=$('planList'), warns=$('warnings'), summary=$('summary'); list.innerHTML=''; warns.innerHTML=''; summary.innerHTML='';
  extraWarnings.forEach(w=>warns.innerHTML += `<div class="warn">${esc(w)}</div>`);
  const issues=issuesFor(plan);
  issues.forEach(w=>{
    const msg = w.type==='conflict'
      ? `${esc(w.day)} ${esc(w.period)}で重複: ${w.items.map(x=>esc(x.course+' '+x.code)).join(' / ')}`
      : `${esc(w.day)} ${esc(w.period)}の校舎移動が厳しい可能性: ${w.items.map(x=>esc(x.course+' '+x.campus)).join(' / ')}。2限と3限の間の校舎移動のみ可能として判定しています。`;
    warns.innerHTML += `<div class="warn">${msg}</div>`;
  });
  if(plan.length && !issues.length) warns.innerHTML = `<div class="ok">重複なし。校舎移動は「2限と3限の間のみ可能」として判定済みです。</div>`;
  const days=new Set(plan.flatMap(c=>realSlots(c).map(s=>s.day)));
  const units=plan.reduce((a,c)=>a+(parseFloat(c.unit)||0),0);
  const preferred=plan.filter(c=>teacherPriority(c)>0).length;
  summary.innerHTML=`<div><b>${plan.length}</b><span>選択講座</span></div><div><b>${days.size}</b><span>通学日・期</span></div><div><b>${units || '-'}</b><span>単位合計</span></div><div><b>${preferred}</b><span>優先講師一致</span></div>`;
  $('planCount').textContent=`${plan.length}件`;
  if(!plan.length){list.className='plan-list empty';list.textContent='まだ講座が追加されていません。';return;}
  list.className='plan-list';
  plan.forEach(c=>{
    const has=issues.some(w=>w.items.includes(c));
    const item=document.createElement('article'); item.className='plan-item'+(has?' conflict':'')+(teacherPriority(c)>0?' preferred':'');
    item.innerHTML=`<div class="plan-title">${esc(c.course)}</div><div class="plan-sub">${esc(c.subject)} / ${esc(c.section)} / ${esc(c.campus)} ${esc(c.group||'')} / ${esc(c.schedule)}<br>${esc(c.code)} / ${esc(c.teacher)}${teacherPriority(c)>0?' / 優先講師':''}</div><button class="small-btn remove">削除</button>`;
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
    map.get(day).sort((a,b)=>periodSortValue(a.slot)-periodSortValue(b.slot)).forEach(x=>{
      const div=document.createElement('div'); div.className='slot'; div.innerHTML=`<div class="slot-time">${esc(x.slot.period)}</div><div><b>${esc(x.course.course)}</b><br><span class="plan-sub">${esc(x.course.campus)} ${esc(x.course.group||'')} / ${esc(x.course.code)} / ${esc(x.course.teacher)}</span></div>`; block.appendChild(div);
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
  const body=plan.map(c=>[c.section,c.subject,c.course,c.campus,c.group,c.schedule,c.code,c.teacher,c.unit]);
  const csv=[head,...body].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='umeda-schedule-plan.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function esc(s){return String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function escAttr(s){return esc(s).replace(/'/g,'&#39;');}
function renderAll(){renderCourses();renderCandidateBox();renderPlan();renderTimeline();}
renderAll();
