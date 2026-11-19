// Browser port of Python engine 1.7. R01–R08 intentionally retain that baseline.
import {TALENTS, SKILLS, STATS} from './catalog.js';
export {TALENTS, SKILLS, STATS};
export const randomInt = (low, high) => low + Math.floor(Math.random() * (high - low + 1));
export const effect = (name, turns, amount = 0, kind = 'loss', source = null) => ({name, turns, amount, kind, source});
export function player(name, talent = '攻', allocation = [2, 2, 2, 2], skills = ['圣愈', '蛊毒', '太极'], human = true) {
  const total = talent === '神' ? 14 : 8;
  if (!(talent in TALENTS) || allocation.length !== 4 || allocation.some(n => !Number.isInteger(n) || n < 0) || allocation.reduce((a,b)=>a+b,0) !== total) throw Error('基础属性分配不合法');
  if (skills.length !== 3 || new Set(skills).size !== 3 || skills.some(s => !(s in SKILLS))) throw Error('请选择三个不同技能');
  const maxHp = 30 + ({生:8, 幻:-8, 励:-6, 神:-15, 卜:-10, 曜:-5}[talent] || 0);
  const p = {name, talent, human, maxHp, hp:maxHp, dieSides:({神:9,卜:8,曜:7}[talent] || 6),
    skills:[...skills], baseAllocation:[...allocation], effects:[], cooldowns:{}, disabled:{},
    heavenUses:0, breakUses:0, forceFive:false, armed:false, lock:0, unlockTurn:0,
    pending:false, dead:false, chain:null, turns:0};
  STATS.forEach((s,i)=>p[s]=allocation[i]);
  if (talent==='攻') p.attack+=2;
  if (talent==='御') {p.resistance++;p.immunity++;}
  if (talent==='刺') p.counter++;
  return p;
}
export class Game {
  constructor(a,b,{randint=randomInt,random=Math.random,onLog=()=>{}}={}) {
    this.players=[a,b]; this.randint=randint; this.random=random; this.onLog=onLog;
    this.queue=[];this.shared=null;this.mirroring=false;this.current=null;this.turnCount=0;
  }
  say(text) {this.onLog(text);}
  enemy(p) {return this.players[p===this.players[0]?1:0];}
  over() {return this.players.some(p=>p.dead);}
  has(p,s) {return p.effects.some(e=>e.name===s);}
  stat(p,s) {return Math.max(0,p[s]-(this.has(p,'烬灭')?2:0));}
  roll(p) {const low=p.forceFive?5:1;p.forceFive=false;return this.randint(low,p.dieSides);}
  dying(p) {
    if (p.hp>0 || p.dead) return;
    const n=this.randint(0,1);this.say(`${p.name} 濒死判定：${n}`);
    if (!n) {p.dead=true;this.say(`${p.name} 败北。`);} else p.pending=true;
  }
  mirror(p,delta) {
    if (!this.shared || this.mirroring) return;
    this.mirroring=true;
    try {const q=this.enemy(p);if(delta>0)this.heal(q,delta,false);else if(delta<0)this.loss(q,-delta,false);}
    finally {this.mirroring=false;}
  }
  heal(p,n,mirror=true) {
    if (n<=0 || p.dead) return 0;
    const before=p.hp;p.hp=Math.min(p.maxHp,p.hp+n);if(p.hp>0)p.pending=false;
    const gain=p.hp-before;if(gain){this.say(`${p.name} 回复 ${gain} 点生命。`);if(mirror)this.mirror(p,gain);}return gain;
  }
  loss(p,n,mirror=true) {
    if(n<=0 || p.dead)return 0;
    p.hp-=n;this.say(`${p.name} 失去 ${n} 点生命。`);
    if(mirror)this.mirror(p,-n);this.dying(p);return n;
  }
  damage(p,raw,kind,source=null,counter=true) {
    if(raw<=0 || p.dead)return 0;
    if(this.has(p,'虚无')){this.say(`${p.name} 的虚无抵挡伤害。`);return 0;}
    if(kind==='physical' && (source?.talent==='曜'||p.talent==='曜'))kind='elemental';
    if(kind==='elemental' && this.has(p,'混沌'))kind='true';
    let reduction=kind==='physical'?this.stat(p,'resistance'):kind==='elemental'?this.stat(p,'immunity'):0;
    if(source && this.has(p,'自守'))reduction+=2;
    const n=Math.max(0,raw-reduction);
    this.say(`${source?.name||'效果'} 对 ${p.name} 造成 ${n} 点${{physical:'物理',elemental:'属性',true:'真实'}[kind]}伤害（原始 ${raw}）。`);
    if(n)this.loss(p,n);
    if(counter && n && source && kind!=='true' && this.stat(p,'counter')>0 && !source.dead){
      this.say(`${p.name} 反制反馈 ${this.stat(p,'counter')} 点。`);this.loss(source,this.stat(p,'counter'));
    }
    if(n && source===this.enemy(p) && p.armed && !this.over()){p.armed=false;this.extra(p,'平反');}
    return n;
  }
  extra(p,why) {this.say(`${p.name} 因${why}获得额外回合。`);if(why==='平反'){p.lock=1;p.unlockTurn=p.turns+1;}this.queue.unshift(p);}
  clearShared() {this.shared=null;this.say('共享结束。');}
  remove(p,e) {const i=p.effects.indexOf(e);if(i>=0)p.effects.splice(i,1);}
  start(p) {
    p.turns++;
    if(this.has(p,'冰封') && this.shared)this.clearShared();
    if(p.pending){p.pending=false;if(p.hp<=0){const n=this.randint(0,1);this.say(`${p.name} 延后濒死判定：${n}`);if(!n){p.dead=true;return false;}p.pending=true;}}
    if(p.talent==='命')this.heal(p,1);
    for(const dict of [p.cooldowns,p.disabled])for(const s of Object.keys(dict))if(--dict[s]<=0)delete dict[s];
    for(const e of [...p.effects].filter(e=>e.name==='自虐')){this.heal(p,15);this.remove(p,e);}
    for(const e of [...p.effects])if(['蛊毒','流血','星辰'].includes(e.name)){
      this.say(`${p.name} 的${e.name}持续结算，原始 ${e.amount}，剩余 ${e.turns} 回合。`);
      if(e.kind==='elemental')this.damage(p,e.amount,'elemental',e.source,e.name!=='蛊毒');else this.loss(p,e.amount);
      if(--e.turns<=0)this.remove(p,e);if(this.over())return false;
    }
    const ice=p.effects.find(e=>e.name==='冰封');
    if(ice){if(--ice.turns<=0)this.remove(p,ice);this.say(`${p.name} 被冰封，本回合跳过。`);return false;}
    return true;
  }
  end(p) {
    for(const e of [...p.effects])if(['烬灭','混沌','自守'].includes(e.name)&&--e.turns<=0)this.remove(p,e);
    for(const q of this.players)if(q!==p)for(const e of [...q.effects])if(e.name==='虚无'&&--e.turns<=0)this.remove(q,e);
    if(this.shared && p===this.shared[1])this.clearShared();
    if(p.lock>0 && p.turns>=p.unlockTurn)p.lock--;
  }
  available(p,s) {return !(s in p.cooldowns) && !(s in p.disabled);}
  condition(p,e,s,n) {
    switch(s){
      case '蛊毒':return n>=3&&!this.has(e,s);case '共享':return n===1;case '冰封':return n>=4;
      case '凋零':return e.hp<e.maxHp/2;case '烬灭':return n>=5&&!this.has(e,s);
      case '平反':return n<=2&&!p.armed&&p.lock===0;case '天赐':return n>=6&&p.heavenUses<2;
      case '时运':return n>=5;case '慷慨':return n===4;
      case '流血':return n<=2&&e.effects.filter(e=>e.name===s).length<2;case '麻痹':return n>=3;
      case '玄冥':return n>=2&&n<=4;case '自虐':case '改命':case '太极':case '自守':return n<=2;
      case '学潮':return n===4||n===6;case '虚无':return n>=5;case '星辰':return !this.has(e,s);
      case '破防':return n>=5&&p.breakUses<2;case '引爆':return n>=6;case '扩散':return n>=3;case '混沌':return n<=3;
      default:return s in SKILLS;
    }
  }
  contest(p,e,n) {
    let a=n,b=this.roll(e);
    for(;;){this.say(`拼点：${p.name} ${a}，${e.name} ${b}`);
      if(a>b){this.damage(e,a-b+this.stat(p,'attack'),'physical',p);return;}
      if(a<b){this.say('进攻方点数较小，无事发生。');return;}
      for(const q of [e,p])if(q.talent==='卜')this.extra(q,'卜');
      this.say('平点，双方重新掷点。');a=this.roll(p);b=this.roll(e);
    }
  }
  use(p,e,s,n) {
    if(this.over())return null;
    if(!(s in SKILLS)||!this.available(p,s)||!this.condition(p,e,s,n)){this.say(`${s} 的触发条件不满足，本次无效。`);return null;}
    this.say(`${p.name} 发动【${s}】。`);
    const add=(q,name,t,amount=0,kind='loss',src=p)=>q.effects.push(effect(name,t,amount,kind,src));
    switch(s){
      case '圣愈':this.heal(p,n/2);break;
      case '饮血':this.heal(p,this.damage(e,n,'physical',p));break;
      case '蛊毒':this.damage(e,2,'elemental',p);add(e,s,2,n,'elemental');break;
      case '共享':this.shared=[p,e];this.say(`共享至${e.name}下个回合末；冰封时提前取消。`);break;
      case '冰封':this.damage(e,4,'elemental',p);add(e,s,1);break;
      case '凋零':this.damage(e,n,'true',p);break;
      case '烬灭':this.damage(e,4,'elemental',p);add(e,s,2);break;
      case '平反':p.armed=true;break;
      case '天赐':for(const key of STATS)p[key]++;p.heavenUses++;this.heal(p,3);break;
      case '时运':this.damage(e,3,'true',p);if(!this.over())p.chain=this.roll(p);break;
      case '慷慨':this.loss(e,6);if(!p.dead)this.loss(p,6);break;
      case '流血':this.damage(e,n,'true',p);add(e,s,2,n);break;
      case '麻痹':{this.damage(e,n,'elemental',p);if(this.over())break;
        const candidates=e.skills.filter(s=>!(s in e.disabled));
        if(candidates.length)return {target:e,candidates};break;}
      case '玄冥':this.damage(e,n,'true',p);p.cooldowns[s]=2;break;
      case '自虐':this.loss(p,10);if(!p.dead)add(p,s,1);break;
      case '改命':p.forceFive=true;break;
      case '学潮':{const v=this.randint(0,1);this.say(`学潮判定：${v}`);if(v===0)this.loss(e,n);else p.armed=true;break;}
      case '虚无':p.effects=p.effects.filter(e=>e.name!==s);add(p,s,1);break;
      case '星辰':add(e,s,n,1.5);break;
      case '太极':this.heal(p,2);this.loss(e,2);break;
      case '破防':e.resistance=Math.max(0,e.resistance-1);e.immunity=Math.max(0,e.immunity-1);p.breakUses++;break;
      case '引爆':this.detonate(e);break;
      case '扩散':for(const x of e.effects)x.turns++;break;
      case '混沌':add(e,s,n);break;
      case '自守':add(p,s,3);break;
    }return null;
  }
  detonate(p) {
    let loss=0;const poisons=[];
    for(const e of p.effects){if(e.name==='蛊毒')poisons.push(e);else if(['流血','星辰'].includes(e.name))loss+=e.amount*e.turns;}
    for(const e of poisons)if(!this.over())this.damage(p,e.amount*e.turns,'elemental',e.source);
    if(loss&&!this.over())this.loss(p,loss);p.effects=[];this.say(`${p.name} 的全部持续效果已移除。`);
  }
  choose(items){return items[this.randint(0,items.length-1)];}
  *actions(p) {
    const e=this.enemy(p);
    while(!this.over()){
      const n=p.chain??this.roll(p);p.chain=null;this.rollValue=n;this.say(`${p.name} 掷出 ${n}。`);
      const valid=p.skills.filter(s=>this.available(p,s)&&this.condition(p,e,s,n));
      const action=p.human?yield {kind:'choice',title:`${p.name} · 点数 ${n}`,options:['拼点','使用技能']}:valid.length&&this.random()<0.65?'使用技能':'拼点';
      if(action==='拼点')this.contest(p,e,n);
      else{
        const used=new Set();const uses=p.talent==='励'?2:1;
        for(let i=0;i<uses&&!this.over();i++){
          const pool=p.skills.filter(s=>!used.has(s)&&this.available(p,s));if(!pool.length)break;
          const ok=pool.filter(s=>this.condition(p,e,s,n));
          const s=p.human?yield {kind:'skills',title:`${p.name} · 选择技能（点数 ${n}）`,options:[...pool,'取消'],hints:SKILLS,conditions:Object.fromEntries(pool.map(s=>[s,this.condition(p,e,s,n)]))}:this.choose(ok.length?ok:pool);
          if(s==='取消')break;used.add(s);
          const selection=this.use(p,e,s,n);
          if(selection){const disabled=p.human?yield {kind:'choice',title:'选择令其失效的技能',options:selection.candidates}:this.choose(selection.candidates);selection.target.disabled[disabled]=2;this.say(`${selection.target.name} 的${disabled}将在下一回合失效。`);}
          if(this.over())break;
          if(i===0&&uses===2&&p.human){const more=yield {kind:'choice',title:'是否使用第二个技能？',options:['继续使用','结束本次行动']};if(more!=='继续使用')break;}
        }
      }
      if(this.over()||p.chain===null)return;
      this.say(`时运：新点数 ${p.chain}，继续行动。`);
      // Let browser paint even through long bot chains. No gameplay chain cap.
      yield {kind:'auto'};
    }
  }
  *play() {
    let rolls;
    do{rolls=[this.randint(0,1),this.randint(0,1)];this.say(`先手判定：${this.players[0].name} ${rolls[0]}，${this.players[1].name} ${rolls[1]}`);}while(rolls[0]===rolls[1]);
    const first=this.players[rolls[0]===1?0:1],second=this.enemy(first);
    this.queue=[first,second];
    while(!this.over()){
      if(!this.queue.length)this.queue=[first,second];const p=this.queue.shift();this.current=p;this.turnCount++;
      this.rollValue=null;this.say(`—— ${p.name} 的回合 ——`);
      const act=this.start(p);if(act&&!this.over())yield* this.actions(p);
      if(this.over())break;this.end(p);yield {kind:'auto'};
    }
    const winner=this.players.find(p=>!p.dead);const title=winner?`${winner.name} 胜利`:'双方败北 · 平局';
    this.say(`对局结果：${title}`);return {title,winner:winner?.name??null};
  }
}
