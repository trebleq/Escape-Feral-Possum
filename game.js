/* =====================================================================
   ESCAPE FROM THE POSSUM DEN
   Complete original browser FPS. Three.js WebGL renderer.
   No copyrighted assets - all geometry, textures and sounds generated
   procedurally at runtime.
   ===================================================================== */

/* ------------------------------------------------------------------ *
 *  0. SMALL UTILITIES
 * ------------------------------------------------------------------ */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function dist2(ax,ay,bx,by){const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;}
function choice(rng,arr){return arr[Math.floor(rng()*arr.length)];}

/* ------------------------------------------------------------------ *
 *  1. AUDIO ENGINE  (Web Audio API, fully synthesized, no files)
 * ------------------------------------------------------------------ */
class AudioEngine{
  constructor(){
    this.ctx=null; this.master=null; this.musicGain=null; this.sfxGain=null;
    this.muted=false; this.musicOn=true; this.sfxOn=true;
    this.musicNodes=[];
  }
  init(){
    if(this.ctx) return;
    this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    this.master=this.ctx.createGain(); this.master.gain.value=0.9; this.master.connect(this.ctx.destination);
    this.musicGain=this.ctx.createGain(); this.musicGain.gain.value=0.25; this.musicGain.connect(this.master);
    this.sfxGain=this.ctx.createGain(); this.sfxGain.gain.value=0.8; this.sfxGain.connect(this.master);
  }
  setMute(m){this.muted=m; if(this.master) this.master.gain.value = m?0:0.9;}
  setMusic(on){this.musicOn=on; if(this.musicGain) this.musicGain.gain.value = on?0.25:0;}
  setSfx(on){this.sfxOn=on;}
  now(){return this.ctx.currentTime;}

  tone(freq,dur,type='sine',vol=0.3,glideTo=null,delay=0){
    if(!this.ctx||!this.sfxOn) return;
    const t0=this.now()+delay;
    const osc=this.ctx.createOscillator(); osc.type=type; osc.frequency.setValueAtTime(freq,t0);
    if(glideTo!==null) osc.frequency.exponentialRampToValueAtTime(Math.max(1,glideTo),t0+dur);
    const g=this.ctx.createGain(); g.gain.setValueAtTime(vol,t0);
    g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t0); osc.stop(t0+dur+0.02);
  }
  noise(dur,vol=0.3,filterFreq=2000,delay=0){
    if(!this.ctx||!this.sfxOn) return;
    const t0=this.now()+delay;
    const bufSize=this.ctx.sampleRate*dur;
    const buf=this.ctx.createBuffer(1,bufSize,this.ctx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufSize;i++) data[i]=(Math.random()*2-1)*(1-i/bufSize);
    const src=this.ctx.createBufferSource(); src.buffer=buf;
    const filt=this.ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=filterFreq;
    const g=this.ctx.createGain(); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t0);
  }
  // --- specific SFX ---
  shootPistol(){this.tone(320,0.08,'square',0.25,120); this.noise(0.05,0.15,4000);}
  shootShotgun(){this.noise(0.28,0.55,1500); this.tone(140,0.2,'sawtooth',0.3,60);}
  shootRaygun(){this.tone(900,0.35,'sawtooth',0.3,180); this.tone(1800,0.3,'sine',0.15,300,0.02);}
  reload(){this.tone(200,0.08,'square',0.15); this.tone(260,0.08,'square',0.15,null,0.15);}
  hit(){this.tone(500,0.06,'square',0.2,200);}
  enemyHurt(){this.tone(180,0.12,'sawtooth',0.25,80);}
  enemyDie(){this.noise(0.3,0.3,800); this.tone(120,0.3,'sawtooth',0.25,40);}
  playerHurt(){this.tone(140,0.2,'sawtooth',0.35,60); this.noise(0.15,0.2,600);}
  pickup(){this.tone(600,0.09,'sine',0.25,900); this.tone(900,0.09,'sine',0.2,1200,0.05);}
  door(){this.noise(0.4,0.2,400);}
  denied(){this.tone(160,0.15,'square',0.2,120);}
  footstep(){this.noise(0.06,0.06,300);}
  bossRoar(){this.tone(90,0.7,'sawtooth',0.35,50); this.noise(0.6,0.25,500);}
  uiClick(){this.tone(700,0.05,'square',0.15,900);}
  jump(){this.tone(300,0.1,'sine',0.2,500);}
  land(){this.noise(0.08,0.15,300);}
  startMusic(levelIndex){
    this.stopMusic();
    if(!this.ctx||!this.musicOn) return;
    // generative ambient drone + slow arpeggio, unique per level via seed
    const rng=mulberry32(levelIndex*777+3);
    const baseFreq=[55,58.27,61.74,65.41,49][levelIndex%5];
    const drone=this.ctx.createOscillator(); drone.type='sawtooth'; drone.frequency.value=baseFreq;
    const droneGain=this.ctx.createGain(); droneGain.gain.value=0.05;
    const filt=this.ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=300;
    drone.connect(filt); filt.connect(droneGain); droneGain.connect(this.musicGain);
    drone.start();
    this.musicNodes.push(drone);
    let step=0;
    const arpNotes=[baseFreq*2,baseFreq*2.38,baseFreq*3,baseFreq*2.83];
    this.musicInterval=setInterval(()=>{
      if(!this.musicOn) return;
      const f=arpNotes[step%arpNotes.length]*(rng()>0.85?0.5:1);
      this.tone(f,1.1,'sine',0.05,null,0);
      step++;
    },900);
  }
  stopMusic(){
    this.musicNodes.forEach(n=>{try{n.stop();}catch(e){}});
    this.musicNodes=[];
    if(this.musicInterval) clearInterval(this.musicInterval);
  }
}
const AUDIO=new AudioEngine();

/* ------------------------------------------------------------------ *
 *  2. SAVE SYSTEM
 * ------------------------------------------------------------------ */
const SAVE_KEY='possumden_save_v1';
const SaveSystem={
  default(){
    return {
      unlockedWeapons:['pistol'],
      currency:0,
      levelIndex:0,
      completedLevels:[],
      settings:{sensitivity:8,music:true,sfx:true,mute:false,fov:88},
      highScore:0,
      exists:false
    };
  },
  load(){
    try{
      const raw=localStorage.getItem(SAVE_KEY);
      if(!raw) return this.default();
      const d=JSON.parse(raw); d.exists=true; return Object.assign(this.default(),d,{exists:true});
    }catch(e){ return this.default(); }
  },
  save(data){
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }catch(e){}
  },
  reset(){
    try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  }
};

/* ------------------------------------------------------------------ *
 *  3. PROCEDURAL TEXTURES (canvas -> THREE.CanvasTexture), original art
 * ------------------------------------------------------------------ */
function makeCanvas(w,h,drawFn){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d'); drawFn(ctx,w,h);
  const tex=new THREE.CanvasTexture(c);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}
const TEXTURES={};
function buildTextures(){
  TEXTURES.caveWall=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#2a2f24'; ctx.fillRect(0,0,w,h);
    for(let i=0;i<340;i++){
      ctx.fillStyle=`rgba(${20+Math.random()*40},${25+Math.random()*40},${15+Math.random()*30},${0.3+Math.random()*0.4})`;
      const s=2+Math.random()*10;
      ctx.fillRect(Math.random()*w,Math.random()*h,s,s);
    }
  });
  TEXTURES.caveFloor=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#1c2018'; ctx.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){
      ctx.fillStyle=`rgba(${30+Math.random()*30},${34+Math.random()*30},${20+Math.random()*25},0.5)`;
      ctx.beginPath(); ctx.arc(Math.random()*w,Math.random()*h,1+Math.random()*4,0,7); ctx.fill();
    }
  });
  TEXTURES.industrialWall=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#31342f'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#1a1c19'; ctx.lineWidth=3;
    for(let i=0;i<h;i+=32){ ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }
    for(let i=0;i<w;i+=64){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
    ctx.fillStyle='rgba(127,255,107,0.08)';
    ctx.fillRect(10,10,8,8);
  });
  TEXTURES.industrialFloor=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#26281f'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#0f100c'; ctx.lineWidth=2;
    for(let i=0;i<w;i+=16){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
  });
  TEXTURES.labWall=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#232b2e'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(107,197,255,0.08)';
    for(let i=0;i<6;i++) ctx.fillRect(Math.random()*w,0,2,h);
    ctx.strokeStyle='#101619'; ctx.lineWidth=4;
    ctx.strokeRect(4,4,w-8,h-8);
  });
  TEXTURES.reactorWall=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#2b2320'; ctx.fillRect(0,0,w,h);
    const grad=ctx.createRadialGradient(w/2,h/2,4,w/2,h/2,70);
    grad.addColorStop(0,'rgba(255,140,60,0.25)'); grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grad; ctx.fillRect(0,0,w,h);
  });
  TEXTURES.denWall=makeCanvas(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#241a24'; ctx.fillRect(0,0,w,h);
    for(let i=0;i<200;i++){
      ctx.fillStyle=`rgba(${90+Math.random()*40},${30+Math.random()*20},${90+Math.random()*40},${0.15+Math.random()*0.2})`;
      ctx.beginPath(); ctx.arc(Math.random()*w,Math.random()*h,1+Math.random()*5,0,7); ctx.fill();
    }
  });
  TEXTURES.ceiling=makeCanvas(64,64,(ctx,w,h)=>{
    ctx.fillStyle='#0c0e0a'; ctx.fillRect(0,0,w,h);
    for(let i=0;i<40;i++){ ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(Math.random()*w,Math.random()*h,3,3); }
  });
  TEXTURES.door=makeCanvas(64,64,(ctx,w,h)=>{
    ctx.fillStyle='#5a4a1f'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#2c2410'; ctx.lineWidth=4; ctx.strokeRect(4,4,w-8,h-8);
    ctx.fillStyle='#caa53d'; ctx.beginPath(); ctx.arc(w-14,h/2,4,0,7); ctx.fill();
  });
}

/* ------------------------------------------------------------------ *
 *  4. MAZE / LEVEL GENERATION
 *     Grid legend: 0 floor, 1 wall, 2 locked door, 9 open room floor
 * ------------------------------------------------------------------ */
function generateMaze(size,rng){
  // recursive-backtracker on odd grid, 1 = wall, 0 = floor
  const grid=[];
  for(let y=0;y<size;y++){ grid.push(new Array(size).fill(1)); }
  function carve(x,y){
    grid[y][x]=0;
    const dirs=[[0,-2],[0,2],[-2,0],[2,0]];
    for(let i=dirs.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
    for(const [dx,dy] of dirs){
      const nx=x+dx, ny=y+dy;
      if(nx>0&&ny>0&&nx<size-1&&ny<size-1&&grid[ny][nx]===1){
        grid[y+dy/2][x+dx/2]=0;
        carve(nx,ny);
      }
    }
  }
  carve(1,1);
  // knock a few extra connections for loops (less corridor-y, more open)
  for(let i=0;i<Math.floor(size*0.9);i++){
    const x=1+Math.floor(rng()*(size-2)), y=1+Math.floor(rng()*(size-2));
    if(grid[y][x]===1) grid[y][x]=0;
  }
  return grid;
}
function carveRoom(grid,cx,cy,r){
  for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++){
    if(x>0&&y>0&&x<grid.length-1&&y<grid.length-1) grid[y][x]=0;
  }
}
function floorCells(grid){
  const out=[];
  for(let y=0;y<grid.length;y++) for(let x=0;x<grid.length;x++) if(grid[y][x]===0) out.push([x,y]);
  return out;
}

/* ------------------------------------------------------------------ *
 *  5. LEVEL DEFINITIONS (data-driven: each entry -> real, distinct level)
 * ------------------------------------------------------------------ */
const CELL=4; // world units per grid cell
const LEVELS=[
  { key:'burrow', name:'THE BURROW', size:11, wallTex:'caveWall', floorTex:'caveFloor', fog:0x0d100c,
    enemies:{grub:2}, hasShop:false, unlockWeapon:null, bossType:null,
    intro:["...ugh. Where... where am I?","The air smells like wet earth and rust.","I need to find a way out of here.",
           "Something moved in the dark. I'm not alone down here."],
    objective:'Find a way out of the burrow.' },

  { key:'tunnels', name:'THE TUNNELS', size:13, wallTex:'caveWall', floorTex:'caveFloor', fog:0x0d100c,
    enemies:{grub:3, skitterling:3}, hasShop:true, unlockWeapon:null, bossType:null,
    intro:["These tunnels go on forever.","I found a locked door. There has to be a key somewhere close."],
    objective:'Find the key and open the locked door.' },

  { key:'facility', name:'THE FORGOTTEN FACILITY', size:13, wallTex:'labWall', floorTex:'industrialFloor', fog:0x0a0e12,
    enemies:{skitterling:3, spitter:3}, hasShop:true, unlockWeapon:'shotgun', bossType:null,
    intro:["This isn't a cave anymore. Someone built this.","Old terminals, cracked glass tanks... a lab, buried underground.",
           "There's a rusted shotgun mounted on the wall. It still works.",
           "A torn photograph on the floor. Two friends grinning at the camera. One of them... looks familiar."],
    objective:'Explore the facility and find the exit.' },

  { key:'nest', name:'THE NEST', size:15, wallTex:'caveWall', floorTex:'caveFloor', fog:0x120c10,
    enemies:{spitter:2, skitterling:4, brute:1}, hasShop:false, unlockWeapon:null, bossType:'burrowbeast',
    intro:["The walls are warm here. Something has been nesting.","I can hear it breathing before I can see it."],
    objective:'Survive the Nest... and whatever made it.' },

  { key:'factory', name:'THE UNDERGROUND FACTORY', size:15, wallTex:'industrialWall', floorTex:'industrialFloor', fog:0x0a0c0a,
    enemies:{spitter:3, brute:2, skitterling:3}, hasShop:true, unlockWeapon:null, bossType:null,
    intro:["Machinery, still running after all this time.","Whoever built the Possum Den wanted it to last.",
           "A worker's badge, half-melted. The name is scratched out."],
    objective:'Push through the factory floor.' },

  { key:'deepden', name:'THE DEEP DEN', size:15, wallTex:'denWall', floorTex:'caveFloor', fog:0x120a14,
    enemies:{brute:2, spitter:3, broodcaller:2, skitterling:3}, hasShop:true, unlockWeapon:null, bossType:null,
    intro:["The tunnels twist wrong down here, like the Den is breathing.","I found Liam's old jacket, torn and half-buried in the dirt.",
           "He came down here before me. Looking for something. Or someone.",
           "God... Liam, what happened to you?"],
    objective:'Go deeper. Find out what happened to Liam.' },

  { key:'reactor', name:'THE REACTOR', size:15, wallTex:'reactorWall', floorTex:'industrialFloor', fog:0x140a08,
    enemies:{brute:2, spitter:3, broodcaller:2}, hasShop:false, unlockWeapon:'raygun', bossType:'tunnelwarden',
    intro:["The heat down here is unbearable. Something is still powering this place.","A prototype weapon, still humming with charge. I'll take it.",
           "The creature guarding this reactor is unlike anything I've seen. It's protecting something."],
    objective:'Take the reactor weapon and defeat its guardian.' },

  { key:'oldburrow', name:'THE OLD BURROW', size:15, wallTex:'denWall', floorTex:'caveFloor', fog:0x160a12,
    enemies:{brute:3, broodcaller:2, spitter:3, skitterling:4}, hasShop:true, unlockWeapon:null, bossType:'denmother',
    intro:["This is where it started. Liam's camp, abandoned.","His journal. The last entry just says: \"I can hear it calling me. I think I'm becoming it.\"",
           "Liam was my friend. Before all of this. Before the Den took him.",
           "He's close. I can feel it."],
    objective:'Face what guards Liam\'s camp.' },
];
const FINAL_LEVEL={
  key:'heart', name:'THE HEART OF THE DEN', size:17, wallTex:'denWall', floorTex:'caveFloor', fog:0x1a0a16,
  enemies:{brute:3, spitter:3, broodcaller:2}, hasShop:false, unlockWeapon:null, bossType:'liam',
  intro:["This is it. The deepest chamber of the Possum Den.","The exit is close. I can feel cold air ahead.",
         "But something huge is blocking the way.","...Liam?"],
  objective:'Reach the heart of the Den. Face Liam.'
};
LEVELS.push(FINAL_LEVEL);
const TOTAL_LEVELS=LEVELS.length; // 9 total: 8 requested build-out levels + the Heart/finale

/* ------------------------------------------------------------------ *
 *  6. WEAPON DEFINITIONS
 * ------------------------------------------------------------------ */
const WEAPONS={
  pistol:{ name:'PISTOL', clip:8, infiniteReserve:true, reserve:Infinity, damage:20, fireRate:0.28, reloadTime:0.9,
           spread:0.01, pellets:1, range:60, color:0x9fb0a0, sound:'shootPistol' },
  shotgun:{ name:'SHOTGUN', clip:5, infiniteReserve:false, reserve:24, damage:9, fireRate:0.75, reloadTime:1.6,
            spread:0.09, pellets:7, range:22, color:0xb08a4a, sound:'shootShotgun' },
  raygun:{ name:'RAY GUN', clip:4, infiniteReserve:false, reserve:12, damage:65, fireRate:0.9, reloadTime:1.8,
           spread:0.005, pellets:1, range:80, color:0x6bc5ff, sound:'shootRaygun' },
};

/* ------------------------------------------------------------------ *
 *  7. ENEMY DEFINITIONS
 * ------------------------------------------------------------------ */
const ENEMY_TYPES={
  grub:      { name:'Grub', hp:35, speed:1.6, dmg:8,  atkRange:1.6, atkCooldown:1.0, ranged:false, color:0x6b7a3a, radius:0.5, height:1.2, xp:5 },
  skitterling:{name:'Skitterling', hp:16, speed:3.4, dmg:5,  atkRange:1.3, atkCooldown:0.6, ranged:false, color:0xb04a4a, radius:0.35,height:0.8, xp:4 },
  spitter:   { name:'Spitter', hp:28, speed:1.4, dmg:10, atkRange:9,   atkCooldown:1.8, ranged:true,  color:0x4a8a4a, radius:0.45,height:1.1, xp:6 },
  brute:     { name:'Brute', hp:80, speed:1.1, dmg:16, atkRange:2.0, atkCooldown:1.3, ranged:false, color:0x5a4a6b, radius:0.7, height:1.7, xp:10 },
  broodcaller:{name:'Broodcaller', hp:24, speed:1.5, dmg:0,  atkRange:7,   atkCooldown:3.0, ranged:false, color:0xaa7a2a, radius:0.4, height:1.0, xp:8, support:true },
};
const BOSS_TYPES={
  burrowbeast:{ name:'THE BURROW BEAST', hp:260, speed:2.2, color:0x8a3a3a, radius:1.1, height:2.2,
                phaseAt:[1.0], dmgMelee:18, chargeDmg:26 },
  tunnelwarden:{ name:'THE TUNNEL WARDEN', hp:320, speed:1.6, color:0x3a6a8a, radius:1.2, height:2.3,
                 phaseAt:[0.6], dmgMelee:20, spawnsMinions:true },
  denmother:{ name:'THE DEN MOTHER', hp:380, speed:1.4, color:0xaa5a2a, radius:1.3, height:2.4,
              phaseAt:[0.66,0.33], dmgMelee:22, spawnsMinions:true },
  liam:{ name:'LIAM', hp:520, speed:2.6, color:0x7a3a7a, radius:1.1, height:2.1,
         phaseAt:[0.75,0.5,0.25], dmgMelee:24 },
};

/* ------------------------------------------------------------------ *
 *  8. CUTSCENE / STORY DATA -- boss intros, victories, reveal, endings
 * ------------------------------------------------------------------ */
const BOSS_INTRO_LINES={
  burrowbeast:["The nest wall tears open.","THE BURROW BEAST emerges, roaring.","It hasn't seen a person in a long, long time."],
  tunnelwarden:["A hulking shape rises from the reactor coolant.","THE TUNNEL WARDEN was built - or grown - to guard this place.","It calls smaller creatures to its side."],
  denmother:["The camp's warmth was a lure.","THE DEN MOTHER descends from the dark above.","Every creature you've fought so far... she made them."],
  liam:["The huge shape turns toward you.","For a moment, it just... looks at you.","\"...is that you?\" it rasps, in a voice you used to know.","LIAM"],
};
const BOSS_VICTORY_LINES={
  burrowbeast:["The Burrow Beast collapses, finally still.","You did not know something like this lived down here."],
  tunnelwarden:["The Tunnel Warden's light dims and goes dark.","The reactor hums quieter now, like it's grieving too."],
  denmother:["The Den Mother falls silent at last.","In her nest you find dozens of old belongings. Not all of them were monsters, once."],
};
const LIAM_TAUNTS=[
  "\"You always were stubborn.\"",
  "\"Remember the treehouse? Feels like another life.\"",
  "\"I didn't want this. I don't think I had a choice.\"",
  "\"Just stop. Please.\"",
  "\"...I'm still in here. Somewhere.\"",
];
const ENDING_ESCAPE_LINES=[
  "You make your choice before you can think better of it.",
  "\"I'm sorry,\" you whisper.",
  "Liam's eyes go still. For a second, they look almost relieved.",
  "\"...thank you,\" he manages, and then he's gone.",
  "The tunnel behind you is collapsing. You run.",
  "Light. Real light, for the first time in what feels like forever.",
  "You made it out. Liam didn't.",
  "You don't know if that makes you the one who survived, or the one who was left behind."
];
const ENDING_STAY_LINES=[
  "You lower your weapon.",
  "\"Then I'm staying,\" you say.",
  "Liam looks at you like he can't quite believe it.",
  "The change doesn't hurt the way you thought it would.",
  "The Den's warmth spreads through you, patient and old and strange.",
  "The exit tunnel groans shut behind you, sealing the surface away for good.",
  "Liam takes your hand - or what's becoming your hand.",
  "Whatever you are now, you're not alone down here anymore."
];

/* ------------------------------------------------------------------ *
 *  9. GAME CLASS
 * ------------------------------------------------------------------ */
class Game{
  constructor(){
    this.save=SaveSystem.load();
    this.state='title'; // title, playing, paused, cutscene, map, shop, dead, choice, credits
    this.clock=new THREE.Clock();
    this.keys={};
    this.mouseDown=false;
    this.pointerLocked=false;
    this.yaw=0; this.pitch=0;
    this.sensitivity=this.save.settings.sensitivity/1000;
    this.touch={move:{x:0,y:0,active:false,id:null}, look:{x:0,y:0,active:false,id:null,lastX:0,lastY:0}};
    this.gamepadIndex=null;
    this.isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints>0;

    this.player={
      pos:new THREE.Vector3(0,1.7,0),
      vel:new THREE.Vector3(),
      hp:100, maxHp:100,
      onGround:true, crouching:false, sprinting:false,
      height:1.7, crouchHeight:1.1,
      jumpVel:0,
      radius:0.35,
      currency:this.save.currency||0,
      keys:0,
      invuln:0,
    };
    this.weaponState={
      current:'pistol',
      unlocked:new Set(this.save.unlockedWeapons||['pistol']),
      ammo:{pistol:WEAPONS.pistol.clip, shotgun:0, raygun:0},
      reserve:{pistol:Infinity, shotgun:WEAPONS.shotgun.reserve, raygun:WEAPONS.raygun.reserve},
      reloading:false, reloadT:0, fireCooldown:0, bobT:0, recoil:0,
    };
    this.levelIndex=this.save.levelIndex||0;
    this.currentLevel=null;
    this.enemies=[];
    this.projectiles=[];
    this.pickups=[];
    this.doors=[];
    this.particles=[];
    this.exitTrigger=null;
    this.boss=null;
    this.mapRevealed=null;
    this.grid=null;
    this.gridSize=0;
    this.deathY=-50;
    this.checkpoint=null;
    this.paused=false;
    this.choiceMade=null;

    this._initThree();
    this._initUI();
    this._initInput();
    buildTextures();
    this._buildWeaponViewmodel();
    window.addEventListener('resize',()=>this._onResize());
    requestAnimationFrame(()=>this._loop());
  }

  /* ---------------- THREE SETUP ---------------- */
  _initThree(){
    const canvas=document.getElementById('game-canvas');
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setSize(innerWidth,innerHeight);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(this.save.settings.fov||88, innerWidth/innerHeight, 0.05, 200);
    this.cameraRig=new THREE.Group(); this.cameraRig.add(this.camera); this.scene.add(this.cameraRig);
    this.weaponCam=new THREE.PerspectiveCamera(this.save.settings.fov||88, innerWidth/innerHeight,0.01,10);

    this.ambientLight=new THREE.AmbientLight(0x3a4a3a,0.6);
    this.scene.add(this.ambientLight);
    this.playerLight=new THREE.PointLight(0xbfe8b0,1.1,14,2);
    this.camera.add(this.playerLight);
    this.hemi=new THREE.HemisphereLight(0x445544,0x0a0a08,0.4);
    this.scene.add(this.hemi);

    this.levelGroup=new THREE.Group(); this.scene.add(this.levelGroup);
    this.dynGroup=new THREE.Group(); this.scene.add(this.dynGroup);
  }
  _onResize(){
    this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix();
    this.weaponCam.aspect=innerWidth/innerHeight; this.weaponCam.updateProjectionMatrix();
    this.renderer.setSize(innerWidth,innerHeight);
  }

  /* ---------------- WEAPON VIEWMODEL (original stylized designs) ---------------- */
  _buildWeaponViewmodel(){
    this.viewmodels={};
    const mk=(group)=>{ group.position.set(0.35,-0.32,-0.6); this.camera.add(group); group.visible=false; return group; };

    // Pistol: blocky slide + grip
    const pistol=new THREE.Group();
    const pBody=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.12,0.32), new THREE.MeshStandardMaterial({color:0x8a9a8a,metalness:0.6,roughness:0.4}));
    pBody.position.set(0,0,0); pistol.add(pBody);
    const pGrip=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.16,0.09), new THREE.MeshStandardMaterial({color:0x2a2a2a}));
    pGrip.position.set(0,-0.13,0.1); pGrip.rotation.x=0.25; pistol.add(pGrip);
    const pBarrel=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.12,8), new THREE.MeshStandardMaterial({color:0x333,metalness:0.8}));
    pBarrel.rotation.x=Math.PI/2; pBarrel.position.set(0,0.01,-0.22); pistol.add(pBarrel);
    this.viewmodels.pistol=mk(pistol);

    // Shotgun: double barrel + pump
    const shotgun=new THREE.Group();
    const sBody=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.55), new THREE.MeshStandardMaterial({color:0x6b4a2a,roughness:0.7}));
    shotgun.add(sBody);
    const sBarrels=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.4,8), new THREE.MeshStandardMaterial({color:0x222,metalness:0.7}));
    sBarrels.rotation.x=Math.PI/2; sBarrels.position.set(0,0.02,-0.45); shotgun.add(sBarrels);
    const sPump=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.07,0.16), new THREE.MeshStandardMaterial({color:0x3a2a1a}));
    sPump.position.set(0,-0.04,-0.28); shotgun.add(sPump);
    const sGrip=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.18,0.09), new THREE.MeshStandardMaterial({color:0x2a2a2a}));
    sGrip.position.set(0,-0.15,0.18); sGrip.rotation.x=0.3; shotgun.add(sGrip);
    this.viewmodels.shotgun=mk(shotgun);

    // Ray gun: glowing crystal core
    const raygun=new THREE.Group();
    const rBody=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,0.4,6), new THREE.MeshStandardMaterial({color:0x2a3a4a,metalness:0.7,roughness:0.3}));
    rBody.rotation.x=Math.PI/2; raygun.add(rBody);
    const rCore=new THREE.Mesh(new THREE.IcosahedronGeometry(0.06,0), new THREE.MeshStandardMaterial({color:0x6bc5ff,emissive:0x2a7aff,emissiveIntensity:1.4}));
    rCore.position.set(0,0.03,-0.05); raygun.add(rCore); this._raygunCore=rCore;
    const rGrip=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.17,0.09), new THREE.MeshStandardMaterial({color:0x1a1a1a}));
    rGrip.position.set(0,-0.14,0.14); rGrip.rotation.x=0.25; raygun.add(rGrip);
    const rLight=new THREE.PointLight(0x6bc5ff,0.8,1.2); rCore.add(rLight);
    this.viewmodels.raygun=mk(raygun);

    this.muzzleFlash=new THREE.PointLight(0xfff2bb,0,4);
    this.camera.add(this.muzzleFlash);
  }

  /* ---------------- UI WIRING ---------------- */
  _initUI(){
    const $=id=>document.getElementById(id);
    this.ui={
      title:$('title-screen'), howto:$('howto-screen'), settings:$('settings-screen'),
      confirm:$('confirm-dialog'), hud:$('hud'), map:$('map-overlay'), pause:$('pause-screen'),
      shop:$('shop-screen'), cutscene:$('cutscene-screen'), choice:$('choice-screen'),
      death:$('death-screen'), credits:$('credits-screen'), touch:$('touch-controls'),
      loading:$('loading-screen'),
      hpVal:$('hp-val'), currencyVal:$('currency-val'), weaponName:$('weapon-name'), ammoVal:$('ammo-val'),
      reloadInd:$('reload-indicator'), levelName:$('level-name'), objectiveText:$('objective-text'),
      keyIcons:$('key-icons'), bossBarWrap:$('boss-bar-wrap'), bossName:$('boss-name'), bossBarFill:$('boss-bar-fill'),
      hitMarker:$('hit-marker'), damageFlash:$('damage-flash'), pickupToast:$('pickup-toast'), interactPrompt:$('interact-prompt'),
      mapCanvas:$('map-canvas'), mapTitle:$('map-title'), shopGrid:$('shop-grid'), shopCurrency:$('shop-currency-val'),
      cutsceneText:$('cutscene-text'),
    };
    $('btn-new-game').onclick=()=>{ AUDIO.init(); AUDIO.uiClick(); this._confirmIfSave(()=>this.startNewGame()); };
    $('btn-continue').onclick=()=>{ AUDIO.init(); AUDIO.uiClick(); this.continueGame(); };
    $('btn-continue').style.opacity=this.save.exists?1:0.4;
    $('btn-how-to-play').onclick=()=>{AUDIO.init();AUDIO.uiClick(); this._show('howto');};
    $('btn-howto-back').onclick=()=>{AUDIO.uiClick(); this._show('title');};
    $('btn-settings').onclick=()=>{AUDIO.init();AUDIO.uiClick(); this._openSettings(false);};
    $('btn-settings-back').onclick=()=>{AUDIO.uiClick(); this._closeSettings();};
    $('btn-pause-settings').onclick=()=>{AUDIO.uiClick(); this._openSettings(true);};
    $('btn-reset-save').onclick=()=>{ this._confirm('Delete all save data? This cannot be undone.',()=>{ SaveSystem.reset(); location.reload(); }); };
    $('btn-resume').onclick=()=>{AUDIO.uiClick(); this._resume();};
    $('btn-quit-title').onclick=()=>{ this._confirm('Quit to title? Unsaved progress in this level will be lost.',()=>{ this._quitToTitle(); }); };
    $('btn-respawn').onclick=()=>{AUDIO.uiClick(); this._respawn();};
    $('btn-death-title').onclick=()=>{ this._quitToTitle(); };
    $('btn-map-close').onclick=()=>{AUDIO.uiClick(); this._closeMap();};
    $('btn-shop-close').onclick=()=>{AUDIO.uiClick(); this._closeShop();};
    $('btn-cutscene-skip').onclick=()=>{AUDIO.uiClick(); this._skipCutscene();};
    $('btn-choice-escape').onclick=()=>this._resolveChoice('escape');
    $('btn-choice-stay').onclick=()=>this._resolveChoice('stay');
    $('btn-credits-title').onclick=()=>{ location.reload(); };

    $('sens-slider').value=this.save.settings.sensitivity;
    $('music-toggle').checked=this.save.settings.music;
    $('sfx-toggle').checked=this.save.settings.sfx;
    $('mute-toggle').checked=this.save.settings.mute;
    $('fov-slider').value=this.save.settings.fov;
    $('sens-slider').oninput=e=>{ this.save.settings.sensitivity=+e.target.value; this.sensitivity=this.save.settings.sensitivity/1000; this._persist(); };
    $('music-toggle').onchange=e=>{ this.save.settings.music=e.target.checked; AUDIO.setMusic(e.target.checked); this._persist(); };
    $('sfx-toggle').onchange=e=>{ this.save.settings.sfx=e.target.checked; AUDIO.setSfx(e.target.checked); this._persist(); };
    $('mute-toggle').onchange=e=>{ this.save.settings.mute=e.target.checked; AUDIO.setMute(e.target.checked); this._persist(); };
    $('fov-slider').oninput=e=>{ this.save.settings.fov=+e.target.value; this.camera.fov=+e.target.value; this.camera.updateProjectionMatrix(); this.weaponCam.fov=+e.target.value; this.weaponCam.updateProjectionMatrix(); this._persist(); };

    this._settingsReturnTo='title';
    this._confirmCb=null;
    $('confirm-yes').onclick=()=>{ this._show(null,'confirm'); if(this._confirmCb) this._confirmCb(); };
    $('confirm-no').onclick=()=>{ this._show(null,'confirm'); };

    if(this.isTouchDevice) this.ui.touch.classList.remove('hidden');
  }
  _persist(){ this.save.currency=this.player.currency; this.save.levelIndex=this.levelIndex; this.save.unlockedWeapons=[...this.weaponState.unlocked]; SaveSystem.save(this.save); }
  _confirm(text,cb){ document.getElementById('confirm-text').textContent=text; this._confirmCb=cb; this.ui.confirm.classList.remove('hidden'); }
  _confirmIfSave(cb){ if(this.save.exists && (this.save.levelIndex>0||this.save.currency>0)) this._confirm('Starting a new game will overwrite your existing save. Continue?',cb); else cb(); }
  _show(id){ ['title','howto','settings'].forEach(k=>this.ui[k].classList.add('hidden')); if(id) this.ui[id].classList.remove('hidden'); }
  _openSettings(fromPause){ this._settingsReturnTo=fromPause?'pause':'title'; if(fromPause) this.ui.pause.classList.add('hidden'); this.ui.settings.classList.remove('hidden'); }
  _closeSettings(){ this.ui.settings.classList.add('hidden'); if(this._settingsReturnTo==='pause') this.ui.pause.classList.remove('hidden'); }

  /* ---------------- INPUT ---------------- */
  _initInput(){
    window.addEventListener('keydown',e=>{
      this.keys[e.code]=true;
      if(e.code==='Escape'){ if(this.state==='playing') this._pause(); else if(this.state==='paused') this._resume(); }
      if(this.state!=='playing') return;
      if(e.code==='KeyM') this._toggleMap();
      if(e.code==='KeyR') this._reload();
      if(e.code==='KeyE') this._interact();
      if(e.code==='Digit1') this._switchWeapon('pistol');
      if(e.code==='Digit2') this._switchWeapon('shotgun');
      if(e.code==='Digit3') this._switchWeapon('raygun');
      if(e.code==='Space') this._tryJump();
    });
    window.addEventListener('keyup',e=>{ this.keys[e.code]=false; });

    const canvas=document.getElementById('game-canvas');
    canvas.addEventListener('click',()=>{ if(this.state==='playing' && !this.isTouchDevice) canvas.requestPointerLock(); });
    document.addEventListener('pointerlockchange',()=>{ this.pointerLocked=document.pointerLockElement===canvas; });
    document.addEventListener('mousemove',e=>{
      if(!this.pointerLocked||this.state!=='playing') return;
      this.yaw -= e.movementX*this.sensitivity;
      this.pitch -= e.movementY*this.sensitivity;
      this.pitch=clamp(this.pitch,-Math.PI/2+0.05,Math.PI/2-0.05);
    });
    document.addEventListener('mousedown',e=>{ if(e.button===0 && this.state==='playing') this.mouseDown=true; });
    document.addEventListener('mouseup',e=>{ if(e.button===0) this.mouseDown=false; });

    // touch controls
    const moveZone=document.getElementById('touch-move-zone');
    const lookZone=document.getElementById('touch-look-zone');
    const stick=document.getElementById('touch-move-stick');
    moveZone.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; this.touch.move={active:true,id:t.identifier,startX:t.clientX,startY:t.clientY,x:0,y:0}; },{passive:true});
    moveZone.addEventListener('touchmove',e=>{
      for(const t of e.changedTouches){ if(t.identifier===this.touch.move.id){
        let dx=t.clientX-this.touch.move.startX, dy=t.clientY-this.touch.move.startY;
        const mag=Math.hypot(dx,dy), max=50;
        if(mag>max){ dx=dx/mag*max; dy=dy/mag*max; }
        this.touch.move.x=dx/max; this.touch.move.y=dy/max;
        stick.style.transform=`translate(${dx}px,${dy}px)`;
      }}
    },{passive:true});
    const endMove=e=>{ for(const t of e.changedTouches){ if(t.identifier===this.touch.move.id){ this.touch.move={active:false,id:null,x:0,y:0}; stick.style.transform='translate(0,0)'; } } };
    moveZone.addEventListener('touchend',endMove); moveZone.addEventListener('touchcancel',endMove);

    lookZone.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; this.touch.look={active:true,id:t.identifier,lastX:t.clientX,lastY:t.clientY}; },{passive:true});
    lookZone.addEventListener('touchmove',e=>{
      for(const t of e.changedTouches){ if(t.identifier===this.touch.look.id){
        const dx=t.clientX-this.touch.look.lastX, dy=t.clientY-this.touch.look.lastY;
        this.yaw -= dx*this.sensitivity*2.2; this.pitch -= dy*this.sensitivity*2.2;
        this.pitch=clamp(this.pitch,-Math.PI/2+0.05,Math.PI/2-0.05);
        this.touch.look.lastX=t.clientX; this.touch.look.lastY=t.clientY;
      }}
    },{passive:true});
    const endLook=e=>{ for(const t of e.changedTouches){ if(t.identifier===this.touch.look.id) this.touch.look.active=false; } };
    lookZone.addEventListener('touchend',endLook); lookZone.addEventListener('touchcancel',endLook);

    const bind=(id,down,up)=>{ const el=document.getElementById(id);
      el.addEventListener('touchstart',e=>{e.preventDefault(); down();},{passive:false});
      if(up) el.addEventListener('touchend',e=>{e.preventDefault(); up();},{passive:false});
    };
    bind('touch-fire',()=>this.mouseDown=true,()=>this.mouseDown=false);
    bind('touch-jump',()=>this._tryJump());
    bind('touch-crouch',()=>{ this.player.crouching=!this.player.crouching; });
    bind('touch-reload',()=>this._reload());
    bind('touch-switch',()=>this._cycleWeapon());
    bind('touch-interact',()=>this._interact());
    bind('touch-map',()=>this._toggleMap());
    bind('touch-pause',()=>{ if(this.state==='playing') this._pause(); else if(this.state==='paused') this._resume(); });

    window.addEventListener('gamepadconnected',e=>{ this.gamepadIndex=e.gamepad.index; });
    window.addEventListener('gamepaddisconnected',()=>{ this.gamepadIndex=null; });
  }
  _pollGamepad(dt){
    if(this.gamepadIndex===null) return {mx:0,my:0,lx:0,ly:0,shoot:false,jump:false,reload:false,switchW:false,interact:false};
    const gp=navigator.getGamepads()[this.gamepadIndex];
    if(!gp) return {mx:0,my:0,lx:0,ly:0,shoot:false,jump:false,reload:false,switchW:false,interact:false};
    const dz=v=>Math.abs(v)<0.18?0:v;
    const lx=dz(gp.axes[0]||0), ly=dz(gp.axes[1]||0);
    const rx=dz(gp.axes[2]||0), ry=dz(gp.axes[3]||0);
    this.yaw -= rx*dt*2.6; this.pitch -= ry*dt*2.0;
    this.pitch=clamp(this.pitch,-Math.PI/2+0.05,Math.PI/2-0.05);
    const shoot=(gp.buttons[7]&&gp.buttons[7].pressed);
    if(gp.buttons[2]&&gp.buttons[2].pressed && !this._gpReloadLatch){ this._reload(); this._gpReloadLatch=true; } else if(!(gp.buttons[2]&&gp.buttons[2].pressed)) this._gpReloadLatch=false;
    if(gp.buttons[3]&&gp.buttons[3].pressed && !this._gpSwitchLatch){ this._cycleWeapon(); this._gpSwitchLatch=true; } else if(!(gp.buttons[3]&&gp.buttons[3].pressed)) this._gpSwitchLatch=false;
    if(gp.buttons[1]&&gp.buttons[1].pressed && !this._gpInteractLatch){ this._interact(); this._gpInteractLatch=true; } else if(!(gp.buttons[1]&&gp.buttons[1].pressed)) this._gpInteractLatch=false;
    if(gp.buttons[0]&&gp.buttons[0].pressed && !this._gpJumpLatch){ this._tryJump(); this._gpJumpLatch=true; } else if(!(gp.buttons[0]&&gp.buttons[0].pressed)) this._gpJumpLatch=false;
    if(gp.buttons[9]&&gp.buttons[9].pressed && !this._gpPauseLatch){ if(this.state==='playing') this._pause(); else if(this.state==='paused') this._resume(); this._gpPauseLatch=true; } else if(!(gp.buttons[9]&&gp.buttons[9].pressed)) this._gpPauseLatch=false;
    if(gp.buttons[8]&&gp.buttons[8].pressed && !this._gpMapLatch){ this._toggleMap(); this._gpMapLatch=true; } else if(!(gp.buttons[8]&&gp.buttons[8].pressed)) this._gpMapLatch=false;
    this.gamepadShooting = !!shoot;
    return {lx,ly,shoot};
  }

  /* ---------------- GAME FLOW ---------------- */
  startNewGame(){
    this.save=SaveSystem.default(); this.save.exists=true;
    this.player.currency=0; this.player.hp=100;
    this.weaponState.unlocked=new Set(['pistol']);
    this.weaponState.reserve={pistol:Infinity,shotgun:0,raygun:0};
    this.weaponState.ammo={pistol:WEAPONS.pistol.clip,shotgun:0,raygun:0};
    this.levelIndex=0;
    this._persist();
    this._loadLevel(0,true);
  }
  continueGame(){
    if(!this.save.exists){ this.startNewGame(); return; }
    this.player.currency=this.save.currency||0;
    this.weaponState.unlocked=new Set(this.save.unlockedWeapons||['pistol']);
    for(const w of this.weaponState.unlocked){ if(w!=='pistol') this.weaponState.reserve[w]=WEAPONS[w].reserve; }
    this.levelIndex=this.save.levelIndex||0;
    this._loadLevel(this.levelIndex,true);
  }
  _quitToTitle(){
    this.state='title'; AUDIO.stopMusic();
    this.ui.pause.classList.add('hidden'); this.ui.death.classList.add('hidden'); this.ui.confirm.classList.add('hidden');
    this.ui.hud.classList.add('hidden'); this.ui.touch.classList.add('hidden');
    if(document.exitPointerLock) document.exitPointerLock();
    document.getElementById('btn-continue').style.opacity=this.save.exists?1:0.4;
    this._show('title');
  }
  _pause(){ if(this.state!=='playing') return; this.state='paused'; this.ui.pause.classList.remove('hidden'); if(document.exitPointerLock) document.exitPointerLock(); }
  _resume(){ this.state='playing'; this.ui.pause.classList.add('hidden'); this.ui.settings.classList.add('hidden'); }

  _loadLevel(index,freshEntry){
    this.ui.loading.classList.remove('hidden');
    setTimeout(()=>this._buildLevel(index,freshEntry),20);
  }
  _buildLevel(index,freshEntry){
    // clear
    while(this.levelGroup.children.length) this.levelGroup.remove(this.levelGroup.children[0]);
    while(this.dynGroup.children.length) this.dynGroup.remove(this.dynGroup.children[0]);
    this.enemies=[]; this.projectiles=[]; this.pickups=[]; this.doors=[]; this.particles=[]; this.boss=null; this.exitTrigger=null;

    const def=LEVELS[index]; this.currentLevel=def;
    const rng=mulberry32(index*10007+42);
    const size=def.size;
    const grid=generateMaze(size,rng);
    // carve an arena near center for boss levels / open combat
    if(def.bossType) carveRoom(grid, Math.floor(size/2), Math.floor(size/2), 3);
    else carveRoom(grid, Math.floor(size/2), Math.floor(size/2), 2);
    this.grid=grid; this.gridSize=size;
    this.mapRevealed=[]; for(let y=0;y<size;y++) this.mapRevealed.push(new Array(size).fill(false));

    const cells=floorCells(grid);
    const startCell=cells[0];
    const farCell=cells.reduce((best,c)=>{
      const d=dist2(c[0],c[1],startCell[0],startCell[1]);
      return d>best.d?{c,d}:best;
    },{c:startCell,d:-1}).c;

    this.scene.fog=new THREE.Fog(def.fog, 6, 34);
    this.scene.background=new THREE.Color(def.fog);

    // geometry
    const wallTex=TEXTURES[def.wallTex].clone(); wallTex.needsUpdate=true; wallTex.repeat.set(1,1);
    const floorTex=TEXTURES[def.floorTex].clone(); floorTex.needsUpdate=true; floorTex.repeat.set(1,1);
    const wallMat=new THREE.MeshStandardMaterial({map:wallTex,roughness:0.95});
    const floorMat=new THREE.MeshStandardMaterial({map:floorTex,roughness:1});
    const ceilMat=new THREE.MeshStandardMaterial({map:TEXTURES.ceiling,roughness:1});

    const wallGeo=new THREE.BoxGeometry(CELL,CELL*1.3,CELL);
    const wallMesh=new THREE.InstancedMesh(wallGeo,wallMat, size*size);
    let wi=0; const dummy=new THREE.Object3D();
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      if(grid[y][x]===1){
        dummy.position.set((x-size/2)*CELL, CELL*0.65, (y-size/2)*CELL);
        dummy.updateMatrix(); wallMesh.setMatrixAt(wi++,dummy.matrix);
      }
    }
    wallMesh.count=wi; wallMesh.castShadow=false; this.levelGroup.add(wallMesh);

    const floorGeo=new THREE.PlaneGeometry(size*CELL,size*CELL);
    floorTex.repeat.set(size,size);
    const floor=new THREE.Mesh(floorGeo,floorMat); floor.rotation.x=-Math.PI/2; floor.position.y=0; this.levelGroup.add(floor);
    const ceil=new THREE.Mesh(floorGeo.clone(),ceilMat); ceil.rotation.x=Math.PI/2; ceil.position.y=CELL*1.3; this.levelGroup.add(ceil);

    // world offset helpers
    this.worldOffset=size/2;
    const cellToWorld=(cx,cy)=>new THREE.Vector3((cx-this.worldOffset)*CELL,0,(cy-this.worldOffset)*CELL);
    this.cellToWorld=cellToWorld;
    this.worldToCell=(x,z)=>[Math.round(x/CELL+this.worldOffset), Math.round(z/CELL+this.worldOffset)];

    // place player
    const spawnPos=cellToWorld(startCell[0],startCell[1]);
    this.player.pos.set(spawnPos.x,1.7,spawnPos.z);
    this.player.vel.set(0,0,0);
    this.player.hp=this.player.hp<=0?100:this.player.hp;
    this.checkpoint={pos:this.player.pos.clone(), hp:100};
    this.yaw=rng()*Math.PI*2; this.pitch=0;

    // exit
    const exitPos=cellToWorld(farCell[0],farCell[1]);
    const exitMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,2.4,10,1,true), new THREE.MeshBasicMaterial({color:0x7fff6b,transparent:true,opacity:0.35,side:THREE.DoubleSide}));
    exitMesh.position.set(exitPos.x,1.2,exitPos.z);
    this.levelGroup.add(exitMesh);
    this.exitTrigger={pos:exitMesh.position, mesh:exitMesh, radius:1.2};

    // key + door (skip on first level)
    const middleCells=cells.filter(c=>dist2(c[0],c[1],startCell[0],startCell[1])>4);
    if(index>0){
      const doorCell=choice(rng,middleCells);
      grid[doorCell[1]][doorCell[0]]=1; // temporarily block; door mesh sits here, opens on key
      const doorPos=cellToWorld(doorCell[0],doorCell[1]);
      const doorMesh=new THREE.Mesh(new THREE.BoxGeometry(CELL*0.9,CELL*1.1,0.5), new THREE.MeshStandardMaterial({map:TEXTURES.door}));
      doorMesh.position.set(doorPos.x,CELL*0.55,doorPos.z);
      this.levelGroup.add(doorMesh);
      this.doors.push({cell:doorCell,mesh:doorMesh,open:false});
      const keyCell=choice(rng,middleCells.filter(c=>c!==doorCell));
      this._spawnPickup('key',keyCell,rng);
    }

    // shop entrance marker (visual + trigger near a room cell) - functions as safe pickup-triggered shop zone
    if(def.hasShop){
      const shopCell=choice(rng,middleCells);
      const shopPos=cellToWorld(shopCell[0],shopCell[1]);
      const shopMesh=new THREE.Mesh(new THREE.TorusGeometry(0.7,0.12,8,20), new THREE.MeshStandardMaterial({color:0xe8d34a,emissive:0x664f10,emissiveIntensity:0.6}));
      shopMesh.position.set(shopPos.x,1.2,shopPos.z); shopMesh.rotation.x=Math.PI/2;
      this.levelGroup.add(shopMesh);
      this.shopTrigger={pos:shopMesh.position,mesh:shopMesh,radius:1.3};
    } else this.shopTrigger=null;

    // weapon unlock pickup
    if(def.unlockWeapon){
      const wCell=choice(rng,middleCells);
      this._spawnPickup('weapon:'+def.unlockWeapon,wCell,rng);
    }

    // scatter health / ammo / currency / secrets
    const pickupCells=middleCells.filter(()=>rng()<0.5);
    let n=0;
    for(const c of pickupCells){
      if(n>16) break;
      const roll=rng();
      if(roll<0.28) this._spawnPickup('health',c,rng);
      else if(roll<0.5 && this.weaponState.unlocked.has('shotgun')) this._spawnPickup('ammo:shotgun',c,rng);
      else if(roll<0.62 && this.weaponState.unlocked.has('raygun')) this._spawnPickup('ammo:raygun',c,rng);
      else if(roll<0.85) this._spawnPickup('currency',c,rng);
      else this._spawnPickup('secret',c,rng);
      n++;
    }

    // enemies
    const spawnableCells=middleCells.slice();
    const diffMul=1 + index*0.14;
    for(const [type,count] of Object.entries(def.enemies)){
      for(let i=0;i<count;i++){
        if(!spawnableCells.length) break;
        const idx=Math.floor(rng()*spawnableCells.length);
        const c=spawnableCells.splice(idx,1)[0];
        this._spawnEnemy(type,c,diffMul);
      }
    }

    // boss
    if(def.bossType){
      const bossCell=[Math.floor(size/2),Math.floor(size/2)];
      this._spawnBoss(def.bossType,bossCell,diffMul);
    }

    this.ui.levelName.textContent=def.name;
    this.ui.objectiveText.textContent=def.objective;
    this._updateKeyIcons();
    this.ui.loading.classList.add('hidden');

    AUDIO.startMusic(index);

    if(freshEntry){
      this._playCutscene(def.intro, ()=>{ this._enterPlay(); });
    } else {
      this._enterPlay();
    }
  }
  _enterPlay(){
    this.state='playing';
    this.ui.title.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    if(this.isTouchDevice) this.ui.touch.classList.remove('hidden');
    this._updateHUD();
  }

  _spawnPickup(kind,cell,rng){
    const pos=this.cellToWorld(cell[0],cell[1]);
    let mesh, color;
    if(kind==='key'){ color=0xcaa53d; mesh=new THREE.Mesh(new THREE.OctahedronGeometry(0.28,0), new THREE.MeshStandardMaterial({color,emissive:0x554010,emissiveIntensity:0.8})); }
    else if(kind==='health'){ color=0xff6b6b; mesh=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.34,0.34), new THREE.MeshStandardMaterial({color,emissive:0x551010,emissiveIntensity:0.6})); }
    else if(kind.startsWith('ammo')){ color=0xf0d060; mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.36,8), new THREE.MeshStandardMaterial({color,emissive:0x554400,emissiveIntensity:0.5})); }
    else if(kind==='currency'){ color=0x8fe0ff; mesh=new THREE.Mesh(new THREE.SphereGeometry(0.2,10,10), new THREE.MeshStandardMaterial({color,emissive:0x104455,emissiveIntensity:0.7})); }
    else if(kind==='secret'){ color=0xff9bff; mesh=new THREE.Mesh(new THREE.TetrahedronGeometry(0.32,0), new THREE.MeshStandardMaterial({color,emissive:0x551155,emissiveIntensity:0.9})); }
    else if(kind.startsWith('weapon')){ color=0x9fd0ff; mesh=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.2,0.7), new THREE.MeshStandardMaterial({color,emissive:0x113355,emissiveIntensity:0.6})); }
    mesh.position.set(pos.x, 0.9, pos.z);
    this.levelGroup.add(mesh);
    this.pickups.push({kind,mesh,taken:false,spin:rng?rng():Math.random(),cell});
  }
  _spawnEnemy(type,cell,diffMul){
    const def=ENEMY_TYPES[type];
    const pos=this.cellToWorld(cell[0],cell[1]);
    const geo=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color:def.color,roughness:0.8});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(def.radius,def.height*0.6,4,8) : new THREE.CylinderGeometry(def.radius,def.radius,def.height,8), bodyMat);
    body.position.y=def.height/2; geo.add(body);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.08,6,6), new THREE.MeshBasicMaterial({color:0xffe066}));
    eye.position.set(0,def.height*0.75,def.radius*0.8); geo.add(eye);
    geo.position.set(pos.x,0,pos.z);
    this.dynGroup.add(geo);
    this.enemies.push({
      type, def, mesh:geo, eye,
      pos:new THREE.Vector3(pos.x,0,pos.z), hp:def.hp*diffMul, maxHp:def.hp*diffMul,
      state:'idle', atkCd:rng_(), moveT:Math.random()*10, wanderTarget:null,
      dmg:def.dmg*Math.min(diffMul,1.6), speed:def.speed, alive:true,
      hitFlash:0, supportPulse:0,
    });
  }
  _spawnBoss(type,cell,diffMul){
    const def=BOSS_TYPES[type];
    const pos=this.cellToWorld(cell[0],cell[1]);
    const geo=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color:def.color,roughness:0.7,emissive:def.color,emissiveIntensity:0.15});
    const body=new THREE.Mesh(new THREE.CylinderGeometry(def.radius,def.radius*1.2,def.height,10), bodyMat);
    body.position.y=def.height/2; geo.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(def.radius*0.7,10,10), bodyMat);
    head.position.y=def.height*0.95; geo.add(head);
    const eyeL=new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), new THREE.MeshBasicMaterial({color:0xff3b3b}));
    eyeL.position.set(-0.2,def.height*0.98,def.radius*0.6); geo.add(eyeL);
    const eyeR=eyeL.clone(); eyeR.position.x=0.2; geo.add(eyeR);
    geo.position.set(pos.x,0,pos.z);
    this.dynGroup.add(geo);
    this.boss={
      type, def, mesh:geo, pos:new THREE.Vector3(pos.x,0,pos.z),
      hp:def.hp*(1+diffMul*0.35), maxHp:def.hp*(1+diffMul*0.35),
      state:'dormant', phase:0, atkCd:1, alive:true, hitFlash:0,
      chargeT:0, tauntCd:6,
    };
    this.bossActivateRadius=9;
  }

  _updateKeyIcons(){
    this.ui.keyIcons.innerHTML='';
    for(let i=0;i<this.player.keys;i++){ const d=document.createElement('div'); d.className='key-icon'; this.ui.keyIcons.appendChild(d); }
  }

  /* ---------------- CUTSCENES ---------------- */
  _playCutscene(lines,onDone){
    this.state='cutscene';
    this._cutsceneLines=lines.slice(); this._cutsceneDone=onDone; this._cutsceneIdx=-1;
    this.ui.cutscene.classList.remove('hidden');
    this._nextCutsceneLine();
  }
  _nextCutsceneLine(){
    this._cutsceneIdx++;
    if(this._cutsceneIdx>=this._cutsceneLines.length){ this._endCutscene(); return; }
    this.ui.cutsceneText.textContent=this._cutsceneLines[this._cutsceneIdx];
    clearTimeout(this._cutsceneTimer);
    this._cutsceneTimer=setTimeout(()=>this._nextCutsceneLine(), 2600+this._cutsceneLines[this._cutsceneIdx].length*35);
  }
  _skipCutscene(){ clearTimeout(this._cutsceneTimer); this._endCutscene(); }
  _endCutscene(){
    this.ui.cutscene.classList.add('hidden');
    const cb=this._cutsceneDone; this._cutsceneDone=null;
    if(cb) cb(); else this.state='playing';
  }

  /* ---------------- WEAPON LOGIC ---------------- */
  _switchWeapon(name){
    if(!this.weaponState.unlocked.has(name) || this.weaponState.current===name || this.weaponState.reloading) return;
    this.weaponState.current=name;
    Object.keys(this.viewmodels).forEach(k=>this.viewmodels[k].visible=(k===name));
    this._updateHUD();
    AUDIO.uiClick();
  }
  _cycleWeapon(){
    const order=['pistol','shotgun','raygun'].filter(w=>this.weaponState.unlocked.has(w));
    const idx=order.indexOf(this.weaponState.current);
    this._switchWeapon(order[(idx+1)%order.length]);
  }
  _reload(){
    const ws=this.weaponState; const w=WEAPONS[ws.current];
    if(ws.reloading) return;
    if(ws.ammo[ws.current]>=w.clip) return;
    if(!w.infiniteReserve && ws.reserve[ws.current]<=0) return;
    ws.reloading=true; ws.reloadT=w.reloadTime;
    AUDIO.reload();
  }
  _tryShoot(){
    const ws=this.weaponState; const w=WEAPONS[ws.current];
    if(ws.reloading||ws.fireCooldown>0) return;
    if(ws.ammo[ws.current]<=0){ if(!ws.reloading){ this._reload(); } AUDIO.denied(); return; }
    ws.ammo[ws.current]--; ws.fireCooldown=w.fireRate; ws.recoil=1;
    this.muzzleFlash.intensity=3; this.muzzleFlash.color.set(w.color);
    AUDIO[w.sound]();
    // raycast pellets
    const dir=new THREE.Vector3();
    for(let p=0;p<w.pellets;p++){
      this.camera.getWorldDirection(dir);
      const spread=w.spread;
      const sdir=dir.clone();
      sdir.x+=(Math.random()-0.5)*spread; sdir.y+=(Math.random()-0.5)*spread; sdir.z+=(Math.random()-0.5)*spread;
      sdir.normalize();
      this._hitscan(sdir,w);
    }
    this._updateHUD();
  }
  _hitscan(dir,w){
    const origin=new THREE.Vector3(); this.camera.getWorldPosition(origin);
    const raycaster=new THREE.Raycaster(origin,dir,0.1,w.range);
    let hitEnemy=null, hitDist=Infinity;
    const all=[...this.enemies];
    if(this.boss&&this.boss.alive) all.push(this.boss);
    for(const e of all){
      if(!e.alive) continue;
      const ePos=e.pos.clone(); ePos.y+=e.def.height*0.5;
      const toE=ePos.clone().sub(origin);
      const proj=toE.dot(dir);
      if(proj<0||proj>w.range) continue;
      const closest=origin.clone().add(dir.clone().multiplyScalar(proj));
      const d=closest.distanceTo(ePos);
      if(d<e.def.radius+0.3 && proj<hitDist){
        // check wall occlusion along the way (coarse)
        if(!this._segmentBlocked(origin,closest)){ hitEnemy=e; hitDist=proj; }
      }
    }
    if(hitEnemy){
      this._damageEnemy(hitEnemy, w.damage);
      this._spawnHitFX(origin.clone().add(dir.clone().multiplyScalar(hitDist)));
      this._flashHitMarker();
    } else {
      // check wall hit for spark FX
      const hits=raycaster.intersectObjects(this.levelGroup.children,true);
      if(hits.length) this._spawnHitFX(hits[0].point,true);
    }
  }
  _segmentBlocked(a,b){
    const steps=8;
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const x=lerp(a.x,b.x,t), z=lerp(a.z,b.z,t);
      const [cx,cy]=this.worldToCell(x,z);
      if(cx<0||cy<0||cx>=this.gridSize||cy>=this.gridSize) continue;
      if(this.grid[cy] && this.grid[cy][cx]===1) return true;
    }
    return false;
  }
  _spawnHitFX(pos,spark){
    const mat=new THREE.SpriteMaterial({color:spark?0xffdd88:0xff6b6b, transparent:true, opacity:0.9});
    const spr=new THREE.Sprite(mat); spr.position.copy(pos); spr.scale.set(0.25,0.25,0.25);
    this.dynGroup.add(spr);
    this.particles.push({mesh:spr,life:0.25,maxLife:0.25,expand:true});
  }
  _flashHitMarker(){ this.ui.hitMarker.classList.remove('show'); void this.ui.hitMarker.offsetWidth; this.ui.hitMarker.classList.add('show'); AUDIO.hit(); }

  _damageEnemy(e,amount){
    e.hp-=amount; e.hitFlash=0.15;
    if(e.hp<=0){ this._killEnemy(e); } else AUDIO.enemyHurt();
    if(e===this.boss){ this._updateBossBar(); if(e.hp<=0) this._killBoss(); }
  }
  _killEnemy(e){
    e.alive=false; AUDIO.enemyDie();
    this.dynGroup.remove(e.mesh);
    this.player.currency+=Math.round(e.def.xp*(0.6+Math.random()*0.8));
    if(Math.random()<0.18) this._dropWorldPickup(e.pos,'health');
    else if(Math.random()<0.22) this._dropWorldPickup(e.pos, this.weaponState.unlocked.has('raygun')&&Math.random()<0.4?'ammo:raygun':'ammo:shotgun');
    this._updateHUD();
  }
  _dropWorldPickup(pos,kind){
    const cell=this.worldToCell(pos.x,pos.z);
    this._spawnPickup(kind,cell,()=>Math.random());
    const p=this.pickups[this.pickups.length-1];
    p.mesh.position.set(pos.x,0.9,pos.z);
  }
  _killBoss(){
    this.boss.alive=false;
    this.dynGroup.remove(this.boss.mesh);
    this.ui.bossBarWrap.classList.add('hidden');
    AUDIO.enemyDie();
    if(this.boss.type==='liam'){
      this._startLiamAftermath();
    } else {
      this.player.currency+=60;
      this._playCutscene(BOSS_VICTORY_LINES[this.boss.type]||['The creature falls.'], ()=>{ this.state='playing'; });
    }
  }

  /* ---------------- ENEMY AI ---------------- */
  _updateEnemies(dt){
    const pPos=this.player.pos;
    for(const e of this.enemies){
      if(!e.alive) continue;
      e.hitFlash=Math.max(0,e.hitFlash-dt);
      const toPlayer=new THREE.Vector3(pPos.x-e.pos.x,0,pPos.z-e.pos.z);
      const d=toPlayer.length();
      const los = d<12 && !this._segmentBlocked(new THREE.Vector3(e.pos.x,1,e.pos.z), new THREE.Vector3(pPos.x,1,pPos.z));
      if(los && d<10) e.state='chase'; else if(e.state==='chase' && !los) e.state='idle';

      if(e.def.support){
        // broodcaller: keeps distance, heals/buffs nearby enemies, flees player
        e.supportPulse-=dt;
        if(e.supportPulse<=0){
          e.supportPulse=2.5;
          for(const other of this.enemies){ if(other!==e && other.alive && other.pos.distanceTo(e.pos)<5){ other.hp=Math.min(other.maxHp, other.hp+6); } }
        }
        if(los && d<6){ toPlayer.normalize(); e.pos.addScaledVector(toPlayer,-e.speed*dt); }
        else if(los && d>7.5){ toPlayer.normalize(); e.pos.addScaledVector(toPlayer,e.speed*0.5*dt); }
      } else if(e.state==='chase'){
        toPlayer.normalize();
        const desired=toPlayer.clone().multiplyScalar(e.speed*dt);
        const next=e.pos.clone().add(desired);
        if(!this._circleBlocked(next.x,next.z,e.def.radius)) e.pos.copy(next); else {
          // simple wall slide
          const alt=new THREE.Vector3(-toPlayer.z,0,toPlayer.x).multiplyScalar(e.speed*dt*(Math.random()<0.5?1:-1));
          const next2=e.pos.clone().add(alt);
          if(!this._circleBlocked(next2.x,next2.z,e.def.radius)) e.pos.copy(next2);
        }
        e.mesh.rotation.y=Math.atan2(toPlayer.x,toPlayer.z);
        e.atkCd-=dt;
        if(e.def.ranged){
          if(d<e.def.atkRange && e.atkCd<=0 && los){ this._enemyRangedAttack(e); e.atkCd=e.def.atkCooldown; }
        } else {
          if(d<e.def.atkRange && e.atkCd<=0){ this._enemyMeleeAttack(e); e.atkCd=e.def.atkCooldown; }
        }
      } else {
        // idle wander
        e.moveT-=dt;
        if(e.moveT<=0 || !e.wanderTarget){
          e.moveT=2+Math.random()*3;
          const ang=Math.random()*Math.PI*2;
          e.wanderTarget=new THREE.Vector3(e.pos.x+Math.cos(ang)*2, 0, e.pos.z+Math.sin(ang)*2);
        }
        const toT=e.wanderTarget.clone().sub(e.pos); toT.y=0;
        if(toT.length()>0.2){
          toT.normalize();
          const next=e.pos.clone().addScaledVector(toT,e.speed*0.4*dt);
          if(!this._circleBlocked(next.x,next.z,e.def.radius)) e.pos.copy(next);
          e.mesh.rotation.y=Math.atan2(toT.x,toT.z);
        }
      }
      e.mesh.position.set(e.pos.x,0,e.pos.z);
      const m=e.mesh.children[0].material;
      if(e.hitFlash>0){ m.emissive=m.emissive||new THREE.Color(0); m.emissive.setHex(0xff0000); m.emissiveIntensity=0.8; }
      else { m.emissiveIntensity=0; }
    }
  }
  _circleBlocked(x,z,r){
    const pts=[[x+r,z],[x-r,z],[x,z+r],[x,z-r],[x,z]];
    for(const [px,pz] of pts){
      const [cx,cy]=this.worldToCell(px,pz);
      if(cx<0||cy<0||cx>=this.gridSize||cy>=this.gridSize) return true;
      if(this.grid[cy][cx]===1) return true;
    }
    return false;
  }
  _enemyMeleeAttack(e){
    if(this.player.invuln>0) return;
    this._damagePlayer(e.dmg);
    AUDIO.playerHurt();
  }
  _enemyRangedAttack(e){
    const dir=new THREE.Vector3(this.player.pos.x-e.pos.x,0,this.player.pos.z-e.pos.z).normalize();
    const proj=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8), new THREE.MeshBasicMaterial({color:0x8aff5a}));
    proj.position.set(e.pos.x, e.def.height*0.6, e.pos.z);
    this.dynGroup.add(proj);
    this.projectiles.push({mesh:proj,vel:dir.multiplyScalar(9),dmg:e.dmg,life:3,fromEnemy:true});
    AUDIO.tone(220,0.15,'sawtooth',0.15,140);
  }

  /* ---------------- BOSS AI ---------------- */
  _updateBoss(dt){
    const b=this.boss; if(!b||!b.alive) return;
    b.hitFlash=Math.max(0,b.hitFlash-dt);
    const pPos=this.player.pos;
    const toPlayer=new THREE.Vector3(pPos.x-b.pos.x,0,pPos.z-b.pos.z);
    const d=toPlayer.length();

    if(b.state==='dormant'){
      if(d<this.bossActivateRadius){
        b.state='intro';
        this.ui.bossBarWrap.classList.remove('hidden');
        this.ui.bossName.textContent=b.def.name;
        AUDIO.bossRoar();
        this._playCutscene(BOSS_INTRO_LINES[b.type], ()=>{ b.state='fight'; this.state='playing'; });
      }
      return;
    }
    if(b.state!=='fight') return;

    // phase check
    const hpRatio=b.hp/b.maxHp;
    const nextPhaseIdx=b.def.phaseAt.findIndex((th,i)=>i===b.phase && hpRatio<=th);
    if(nextPhaseIdx===b.phase){ b.phase++; AUDIO.bossRoar();
      if(b.def.spawnsMinions){
        for(let i=0;i<2;i++){
          const ang=Math.random()*Math.PI*2;
          const cell=this.worldToCell(b.pos.x+Math.cos(ang)*3,b.pos.z+Math.sin(ang)*3);
          this._spawnEnemy(choice(Math.random,['skitterling','spitter']),cell,1+this.levelIndex*0.1);
        }
      }
    }

    toPlayer.normalize();
    const speed=b.def.speed*(1+b.phase*0.18);
    const next=b.pos.clone().addScaledVector(toPlayer,speed*dt);
    if(!this._circleBlocked(next.x,next.z,b.def.radius)) b.pos.copy(next);
    b.mesh.position.set(b.pos.x,0,b.pos.z);
    b.mesh.rotation.y=Math.atan2(toPlayer.x,toPlayer.z);

    b.atkCd-=dt;
    if(d<b.def.radius+1.6 && b.atkCd<=0){
      if(this.player.invuln<=0) this._damagePlayer(b.def.dmgMelee);
      AUDIO.playerHurt();
      b.atkCd=1.1-b.phase*0.1;
    }
    // liam ranged lunge + taunts
    if(b.type==='liam'){
      b.tauntCd-=dt;
      if(b.tauntCd<=0 && Math.random()<0.5){
        b.tauntCd=7+Math.random()*4;
        this._toast(choice(Math.random,LIAM_TAUNTS));
      }
    }
    const m=b.mesh.children[0].material;
    m.emissiveIntensity = b.hitFlash>0? 0.9 : 0.15;
  }
  _updateBossBar(){ if(this.boss) this.ui.bossBarFill.style.width=Math.max(0,(this.boss.hp/this.boss.maxHp*100))+'%'; }
  _toast(text){
    this.ui.pickupToast.textContent=text;
    this.ui.pickupToast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer=setTimeout(()=>this.ui.pickupToast.classList.remove('show'),2200);
  }

  /* ---------------- LIAM ENDING FLOW ---------------- */
  _startLiamAftermath(){
    this.state='cutscene';
    this._playCutscene([
      "Liam collapses to his knees, breathing hard.",
      "\"...I knew you'd come,\" he says, almost gently.",
      "The chamber shudders. Rock dust falls from the ceiling.",
      "\"The Den's coming down. You need to go. Now.\""
    ], ()=>{ this._showChoice(); });
  }
  _showChoice(){
    this.state='choice';
    this.ui.choice.classList.remove('hidden');
  }
  _resolveChoice(which){
    AUDIO.uiClick();
    this.ui.choice.classList.add('hidden');
    this.choiceMade=which;
    const lines = which==='escape'?ENDING_ESCAPE_LINES:ENDING_STAY_LINES;
    this.state='cutscene';
    this._playCutscene(lines, ()=>this._showCredits(which));
  }
  _showCredits(which){
    this.state='credits';
    document.getElementById('ending-title').textContent = which==='escape' ? 'ENDING: ESCAPED' : 'ENDING: ONE OF THEM';
    document.getElementById('credits-text').textContent =
`ESCAPE FROM THE POSSUM DEN

A first-person adventure through 9 levels of
tunnels, laboratories, and old friendship.

This is not the canon ending -- just the one you chose.

Thank you for playing.`;
    this.ui.hud.classList.add('hidden'); this.ui.touch.classList.add('hidden');
    this.ui.credits.classList.remove('hidden');
    this.save.completedLevels=[...new Set([...(this.save.completedLevels||[]),this.levelIndex])];
    this.save.levelIndex=0; // finished the game; next New continues fresh, Continue restarts arc
    this._persist();
  }

  /* ---------------- PLAYER DAMAGE / DEATH ---------------- */
  _damagePlayer(amount){
    if(this.player.invuln>0) return;
    this.player.hp-=amount; this.player.invuln=0.4;
    this.ui.damageFlash.classList.add('show');
    clearTimeout(this._dmgFlashTimer);
    this._dmgFlashTimer=setTimeout(()=>this.ui.damageFlash.classList.remove('show'),150);
    this._updateHUD();
    if(this.player.hp<=0) this._die();
  }
  _die(){
    this.state='dead';
    this.ui.death.classList.remove('hidden');
    if(document.exitPointerLock) document.exitPointerLock();
    AUDIO.stopMusic();
  }
  _respawn(){
    this.ui.death.classList.add('hidden');
    this.player.hp=100;
    this.player.pos.copy(this.checkpoint.pos);
    this.player.vel.set(0,0,0);
    this.state='playing';
    AUDIO.startMusic(this.levelIndex);
    this._updateHUD();
  }

  /* ---------------- PICKUPS / DOORS / INTERACT ---------------- */
  _updatePickups(dt){
    for(const p of this.pickups){
      if(p.taken) continue;
      p.mesh.rotation.y+=dt*1.6;
      p.mesh.position.y=0.9+Math.sin(performance.now()*0.003+p.spin*10)*0.08;
      const d=p.mesh.position.distanceTo(this.player.pos);
      if(d<0.9){ this._takePickup(p); }
    }
  }
  _takePickup(p){
    p.taken=true; this.levelGroup.remove(p.mesh);
    AUDIO.pickup();
    if(p.kind==='key'){ this.player.keys++; this._updateKeyIcons(); this._toast('Key acquired'); }
    else if(p.kind==='health'){ this.player.hp=Math.min(this.player.maxHp,this.player.hp+30); this._toast('+30 Health'); }
    else if(p.kind==='ammo:shotgun'){ this.weaponState.reserve.shotgun=Math.min(60,this.weaponState.reserve.shotgun+12); this._toast('+12 Shotgun Ammo'); }
    else if(p.kind==='ammo:raygun'){ this.weaponState.reserve.raygun=Math.min(24,this.weaponState.reserve.raygun+4); this._toast('+4 Ray Gun Cells'); }
    else if(p.kind==='currency'){ this.player.currency+=8+Math.floor(Math.random()*10); this._toast('+Scrap'); }
    else if(p.kind==='secret'){ this.player.currency+=25; this._toast('Secret found! +25 Scrap'); }
    else if(p.kind.startsWith('weapon:')){
      const w=p.kind.split(':')[1];
      this.weaponState.unlocked.add(w);
      this.weaponState.reserve[w]=WEAPONS[w].reserve;
      this.weaponState.ammo[w]=WEAPONS[w].clip;
      this._switchWeapon(w);
      this._toast(WEAPONS[w].name+' acquired!');
    }
    this._updateHUD(); this._persist();
  }
  _interact(){
    if(this.state!=='playing') return;
    for(const d of this.doors){
      if(d.open) continue;
      const dist=d.mesh.position.distanceTo(this.player.pos);
      if(dist<2.2){
        if(this.player.keys>0){
          this.player.keys--; this._updateKeyIcons();
          d.open=true; this.grid[d.cell[1]][d.cell[0]]=0;
          this.levelGroup.remove(d.mesh);
          AUDIO.door(); this._toast('Door unlocked');
        } else { AUDIO.denied(); this._toast('Locked. Need a key.'); }
        return;
      }
    }
    if(this.shopTrigger){
      const dist=this.shopTrigger.pos.distanceTo(this.player.pos);
      if(dist<this.shopTrigger.radius+0.6){ this._openShop(); }
    }
  }
  _updateInteractPrompt(){
    let show=false;
    for(const d of this.doors){ if(!d.open && d.mesh.position.distanceTo(this.player.pos)<2.2){ show=true; break; } }
    if(!show && this.shopTrigger && this.shopTrigger.pos.distanceTo(this.player.pos)<this.shopTrigger.radius+0.6) show=true;
    this.ui.interactPrompt.classList.toggle('hidden',!show);
  }

  /* ---------------- SHOP ---------------- */
  _openShop(){
    this.state='shop';
    if(document.exitPointerLock) document.exitPointerLock();
    this.ui.shop.classList.remove('hidden');
    this._renderShop();
  }
  _closeShop(){ this.state='playing'; this.ui.shop.classList.add('hidden'); }
  _renderShop(){
    const items=[
      {id:'health',name:'Field Ration',desc:'+50 Health',price:15,fn:()=>{this.player.hp=Math.min(100,this.player.hp+50);}},
      {id:'shotgunammo',name:'Shotgun Shells',desc:'+16 Ammo',price:12,fn:()=>{this.weaponState.reserve.shotgun+=16;}, needs:'shotgun'},
      {id:'raygunammo',name:'Ray Cells',desc:'+6 Ammo',price:22,fn:()=>{this.weaponState.reserve.raygun+=6;}, needs:'raygun'},
      {id:'maxhp',name:'Reinforced Vest',desc:'+15 Max HP (this run)',price:40,fn:()=>{this.player.maxHp+=15; this.player.hp+=15;}},
    ];
    this.ui.shopCurrency.textContent=this.player.currency;
    this.ui.shopGrid.innerHTML='';
    for(const it of items){
      const locked = it.needs && !this.weaponState.unlocked.has(it.needs);
      const div=document.createElement('div');
      div.className='shop-item'+(locked||this.player.currency<it.price?' disabled':'');
      div.innerHTML=`<div class="name">${it.name}</div><div>${it.desc}</div><div class="price">${it.price} scrap</div>`;
      div.onclick=()=>{
        if(locked || this.player.currency<it.price) { AUDIO.denied(); return; }
        this.player.currency-=it.price; it.fn(); AUDIO.pickup();
        this._updateHUD(); this._persist(); this._renderShop();
      };
      this.ui.shopGrid.appendChild(div);
    }
  }

  /* ---------------- MAP ---------------- */
  _toggleMap(){ if(this.state==='playing') this._openMap(); else if(this.state==='map') this._closeMap(); }
  _openMap(){
    this.state='map'; this.ui.map.classList.remove('hidden');
    this.ui.mapTitle.textContent='MAP — '+this.currentLevel.name;
    this._drawMap();
  }
  _closeMap(){ this.state='playing'; this.ui.map.classList.add('hidden'); }
  _drawMap(){
    const c=this.ui.mapCanvas; const ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    const size=this.gridSize; const cell=c.width/size;
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      if(!this.mapRevealed[y][x]) continue;
      ctx.fillStyle = this.grid[y][x]===1 ? '#1c241c' : '#3a4a34';
      ctx.fillRect(x*cell,y*cell,cell,cell);
    }
    // exit
    if(this.exitTrigger){
      const [ex,ey]=this.worldToCell(this.exitTrigger.pos.x,this.exitTrigger.pos.z);
      if(this.mapRevealed[ey] && this.mapRevealed[ey][ex]){ ctx.fillStyle='#7fff6b'; ctx.fillRect(ex*cell,ey*cell,cell,cell); }
    }
    for(const d of this.doors){ if(!d.open){ const [dx,dy]=d.cell; if(this.mapRevealed[dy][dx]){ ctx.fillStyle='#caa53d'; ctx.fillRect(dx*cell,dy*cell,cell,cell); } } }
    for(const p of this.pickups){ if(p.kind==='secret' && !p.taken){ const [sx,sy]=this.worldToCell(p.mesh.position.x,p.mesh.position.z); if(this.mapRevealed[sy] && this.mapRevealed[sy][sx]){ ctx.fillStyle='#ff9bff'; ctx.fillRect(sx*cell,sy*cell,cell,cell); } } }
    // player
    const [px,py]=this.worldToCell(this.player.pos.x,this.player.pos.z);
    ctx.fillStyle='#6bc5ff';
    ctx.beginPath(); ctx.arc(px*cell+cell/2,py*cell+cell/2,cell*0.6,0,7); ctx.fill();
    const dirX=Math.sin(this.yaw), dirY=Math.cos(this.yaw);
    ctx.strokeStyle='#6bc5ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(px*cell+cell/2,py*cell+cell/2);
    ctx.lineTo(px*cell+cell/2+dirX*cell,py*cell+cell/2+dirY*cell); ctx.stroke();
  }
  _revealMap(){
    const [px,py]=this.worldToCell(this.player.pos.x,this.player.pos.z);
    const R=2;
    for(let y=py-R;y<=py+R;y++) for(let x=px-R;x<=px+R;x++){
      if(x>=0&&y>=0&&x<this.gridSize&&y<this.gridSize) this.mapRevealed[y][x]=true;
    }
  }

  /* ---------------- HUD ---------------- */
  _updateHUD(){
    this.ui.hpVal.textContent=Math.max(0,Math.round(this.player.hp));
    this.ui.currencyVal.textContent=this.player.currency;
    const ws=this.weaponState; const w=WEAPONS[ws.current];
    this.ui.weaponName.textContent=w.name;
    this.ui.ammoVal.textContent = w.infiniteReserve ? `${ws.ammo[ws.current]} / \u221E` : `${ws.ammo[ws.current]} / ${ws.reserve[ws.current]}`;
    this.ui.reloadInd.classList.toggle('hidden', !ws.reloading);
  }

  /* ---------------- MOVEMENT ---------------- */
  _tryJump(){
    if(this.state!=='playing') return;
    if(this.player.onGround){ this.player.jumpVel=5.4; this.player.onGround=false; AUDIO.jump(); }
  }
  _updatePlayer(dt,gpInput){
    const p=this.player;
    let mx=0, my=0;
    if(this.keys['KeyW']) my+=1; if(this.keys['KeyS']) my-=1;
    if(this.keys['KeyA']) mx-=1; if(this.keys['KeyD']) mx+=1;
    if(this.touch.move.active){ mx+=this.touch.move.x; my-=this.touch.move.y; }
    if(gpInput){ mx+=gpInput.lx; my-=gpInput.ly; }
    const mag=Math.hypot(mx,my); if(mag>1){ mx/=mag; my/=mag; }

    if(!this.isTouchDevice) p.crouching = !!(this.keys['ControlLeft']||this.keys['ControlRight']);
    p.sprinting=(this.keys['ShiftLeft']||this.keys['ShiftRight'])&&my>0 && !p.crouching;

    const speed = (p.crouching?1.6:(p.sprinting?5.4:3.2));
    const forward=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    const right=new THREE.Vector3(Math.sin(this.yaw+Math.PI/2),0,Math.cos(this.yaw+Math.PI/2));
    const moveDir=new THREE.Vector3().addScaledVector(forward,my).addScaledVector(right,mx);
    if(moveDir.length()>0.001) moveDir.normalize();

    const targetVel=moveDir.multiplyScalar(speed);
    p.vel.x=lerp(p.vel.x,targetVel.x, 1-Math.pow(0.001,dt));
    p.vel.z=lerp(p.vel.z,targetVel.z, 1-Math.pow(0.001,dt));

    // collision-aware move (slide)
    const nx=p.pos.x+p.vel.x*dt, nz=p.pos.z+p.vel.z*dt;
    if(!this._circleBlocked(nx,p.pos.z,p.radius)) p.pos.x=nx;
    if(!this._circleBlocked(p.pos.x,nz,p.radius)) p.pos.z=nz;

    // gravity / jump
    p.jumpVel-=18*dt;
    p.pos.y+=p.jumpVel*dt;
    const floorY=1.7-(p.crouching?0.5:0);
    if(p.pos.y<=floorY){ p.pos.y=floorY; if(!p.onGround && p.jumpVel<-2) AUDIO.land(); p.onGround=true; p.jumpVel=0; }
    else p.onGround=false;

    p.invuln=Math.max(0,p.invuln-dt);

    // camera
    this.camera.rotation.order='YXZ';
    this.cameraRig.position.set(p.pos.x,p.pos.y,p.pos.z);
    this.camera.rotation.y=this.yaw; this.camera.rotation.x=this.pitch;
    this.playerLight.intensity=1.1;

    // weapon bob + recoil
    const ws=this.weaponState;
    const moving=mag>0.05 && p.onGround;
    ws.bobT += dt*(moving?(p.sprinting?12:8):2);
    const vm=this.viewmodels[ws.current];
    if(vm){
      const bobX=Math.sin(ws.bobT)*(moving?0.02:0.004);
      const bobY=Math.abs(Math.cos(ws.bobT))*(moving?0.018:0.003);
      ws.recoil=lerp(ws.recoil,0,1-Math.pow(0.0005,dt));
      vm.position.set(0.35+bobX, -0.32+bobY+ws.recoil*0.05, -0.6+ws.recoil*0.08);
      vm.rotation.x=-ws.recoil*0.3;
    }
    this.muzzleFlash.intensity=lerp(this.muzzleFlash.intensity,0,1-Math.pow(0.0005,dt));

    // check exit
    if(this.exitTrigger){
      const d=Math.hypot(p.pos.x-this.exitTrigger.pos.x,p.pos.z-this.exitTrigger.pos.z);
      if(d<this.exitTrigger.radius+0.4 && !this.boss){ this._onReachExit(); }
      else if(d<this.exitTrigger.radius+0.4 && this.boss && !this.boss.alive){ this._onReachExit(); }
    }
    this._revealMap();
    this._updateInteractPrompt();
  }
  _onReachExit(){
    if(this._exiting) return; this._exiting=true;
    this.levelIndex++;
    this._persist();
    if(this.levelIndex>=TOTAL_LEVELS){
      // shouldn't normally hit (Liam ending handles final level) but guard anyway
      this._showCredits('escape');
    } else {
      this.state='cutscene';
      this.ui.cutsceneText.textContent='';
      setTimeout(()=>{ this._exiting=false; this._loadLevel(this.levelIndex,true); },200);
    }
  }

  /* ---------------- PROJECTILES / PARTICLES ---------------- */
  _updateProjectiles(dt){
    for(let i=this.projectiles.length-1;i>=0;i--){
      const pr=this.projectiles[i];
      pr.life-=dt;
      pr.mesh.position.addScaledVector(pr.vel,dt);
      if(pr.fromEnemy){
        const d=pr.mesh.position.distanceTo(this.player.pos);
        if(d<0.6){ this._damagePlayer(pr.dmg); this.dynGroup.remove(pr.mesh); this.projectiles.splice(i,1); continue; }
      }
      const [cx,cy]=this.worldToCell(pr.mesh.position.x,pr.mesh.position.z);
      if(cx<0||cy<0||cx>=this.gridSize||cy>=this.gridSize||this.grid[cy][cx]===1||pr.life<=0){
        this.dynGroup.remove(pr.mesh); this.projectiles.splice(i,1);
      }
    }
    for(let i=this.particles.length-1;i>=0;i--){
      const pt=this.particles[i]; pt.life-=dt;
      pt.mesh.material.opacity=Math.max(0,pt.life/pt.maxLife);
      if(pt.expand) pt.mesh.scale.multiplyScalar(1+dt*4);
      if(pt.life<=0){ this.dynGroup.remove(pt.mesh); this.particles.splice(i,1); }
    }
  }

  /* ---------------- MAIN LOOP ---------------- */
  _loop(){
    requestAnimationFrame(()=>this._loop());
    const dt=Math.min(this.clock.getDelta(),0.05);

    if(this.state==='playing'){
      const gpInput=this._pollGamepad(dt);
      this._updatePlayer(dt,gpInput);
      this._updateEnemies(dt);
      this._updateBoss(dt);
      this._updateProjectiles(dt);
      this._updatePickups(dt);
      const ws=this.weaponState;
      ws.fireCooldown=Math.max(0,ws.fireCooldown-dt);
      if(ws.reloading){
        ws.reloadT-=dt;
        if(ws.reloadT<=0){
          const w=WEAPONS[ws.current];
          if(w.infiniteReserve){ ws.ammo[ws.current]=w.clip; }
          else{
            const need=w.clip-ws.ammo[ws.current];
            const take=Math.min(need,ws.reserve[ws.current]);
            ws.ammo[ws.current]+=take; ws.reserve[ws.current]-=take;
          }
          ws.reloading=false; this._updateHUD();
        }
      }
      if(this.mouseDown || this.gamepadShooting) this._tryShoot();
    } else if(this.state==='map'){
      this._drawMap();
    } else {
      this._pollGamepad(dt); // allow pause navigation via controller in menus lightly
    }

    this.renderer.render(this.scene,this.camera);
  }
}
function rng_(){ return Math.random()*1.5; }

/* ------------------------------------------------------------------ *
 *  10. BOOT
 * ------------------------------------------------------------------ */
window.addEventListener('load',()=>{
  window.GAME=new Game();
});
