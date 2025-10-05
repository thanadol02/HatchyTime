// State
const pad=n=>String(n).padStart(2,'0')
const $=s=>document.querySelector(s)
const fab=$('#fab'), sheet=$('#sheet'), timeEl=$('#time'), prog=$('#progress')
const statusEl=$('#status'), startBtn=$('#start'), pauseBtn=$('#pause'), doneBtn=$('#done'), resetBtn=$('#reset')
const taskEl=$('#task'), presetsEl=$('#presets')
const ding=$('#ding')

let duration=25*60, breakMin=5, left=duration, timer=null, phase='focus'
let sessions=JSON.parse(localStorage.getItem('mf_sessions')||'[]')

// Helpers
function openSheet(){ sheet.classList.add('open'); updateProgress() }
function closeSheet(){ sheet.classList.remove('open') }
function setStatus(msg){ statusEl.textContent=msg }
function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return `${pad(m)}:${pad(s)}` }
function updateProgress(){
  const total = (phase==='focus'?duration:breakMin*60)
  const p = (1 - left/total) * 360
  prog.style.background = `conic-gradient(var(--green) ${p}deg, #eee 0deg)`
  timeEl.textContent = fmt(left)
}
function saveSession(minutes){
  const d = new Date()
  const date = d.toISOString().slice(0,10)
  const item = {date, minutes, task: taskEl.value || null}
  sessions.push(item)
  localStorage.setItem('mf_sessions', JSON.stringify(sessions))
  renderStats()
}
function renderStats(){
  const today = new Date().toISOString().slice(0,10)
  const minsToday = sessions.filter(s=>s.date===today).reduce((a,b)=>a+b.minutes,0)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-6)
  const minsWeek = sessions.filter(s=> new Date(s.date) >= weekAgo).reduce((a,b)=>a+b.minutes,0)
  document.getElementById('today-total').textContent = minsToday? (minsToday+"m") : '0m'
  const h=Math.floor(minsWeek/60), m=minsWeek%60
  document.getElementById('week-total').textContent = `${h}h ${m}m`
  document.getElementById('sessions').textContent = sessions.length
}

// Timer
function tick(){
  if(left>0){ left--; updateProgress() }
  else{
    clearInterval(timer); timer=null
    if(phase==='focus'){
      saveSession(Math.round(duration/60))
      try{ ding.currentTime=0; ding.play() }catch{}
      phase='break'; left=breakMin*60; setStatus(`พัก ${breakMin} นาที — เดินยืดเส้นสั้น ๆ`)
      start()
    } else {
      setStatus('พักเสร็จ • พร้อมเริ่มรอบต่อไป')
      fab.classList.remove('running');
    }
  }
}
function start(){ if(timer) return; timer=setInterval(tick,1000); fab.classList.add('running'); setStatus(phase==='focus'? 'กำลังโฟกัส…' : 'กำลังพัก…') }
function pause(){ if(!timer) return; clearInterval(timer); timer=null; fab.classList.add('paused'); setStatus('พักชั่วคราว (Paused)') }
function reset(){ clearInterval(timer); timer=null; phase='focus'; left=duration; updateProgress(); fab.classList.remove('running','paused'); setStatus('รีเซ็ตแล้ว พร้อมเริ่มใหม่') }
function done(){ if(phase==='focus'){ const minutes = Math.round((duration-left)/60); if(minutes>0) saveSession(minutes) } reset() }

// Events
fab.addEventListener('click',()=>{ openSheet() })
sheet.addEventListener('click',e=>{ if(e.target===sheet) closeSheet() })
startBtn.addEventListener('click',start)
pauseBtn.addEventListener('click',pause)
resetBtn.addEventListener('click',reset)
doneBtn.addEventListener('click',done)
presetsEl.addEventListener('click',e=>{
  const btn=e.target.closest('.preset'); if(!btn) return;
  [...presetsEl.children].forEach(b=>b.classList.remove('active'))
  btn.classList.add('active')
  duration = Number(btn.dataset.min||25)*60
  breakMin = Number(btn.dataset.break||5)
  left=duration; phase='focus'; updateProgress();
  timeEl.textContent = fmt(left)
  fab.textContent = Math.round(duration/60)
})
window.addEventListener('keydown',e=>{
  if(e.code==='Space'){ e.preventDefault(); timer? pause():start() }
  if(e.key==='r' || e.key==='R') reset()
  if(e.key==='s' || e.key==='S') done()
})
renderStats(); updateProgress();


// ===== Focus Mode =====
let focusOpen=false, wakeLock=null
const focusEl = document.getElementById('focus')
const fTimeEl = document.getElementById('fTime')
const fProgEl = document.getElementById('fProg')
const fTaskEl = document.getElementById('fTask')
const fStatusEl = document.getElementById('fStatus')
const focusBtn = document.getElementById('focusModeBtn')
const fStartBtn = document.getElementById('fStart')
const fPauseBtn = document.getElementById('fPause')
const fDoneBtn = document.getElementById('fDone')
const exitFocusBtn = document.getElementById('exitFocus')

function mirrorProgress(){
  if(!focusOpen) return
  const total = (phase==='focus'?duration:breakMin*60)
  const p = (1 - left/total) * 360
  fProgEl.style.background = `conic-gradient(var(--green) ${p}deg, #1f2937 0deg)`
  fTimeEl.textContent = fmt(left)
  fTaskEl.textContent = taskEl.value || 'กำลังโฟกัส'
  fStatusEl.textContent = (timer? (phase==='focus'?'กำลังโฟกัส…':'กำลังพัก…') : 'หยุดชั่วคราว')
}

async function requestWakeLock(){
  try{
    if('wakeLock' in navigator){
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', ()=>{})
    }
  }catch(e){ /* ignore */ }
}
function releaseWakeLock(){ try{ wakeLock && wakeLock.release(); wakeLock=null }catch(e){} }

async function enterFullscreen(){
  try{
    const el = document.documentElement
    if(el.requestFullscreen) await el.requestFullscreen()
  }catch(e){}
}
async function exitFullscreen(){
  try{ if(document.fullscreenElement) await document.exitFullscreen() }catch(e){}
}

function openFocus(){
  focusOpen=true
  focusEl.classList.add('open')
  document.body.classList.add('focus-active')
  requestWakeLock()
  enterFullscreen()
  mirrorProgress()
}

function closeFocus(){
  focusOpen=false
  focusEl.classList.remove('open')
  document.body.classList.remove('focus-active')
  releaseWakeLock()
  exitFullscreen()
}

focusBtn?.addEventListener('click', openFocus)
exitFocusBtn?.addEventListener('click', closeFocus)
fStartBtn?.addEventListener('click', start)
fPauseBtn?.addEventListener('click', pause)
fDoneBtn?.addEventListener('click', done)

// Block some keys while in focus mode
window.addEventListener('keydown', (e)=>{
  if(!focusOpen) return
  const key = e.key.toLowerCase()
  if(key === 'escape'){ e.preventDefault(); closeFocus(); return }
  if(e.ctrlKey && ['r','l','t','w'].includes(key)) e.preventDefault()
  if(['f5'].includes(key)) e.preventDefault()
})

// Reacquire wake lock if tab becomes visible again
document.addEventListener('visibilitychange', ()=>{
  if(focusOpen && document.visibilityState === 'visible') requestWakeLock()
})

// Hook into existing updater
const _updateProgress_ref = updateProgress
updateProgress = function(){
  _updateProgress_ref()
  mirrorProgress()
}