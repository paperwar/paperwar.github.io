import {Game, player, TALENTS, SKILLS, STATS, randomInt} from './engine.js';
import {STAT_LABELS} from './catalog.js';
const $=id=>document.getElementById(id);
const controls=$('controls'), title=$('command-title'), message=$('message');
let game=null,iterator=null,timer=null,epoch=0,mode='人机对战',configPlayers=[];
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function log(text){const li=el('li',text,text.startsWith('——')?'turn':text.startsWith('对局结果')?'result':'');$('log').append(li);while($('log').children.length>250)$('log').firstChild.remove();$('log').scrollTop=$('log').scrollHeight;}
function renderPlayers(){
  $('players').replaceChildren();
  const ps=game?.players||configPlayers;
  for(let i=0;i<2;i++){
    const p=ps[i],card=el('article',undefined,'player'+(game?.current===p?' active':''));
    const head=el('div',undefined,'player-head');head.append(el('h3',p?.name||`玩家 ${i+1}`),el('span',p?`${p.talent} · ${p.dead?'已败北':p.pending?'濒死待判':'d'+p.dieSides}`:'等待配置','badge'));card.append(head);
    if(!p)card.append(el('p','选择天赋、分配属性与技能。','placeholder'));
    else {
      const health=el('div',undefined,'health');health.append(el('span','生命值'),el('strong',`${p.hp} / ${p.maxHp}`));
      const track=el('div',undefined,'hp-track'),fill=el('div',undefined,'hp-fill');fill.style.width=`${Math.max(0,p.hp)/p.maxHp*100}%`;track.append(fill);card.append(health,track);
      const stats=el('div',undefined,'stats');STATS.forEach((s,i)=>{const item=el('div',STAT_LABELS[i]);item.append(el('strong',game?game.stat(p,s):p[s]));stats.append(item);});card.append(stats);
      const chips=el('div',undefined,'chips');p.skills.forEach(s=>chips.append(el('span',s+(s in p.disabled?' · 失效':s in p.cooldowns?' · 冷却':''),'chip')));card.append(chips);
      const effects=p.effects.map(e=>`${e.name} ${e.turns}`);if(p.forceFive)effects.push('改命保底');if(p.armed)effects.push('平反待触发');
      card.append(el('div',effects.join(' · ')||'无持续状态','effects'));
    }$('players').append(card);
  }
  $('shared').hidden=!game?.shared;if(game?.shared)$('shared').textContent=`共享生效 · 至 ${game.shared[1].name} 下个回合末，冰封跳过时提前取消`;
  $('phase').textContent=game?(game.over()?'对局结束':`${game.current?.name||'判定先手'}`):'准备开局';
  $('turn-count').textContent=game?`第 ${game.turnCount} 个角色回合`:'双方各选 3 个技能';
  $('die').textContent=game?.rollValue??'?';
}
function button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
function present(request){
  title.textContent=request.title;controls.replaceChildren();message.textContent='';
  $('step').textContent=game?'行动指令':'开局配置';
  if(request.kind==='player'){playerForm(request);return;}
  const choices=el('div',undefined,'choices');
  for(const option of request.options){const b=button('',()=>advance(option),'choice');b.append(el('strong',option));
    const hint=request.hints?.[option];if(hint)b.append(el('small',hint));
    if(request.conditions?.[option]===false)b.classList.add('invalid');choices.append(b);}
  controls.append(choices);
  if(request.kind==='skills')message.textContent='条件未满足的技能仍可选择，但会消耗本次机会且不产生效果。';
}
function playerForm(request){
  const form=el('form'),row=el('div',undefined,'form-row');
  const nameLabel=el('label','名称','field'),name=el('input');name.maxLength=24;name.value=request.name;name.autocomplete='off';nameLabel.append(name);
  const talentLabel=el('label','天赋','field'),talent=el('select');Object.entries(TALENTS).forEach(([s,h])=>{const o=el('option',`${s} · ${h}`);o.value=s;talent.append(o);});talentLabel.append(talent);row.append(nameLabel,talentLabel);form.append(row);
  const fieldset=el('fieldset',undefined,'allocation'),legend=el('legend'),grid=el('div',undefined,'allocation-grid'),inputs=[];
  STAT_LABELS.forEach(label=>{const l=el('label',label,'field'),v=el('input');v.type='number';v.min=0;v.max=14;v.step=1;v.value=2;v.required=true;v.inputMode='numeric';l.append(v);grid.append(l);inputs.push(v);});
  const tally=el('div',undefined,'tally');fieldset.append(legend,grid,tally);form.append(fieldset);
  const skillTitle=el('p','技能 · 选 3 项','skill-legend'),picks=el('div',undefined,'skill-picks'),checks=[];
  const defaults=['圣愈','蛊毒','太极'].filter(s=>request.pool.includes(s));
  for(const s of request.pool){if(defaults.length>=3)break;if(!defaults.includes(s))defaults.push(s);}
  for(const s of request.pool){const l=el('label',undefined,'skill-pick'),c=el('input');c.type='checkbox';c.value=s;c.checked=defaults.includes(s);l.title=SKILLS[s];l.append(c,el('span',s));picks.append(l);checks.push(c);}
  const update=()=>{const total=talent.value==='神'?14:8;legend.textContent=`基础属性 · 共 ${total} 点（天赋加成另计）`;const sum=inputs.reduce((a,v)=>a+Number(v.value),0);tally.textContent=`已分配 ${sum} / ${total} 点`;const count=checks.filter(c=>c.checked).length;skillTitle.textContent=`技能 · 已选 ${count} / 3 项`;};
  inputs.forEach(v=>v.addEventListener('input',update));checks.forEach(v=>v.addEventListener('change',update));
  talent.addEventListener('change',()=>{inputs[3].value=(talent.value==='神'?14:8)-inputs.slice(0,3).reduce((a,v)=>a+Number(v.value),0);update();});update();
  const submit=el('button','确认配置','primary full');submit.type='submit';form.append(skillTitle,picks,submit);
  form.addEventListener('submit',event=>{event.preventDefault();const skills=checks.filter(c=>c.checked).map(c=>c.value),allocation=inputs.map(v=>v.value===''?NaN:Number(v.value));
    try{const p=player(name.value.trim()||request.name,talent.value,allocation,skills);advance(p);}catch(e){message.textContent=e.message;}});
  controls.append(form);message.textContent='点击技能图鉴查看效果。双方禁用的技能不会出现在列表中。';
}
function bot(pool){const talent=Object.keys(TALENTS)[randomInt(0,9)],total=talent==='神'?14:8,stats=[0,0,0,0];for(let i=0;i<total;i++)stats[randomInt(0,3)]++;const skills=[...pool];for(let i=skills.length-1;i>0;i--){const j=randomInt(0,i);[skills[i],skills[j]]=[skills[j],skills[i]];}return player('电脑',talent,stats,skills.slice(0,3),false);}
function* session(){
  mode=yield {kind:'choice',title:'选择对战模式',options:['人机对战','本地双人']};log(`模式：${mode}`);
  const pool=Object.keys(SKILLS),banned=[];
  for(let i=0;i<2;i++){
    const options=pool.filter(s=>!banned.includes(s));
    const ban=i===1&&mode==='人机对战'?options[randomInt(0,options.length-1)]:yield {kind:'choice',title:`玩家 ${i+1} · 禁用一个技能`,options,hints:SKILLS};
    banned.push(ban);log(`${i===1&&mode==='人机对战'?'电脑':'玩家 '+(i+1)} 禁用【${ban}】。`);
  }
  const skills=pool.filter(s=>!banned.includes(s));
  for(let i=0;i<2;i++){
    const p=i===1&&mode==='人机对战'?bot(skills):yield {kind:'player',title:`玩家 ${i+1} · 配置角色`,name:`玩家 ${i+1}`,pool:skills};
    if(i===1&&p.name===configPlayers[0].name)p.name+='（玩家2）';configPlayers.push(p);log(`${p.name} 选择天赋【${p.talent}】。`);
  }
  const originals=configPlayers.map(p=>[...p.skills]);
  for(let i=0;i<2;i++)if(configPlayers[i].talent==='幻'){
    const p=configPlayers[i],candidates=originals[1-i];
    const copy=p.human?yield {kind:'choice',title:`${p.name} · 幻：复制对方初始技能`,options:candidates,hints:SKILLS}:candidates[randomInt(0,2)];
    if(!p.skills.includes(copy))p.skills.push(copy);log(`${p.name} 选择复制【${copy}】。`);
  }
  game=new Game(...configPlayers,{onLog:log});return yield* game.play();
}
function advance(value){
  clearTimeout(timer);controls.replaceChildren();message.textContent='';
  try{
    const state=iterator.next(value);renderPlayers();
    if(state.done){title.textContent=state.value.title;$('step').textContent='对局结果';
      controls.append(button('再来一局',()=>reset(),'primary full'),button('返回规则页',()=>location.assign('../'),'full'));message.textContent='本局已结束。重新开始会清空双方角色与状态。';return;}
    if(state.value.kind==='auto'){
      title.textContent=game?.over()?'结算中':'回合结算中';$('step').textContent='战斗进行中';
      const mine=epoch;timer=setTimeout(()=>{if(mine===epoch)advance();},game?.current?.human?180:450);
    }else present(state.value);
  }catch(error){console.error(error);title.textContent='对局遇到异常';message.textContent='请保留战斗记录并重新开始。'+error.message;controls.append(button('重新开始',()=>reset(),'primary full'));}
}
function reset(){epoch++;clearTimeout(timer);game=null;configPlayers=[];iterator=session();$('log').replaceChildren();log('欢迎来到纸上谈兵。选择模式，开始一局新的对战。');advance();}
$('restart').addEventListener('click',()=>{if(game&&!game.over()&&!confirm('重新开始会丢弃当前对局，确定吗？'))return;reset();});
for(const [id,items] of [['talent-guide',TALENTS],['skill-guide',SKILLS]])for(const [s,h] of Object.entries(items)){const item=el('div',undefined,'guide-item');item.append(el('strong',s),el('p',h));$(id).append(item);}
$('guide-open').addEventListener('click',()=>$('guide').showModal());$('guide-close').addEventListener('click',()=>$('guide').close());
reset();
