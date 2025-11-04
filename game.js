// Iberian Wolf Runner (no assets; pixel art & audio are JS only!)
const RES = { w: 320, h: 180 }, SCALE=2;
const FLOOR_Y = 136, GRAVITY = 0.58, JUMP_VEL = -8.2, DUCK_H=12, WOLF_W=24, WOLF_H=16;
const STATES = { MENU:0, PLAYING:1, PAUSED:2, GAMEOVER:3 };
const BG_LAYERS = 3, OBSTACLE_SPAWN_MIN=700, OBSTACLE_SPAWN_MAX=1500, INIT_SPEED=3, SPEED_INC_DIST=100;
let canvas, ctx, overlay, pauseBtn, muteBtn, audioCtx;
let state, wolf, ground, bgs, obstacles, dusts, score, hiScore, meters, lastHiScoreFlash, scoreFlashAlpha, nextObs, speed, speedFactor, worldX, randSeed, milestoneSoundPlayed, allowDuck, keys, input, mute;
let touchStartY = 0, pausedAt = 0, loopId = 0, fixedDt = 1/60, lastTime=0, acc=0;

function rand() { randSeed = (randSeed*9301+49297)%233280; return randSeed/233280; }
function rndi(a,b){ return Math.floor(rand()*(b-a+1))+a; }
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
function now(){ return performance.now(); }
function lerp(a,b,t){ return a+(b-a)*t; }

window.onload = function() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  overlay = document.getElementById("container");
  pauseBtn = document.getElementById("pauseBtn");
  muteBtn = document.getElementById("muteBtn");
  fitCanvas();
  hiScore = +(localStorage.getItem("wolfr_hi")||"0");
  setMute(false);
  setupInputs();
  resetGame();
  render();
  loopId = requestAnimationFrame(gameLoop);
};

function resetGame() {
  state = STATES.MENU;
  wolf = {
    x: 32, y: FLOOR_Y-WOLF_H, vy: 0, frame: 0, anim:0,
    duck: false, running: false, airborne: false, t: 0,
    jumpApex:false, runF: 0
  };
  ground = { x: 0 };
  bgs = [ {x:0},{x:0},{x:0} ];
  obstacles = [];
  dusts = [];
  meters = 0; speed = INIT_SPEED; speedFactor = 1; worldX = 0;
  score = 0; nextObs = 0; allowDuck = true; randSeed = Date.now() & 0xffff;
  milestoneSoundPlayed = false; lastHiScoreFlash = 0; scoreFlashAlpha = 0;
}
function startRun() { if (state!==STATES.MENU&&state!==STATES.GAMEOVER) return; resetGame(); state=STATES.PLAYING; }

function setupInputs() {
  document.addEventListener("keydown", (e)=>{
    if(e.repeat) return;
    if(state===STATES.MENU||state===STATES.GAMEOVER){
      if ([" ","ArrowUp"].includes(e.key)) return startRun();
    }
    switch(e.key){
      case " ": case "ArrowUp": input.jump = true; break;
      case "ArrowDown": input.duck = true; break;
      case "p": case "P": togglePause(); break;
      case "r": case "R": if(state===STATES.GAMEOVER) { resetGame(); state=STATES.MENU; render(); } break;
    }
  });
  document.addEventListener("keyup", (e)=>{
    if([" ","ArrowUp"].includes(e.key)){input.jump=false;}
    if(e.key==="ArrowDown"){input.duck=false;}
  });
  canvas.addEventListener("touchstart", e=>{
    let t = e.touches[0]; touchStartY = t.clientY;
    if (state===STATES.MENU || state===STATES.GAMEOVER) {startRun(); input.tap=false; return;}
    input.tap = true; input.swipeY = t.clientY;
  },{passive:true});
  canvas.addEventListener("touchend", e=>{
    let t = e.changedTouches[0];
    let dy = (t.clientY - touchStartY);
    if (state===STATES.PLAYING && Math.abs(dy)>30 && dy>0) {
      input.duck=true; setTimeout(()=>{input.duck=false;},180);
    } else { input.jump=false; input.duck=false; }
    input.tap=false; input.swipeY=null;
  });
  pauseBtn.onclick = ()=>togglePause();
  muteBtn.onclick = ()=>setMute(!mute);
}
function setMute(m) { mute=m; muteBtn.textContent = mute?"🔇":"🔊"; }
function togglePause() {
  if(state===STATES.PLAYING) { pausedAt=now(); state=STATES.PAUSED; pauseBtn.textContent="▶️"; render();
  } else if(state===STATES.PAUSED) { state=STATES.PLAYING; pauseBtn.textContent="⏸"; }
}
function gameLoop(ts) {
  loopId = requestAnimationFrame(gameLoop);
  if (lastTime===0) lastTime=ts;
  let dt = ts-lastTime; acc += dt;
  if(state===STATES.PAUSED){lastTime=ts; return;}
  while(acc>=fixedDt*1000){ tick(fixedDt); acc-=fixedDt*1000;}
  lastTime=ts;
  render();
}
function tick(dt) {
  if (state!==STATES.PLAYING) return;
  worldX += speed*speedFactor; meters += speed*speedFactor*dt*1.7;
  score = Math.floor(meters);
  if (score && score % SPEED_INC_DIST === 0) {
    if (!milestoneSoundPlayed) { sound_ping(); speed += 0.10; milestoneSoundPlayed = true; }
  } else { milestoneSoundPlayed = false; }
  speedFactor = (score && score%40 === 6) ? 1.15 : 1;
  nextObs -= speed*dt*70;
  if (nextObs<=0) { spawnObstacle(); nextObs = rndi(OBSTACLE_SPAWN_MIN, OBSTACLE_SPAWN_MAX)/speed; }
  wolf.t += dt;
  if (!wolf.airborne && ((input.jump && !wolf.duck)||input.tap)) {
    wolf.vy = JUMP_VEL; wolf.airborne=true; wolf.jumpApex=false; wolf.anim=0; sound_jump();
    allowDuck=false; setTimeout(()=>{allowDuck=true;},300);
  }
  if(wolf.airborne){ wolf.y+=wolf.vy; wolf.vy+=GRAVITY;
    if(wolf.vy>0&&!wolf.jumpApex){wolf.jumpApex=true;}
    if(wolf.y>=FLOOR_Y-WOLF_H){wolf.y=FLOOR_Y-WOLF_H; wolf.airborne=false; wolf.vy=0; wolf.jumpApex=false;}
  }
  wolf.duck=(!wolf.airborne&&allowDuck&&(input.duck||(input.swipeY!==null&&input.swipeY>0)));
  wolf.running=!wolf.airborne&&!wolf.duck;
  wolf.runF=wolf.running?((wolf.runF+speed*0.17)%3):0;
  if(!wolf.airborne&&wolf.running&&speed>4&&Math.floor(wolf.t*5)%2===0&&rand()>0.65){
    dusts.push({x:wolf.x+8,y:FLOOR_Y-2,t:0,f:rndi(0,1)});
  }
  dusts.forEach(d=>d.x-=speed); dusts=dusts.filter(d=>d.x>-6);
  obstacles.forEach(ob=>ob.x-=speed*speedFactor); obstacles=obstacles.filter(ob=>ob.x+ob.w>0);
  for(let i=0;i<BG_LAYERS;++i){bgs[i].x-=lerp(speed,speed*0.2,i/BG_LAYERS); bgs[i].x%=RES.w;}
  for (let ob of obstacles) {
    if (collidesWolf(ob)) {
      sound_thud(); state=STATES.GAMEOVER;
      if (score>hiScore) {
        hiScore=score; localStorage.setItem("wolfr_hi",hiScore); lastHiScoreFlash=now(); scoreFlashAlpha=1.0;
      }
    }
  }
}
const obstacleTypes = [
  {name:"stone",w:12,h:12, y:0, draw(drawX,drawY){drawStone(drawX,drawY);}},
  {name:"branch",w:22,h:8, y:-10, draw(drawX,drawY){drawBranch(drawX,drawY);}},
  {name:"shrub",w:13,h:9, y:0, draw(drawX,drawY){drawShrub(drawX,drawY);}},
  {name:"post",w:6,h:20, y:-5, draw(drawX,drawY){drawPost(drawX,drawY);}}
];
function spawnObstacle(){
  let t = clamp(Math.floor(rand()*obstacleTypes.length*(speed/10+0.5)),0,obstacleTypes.length-1);
  let spec=obstacleTypes[t];
  obstacles.push({...spec,x:RES.w+8,y:(spec.y?spec.y+FLOOR_Y-spec.h: FLOOR_Y-spec.h)});
}
function collidesWolf(ob){
  let wx=wolf.x, wy=wolf.y, wh=wolf.duck?DUCK_H:WOLF_H;
  let wolfRect={x:wx+2,y:wy+2,w:WOLF_W-4,h:wh-4}, obRect={x:ob.x+1,y:ob.y,w:ob.w-2,h:ob.h-1};
  if((wolfRect.x+wolfRect.w < obRect.x + 4) && (wolfRect.x+wolfRect.w+speed >= obRect.x+4)){ meters+=.37; sound_ping(); }
  return !(wolfRect.x > obRect.x+obRect.w || wolfRect.x+wolfRect.w < obRect.x ||
    wolfRect.y > obRect.y+obRect.h || wolfRect.y+wolfRect.h < obRect.y);
}
function render(){
  ctx.save();
  ctx.fillStyle=getDayShade(); ctx.fillRect(0,0,RES.w,RES.h);
  for(let i=BG_LAYERS-1;i>=0;--i) drawBG(i,(bgs[i].x)%RES.w);
  for(let i=0;i<20;++i) drawGround((ground.x+i*32)%RES.w,FLOOR_Y+WOLF_H-8);
  if(rand()>0.77) ctx.fillStyle="#979797", ctx.fillRect(rndi(24,RES.w-20),FLOOR_Y+WOLF_H-2, rndi(2,4), 1);
  for(let ob of obstacles) ob.draw(ob.x,ob.y);
  for(let d of dusts) drawDust(d.x,d.y+d.t*2,d.f), d.t+=0.3;
  drawWolf(wolf.x,wolf.y,wolf.running?wolf.runF:0,wolf.airborne,wolf.duck,state);
  drawWolfShadow(wolf.x+2,FLOOR_Y+WOLF_H-5);
  ctx.font = "bold 18px monospace"; ctx.textAlign="left";
  ctx.fillStyle=(!scoreFlashAlpha||!flashAnim(now()))?"#151515":"#fff";
  ctx.fillText(score+" m",8,22); ctx.globalAlpha=1;
  ctx.textAlign="right"; ctx.fillStyle="#888"; ctx.fillText("HI "+hiScore,RES.w-8,22);
  if (state===STATES.MENU) drawPrompt("Press Space or Tap to Run");
  else if(state===STATES.PAUSED) drawPrompt("Paused (P)");
  else if(state===STATES.GAMEOVER) drawPrompt("Game Over – R to retry");
  ctx.restore();
  pauseBtn.style.display = (state===STATES.PLAYING||state===STATES.PAUSED)?"block":"none";
  muteBtn.style.display="block"; muteBtn.style.zIndex=23;
}
function drawPrompt(txt){
  ctx.font="bold 18px monospace"; ctx.textAlign="center"; ctx.fillStyle="#fff";
  ctx.globalAlpha=0.92; ctx.fillRect(43,RES.h/2-20,235,30);
  ctx.globalAlpha=1.0; ctx.fillStyle="#111"; ctx.fillText(txt,RES.w/2,RES.h/2);
}
function flashAnim(nowMs){ if(scoreFlashAlpha>0) {ctx.globalAlpha=Math.sin(((nowMs-lastHiScoreFlash)/100)*Math.PI)*scoreFlashAlpha; return true;} return false; }
function getDayShade(){
  let t=(score/(120*2.3))%1.0;
  if (t<0.36) return "#bdbdbd";
  if (t<0.63) return "#888";
  return "#353535";
}
function fitCanvas(){
  let scale = Math.floor(Math.min(window.innerWidth/RES.w, window.innerHeight/RES.h));
  overlay.style.width = (RES.w*scale)+"px"; overlay.style.height = (RES.h*scale)+"px";
} window.addEventListener("resize", fitCanvas);

function drawWolf(X,Y,F,air,duck,state){
  // PIXEL WOLF (3-run, 2-jump, 2-duck, idle)
  ctx.save();
  if (state===STATES.MENU||state===STATES.GAMEOVER) { drawWolfIdle(X,Y); ctx.restore(); return; }
  if(air) drawWolfJump(X,Y,wolf.jumpApex);
  else if(duck) drawWolfDuck(X,Y,F);
  else drawWolfRun(X,Y,F);
  ctx.restore();
}
function drawWolfIdle(X,Y){
  // Stand: body
  ctx.fillStyle="#444"; ctx.fillRect(X+4,Y+6,14,7);
  ctx.fillStyle="#333"; ctx.fillRect(X+8,Y+10,9,3);
  ctx.fillStyle="#888"; ctx.fillRect(X+1,Y+4,16,5);
  ctx.fillStyle="#111"; ctx.fillRect(X+17,Y+7,5,3);
  // Head
  ctx.fillStyle="#bbb"; ctx.fillRect(X+15,Y+2,8,7);
  ctx.fillStyle="#343434"; ctx.fillRect(X+20,Y+4,3,2);
  // Ear
  ctx.fillRect(X+15,Y+2,2,3);
  ctx.fillStyle="#fff"; ctx.fillRect(X+19,Y+4,2,2);
  ctx.fillStyle="#111"; ctx.fillRect(X+23,Y+5,1,1);
}
function drawWolfRun(X,Y,F){
  // Simple 3-frame: F=0..2
  drawWolfIdle(X,Y);
  if(F<1) { // step front left
    ctx.fillStyle="#aaa"; ctx.fillRect(X+8,Y+11,6,3); 
    ctx.fillStyle="#666"; ctx.fillRect(X+5,Y+13,2,2);  
  }
  if(F>=1&&F<2){ // rear right
    ctx.fillStyle="#787878"; ctx.fillRect(X+16,Y+13,3,2); 
    ctx.fillStyle="#222"; ctx.fillRect(X+11,Y+14,3,2);   
  }
  if(F>=2){ // both raise
    ctx.fillStyle="#444"; ctx.fillRect(X+4,Y+12,2,2);
    ctx.fillStyle="#444"; ctx.fillRect(X+19,Y+12,2,2);
  }
}
function drawWolfJump(X,Y,apex){
  drawWolfIdle(X,Y-2);
  if(apex){
    ctx.fillStyle="#454545"; ctx.fillRect(X+8,Y+13,6,2);
    ctx.fillStyle="#777"; ctx.fillRect(X+17,Y+13,3,2);
  }else{
    ctx.fillStyle="#aaa"; ctx.fillRect(X+8,Y+11,6,2);
    ctx.fillStyle="#333"; ctx.fillRect(X+5,Y+13,4,2);
  }
}
function drawWolfDuck(X,Y,duckF){
  // Body squashed, head lower
  ctx.save(); ctx.translate(X,Y+4);
  ctx.fillStyle="#333"; ctx.fillRect(3,3,14,4);
  ctx.fillStyle="#999"; ctx.fillRect(0,1,15,5);
  ctx.fillStyle="#888"; ctx.fillRect(13,0,8,7);
  ctx.fillStyle="#444"; ctx.fillRect(16,5,4,1);
  ctx.fillStyle="#fff"; ctx.fillRect(17,2,2,2);
  ctx.fillStyle="#111"; ctx.fillRect(21,4,1,1);
  ctx.restore();
}
function drawWolfShadow(X,Y){
  ctx.save(); ctx.globalAlpha=0.2;
  ctx.fillStyle="#232323";
  ctx.beginPath(); ctx.ellipse(X+8,Y+3,8,3,0,0,2*Math.PI);
  ctx.fill(); ctx.globalAlpha=1.0; ctx.restore();
}
function drawDust(X,Y,frame){
  ctx.save();
  ctx.globalAlpha=0.44;
  ctx.fillStyle="#bbb"; ctx.fillRect(X,Y,3,2);
  ctx.fillStyle="#fff"; ctx.fillRect(X,Y+1,2,1);
  ctx.globalAlpha=1.0; ctx.restore();
}
function drawStone(X,Y){
  ctx.fillStyle="#555"; ctx.fillRect(X+2,Y+7,7,3);
  ctx.fillStyle="#7a7a7a"; ctx.fillRect(X+2,Y+2,9,6);
  ctx.fillStyle="#aaa"; ctx.fillRect(X+4,Y+3,6,3);
}
function drawShrub(X,Y){
  ctx.fillStyle="#232323"; ctx.fillRect(X+2,Y+6,8,3);
  ctx.fillStyle="#797979"; ctx.fillRect(X+1,Y+3,10,4);
  ctx.fillStyle="#232323"; ctx.fillRect(X+5,Y+7,3,2);
  ctx.fillStyle="#a1a1a1"; ctx.fillRect(X+4,Y+4,3,2);
}
function drawBranch(X,Y){
  ctx.fillStyle="#232323"; ctx.fillRect(X+5,Y+5,12,2);
  ctx.fillStyle="#555"; ctx.fillRect(X,Y+2,19,3);
  ctx.fillStyle="#888"; ctx.fillRect(X+2,Y+1,11,2);
}
function drawPost(X,Y){
  ctx.fillStyle="#232323"; ctx.fillRect(X+2,Y+0,2,20);
  ctx.fillStyle="#bbb"; ctx.fillRect(X,Y+0,6,6);
}
function drawGround(X,Y){
  ctx.save();
  for(let i=0;i<32;i+=8){
    ctx.fillStyle=i%2===0?"#555":"#ddd"; ctx.fillRect(X+i,Y,8,8);
    if(rand()>0.77) ctx.fillStyle="#333",ctx.fillRect(X+i+3,Y+6,1,1);
  }
  ctx.restore();
}
function drawBG(idx,offX){
  ctx.save();
  let y=RES.h-38+10*idx, w=RES.w, h=36-idx*6;
  ctx.fillStyle=["#aaa","#888","#444"][idx];
  // Blob hills
  for(let i=0;i<3;++i){
    ctx.beginPath();
    ctx.ellipse((offX+i*RES.w/2+idx*14)%w,y+12+idx*8,54-idx*14,18-idx*3,0,0,2*Math.PI);
    ctx.fill();
    if(idx<2){
      ctx.beginPath();
      ctx.ellipse((offX+(i+0.5)*RES.w/2+idx*30)%w,y+4+idx*8,34-idx*10,11-idx*2,0,0,2*Math.PI);
      ctx.fill();
    }
  }
  // tree / windmill silhouettes
  if(idx===0){
    for(let tx=36;tx<RES.w;tx+=rndi(56,110)){
      if(rand()>0.72)
        drawCorkOak(offX+tx,y+10+rndi(-4,7),[0.6,0.84][rndi(0,1)]);
      else if (rand()>0.84)
        drawWindmill(offX+tx+13,y+10);
    }
  }
  ctx.restore();
}
function drawCorkOak(X,Y,sz){
  ctx.save();
  ctx.fillStyle="#2a2a2a";
  ctx.beginPath(); ctx.ellipse(X,Y,9*sz,7*sz,0,0,2*Math.PI);ctx.fill();
  ctx.fillRect(X-3*sz,Y,6*sz,11*sz); // trunk
  ctx.restore();
}
function drawWindmill(X,Y){
  ctx.save(); ctx.fillStyle="#777";
  ctx.fillRect(X,Y,3,12);
  ctx.beginPath(); ctx.arc(X+1.5,Y,3,0,2*Math.PI);ctx.fill();
  for(let i=0;i<4;++i){
    ctx.save();ctx.translate(X+1.5,Y);ctx.rotate(Math.PI/2*i);
    ctx.fillRect(0,-1,5,2);ctx.restore();
  }
  ctx.restore();
}

function sound_ctx(){if(!audioCtx&&!mute){
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
}}
function sound_play(f,type,dur,vol=0.13,curve=null){
  if(mute){return;}
  sound_ctx();
  let ctx=audioCtx;
  let o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type; o.frequency.value=f;
  g.gain.value=vol;
  o.connect(g);g.connect(ctx.destination);
  if(curve){ let t=ctx.currentTime; for(let i=0;i<curve.length;++i) g.gain.linearRampToValueAtTime(curve[i]*vol, t+(dur*i/curve.length)); }
  o.start(); o.stop(ctx.currentTime+dur);
  setTimeout(()=>{o.disconnect();g.disconnect();}, (dur+0.05)*1000);
}
function sound_ping(){ sound_play(660,"square",.13,0.13,[1,0]); }
function sound_jump(){ sound_play(640,"triangle",.11,0.14,[1,0.66,0]); }
function sound_thud(){ sound_play(84,"sine",.24,0.13,[1,0.25,0]); }
function sound_duck(){ sound_play(202,"triangle",.21,0.10,[1,0.58,0]); }

// Prevent scroll/zoom on mobile
document.body.addEventListener('touchmove',e=>{e.preventDefault();},{passive:false});
input={jump:false,duck:false,tap:false,swipeY:null};
