// ===== Utilities =====
const $ = q => document.querySelector(q);
const pad = n => String(n).padStart(2,'0');
const fmt = s => {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
};
const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 1200);
};

// ===== Local state / storage keys =====
const LS = {
  get:(k,f)=>{try{return JSON.parse(localStorage.getItem(k)) ?? f}catch{return f}},
  set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))
};
const seedsKey='fb_seeds', streakKey='fb_streak', dayKey='fb_day';
const todayKey='fb_today', weekKey='fb_week', monthKey='fb_month', goalKey='fb_goal';
const sessionsKey='fb_sessions';

let running=false, seconds=0, timer=null;
let totalSamples=0, focusSamples=0; // สำหรับ focus score
let violations=0, graceCounter=0;
let calibrated=false;
let calibCenter = { lx:0, ly:0, rx:0, ry:0 }; // iris baseline

// ===== MediaPipe FaceMesh =====
let faceMesh = null;
let videoEl, canvasEl, ctx;

// Eye landmarks (MediaPipe):
// Left iris center: 468, Right iris center: 473
// Eye contour (ซ้าย/ขวา) ใช้บางจุดเพื่อ EAR
const L_IRIS = 468, R_IRIS = 473;
// Vertical pairs (EAR)
const LEFT_EYE_UP = 386, LEFT_EYE_DOWN = 374;
const RIGHT_EYE_UP = 159, RIGHT_EYE_DOWN = 145;
// Horizontal corner (approx)
const LEFT_EYE_LEFT = 263, LEFT_EYE_RIGHT = 362;
const RIGHT_EYE_LEFT = 133, RIGHT_EYE_RIGHT = 33;

// Thresholds
const EAR_CLOSED = 0.18; // ถ้าต่ำกว่านี้ถือว่าหลับตา
const GAZE_TOLERANCE = 0.06; // ระยะเบี่ยงจาก center ที่ยอมรับ (normalized)
const GRACE_SECONDS_DEFAULT = 3;

// ===== Timer controls =====
function tick(){
  if(!running) return;
  seconds++; $('#display').textContent = fmt(seconds);
  timer = setTimeout(tick, 1000);
}
$('#startBtn').onclick = ()=>{ if(!running){ running=true; tick(); $('#mood').textContent='กำลังโฟกัส…'; }};
$('#pauseBtn').onclick = ()=>{ running=false; clearTimeout(timer); $('#mood').textContent='พักก่อน'; };
$('#stopBtn').onclick = ()=>{
  if(!running && seconds===0) return;
  running=false; clearTimeout(timer);
  const min = Math.max(1, Math.round(seconds/60));
  saveSession(min);
  seconds=0; $('#display').textContent=fmt(0);
  // reset focus stats for next round
  totalSamples=0; focusSamples=0; violations=0; graceCounter=0;
  updateMeters();
  $('#mood').textContent = `เสร็จสิ้น ${min} นาที!`;
};

// ===== KPIs & goal bar =====
function addMinutes(min){
  const d = new Date(), key = d.toISOString().slice(0,10);
  const lastDay = LS.get(dayKey, null);
  let today = LS.get(todayKey,0), week = LS.get(weekKey,0), month = LS.get(monthKey,0);

  if(lastDay !== key){
    // streak
    if(lastDay){
      const diff = (new Date(key) - new Date(lastDay))/86400000;
      let st = LS.get(streakKey,0);
      st = (diff === 1) ? st+1 : 0;
      LS.set(streakKey, st); $('#streak').textContent = st;
    }
    today = 0; LS.set(dayKey, key);
  }
  today += min; week += min; month += min;
  LS.set(todayKey, today); LS.set(weekKey, week); LS.set(monthKey, month);
  updateGoalBar();
}
function updateGoalBar(){
  const goal = Number($('#goal').value || 120);
  LS.set(goalKey, goal);
  const today = LS.get(todayKey, 0);
  const per = Math.max(0, Math.min(100, Math.round(today/goal*100)));
  $('#goalBar').style.width = per + '%';
}
$('#goal').addEventListener('input', updateGoalBar);

// ===== Sessions / Seeds =====
function saveSession(min){
  const focusPct = Math.round((focusSamples / Math.max(1,totalSamples)) * 100);
  const earnedSeeds = Math.max(1, Math.round(min * (1 + focusPct/100))); // ยิ่งโฟกัสดี ยิ่งได้มาก
  const nowSeeds = LS.get(seedsKey,0) + earnedSeeds;
  LS.set(seedsKey, nowSeeds);
  $('#seeds').textContent = nowSeeds;

  addMinutes(min);

  const arr = LS.get(sessionsKey, []);
  arr.unshift({
    ts: Date.now(),
    min,
    focus: focusPct,
    violations
  });
  LS.set(sessionsKey, arr);
  renderLog();
}

// ===== Log UI =====
function renderLog(){
  const list = LS.get(sessionsKey, []);
  const box = $('#log'); box.innerHTML = '';
  if(list.length === 0){
    box.innerHTML = '<div class="item"><span class="muted">ยังไม่มีบันทึก เริ่มโฟกัสรอบแรกเลย</span></div>';
    return;
  }
  list.slice(0,20).forEach(s=>{
    const t = new Date(s.ts).toLocaleString();
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `✔️ ${s.min} นาที · Focus ${s.focus}% · Violations ${s.violations} <span class="muted">(${t})</span>`;
    box.appendChild(el);
  });
}
$('#clearLog').onclick = ()=>{
  localStorage.removeItem(sessionsKey);
  renderLog();
};

// ===== Focus meters =====
function updateMeters(){
  const pct = Math.round((focusSamples / Math.max(1,totalSamples)) * 100);
  $('#focusScore').textContent = pct + '%';
  $('#violations').textContent = violations;
}

// ===== Camera + FaceMesh =====
async function initCameraAndFaceMesh(){
  videoEl = $('#cam');
  canvasEl = $('#overlay');
  ctx = canvasEl.getContext('2d');

  // Camera
  const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
  videoEl.srcObject = stream;

  // FaceMesh
  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true, // มี iris
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
  faceMesh.onResults(onResults);

  // Feed camera to FaceMesh
  const camera = new Camera(videoEl, {
    onFrame: async () => { await faceMesh.send({ image: videoEl }); },
    width: 640, height: 360
  });
  camera.start();
}

// ===== Geometry helpers =====
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function eyeAspectRatio(landmarks, up, down, left, right){
  const v = dist(landmarks[up], landmarks[down]);
  const h = dist(landmarks[left], landmarks[right]);
  return v / Math.max(1e-6,h);
}
function isEyesOpen(landmarks){
  const leftEAR  = eyeAspectRatio(landmarks, LEFT_EYE_UP, LEFT_EYE_DOWN, LEFT_EYE_LEFT, LEFT_EYE_RIGHT);
  const rightEAR = eyeAspectRatio(landmarks, RIGHT_EYE_UP, RIGHT_EYE_DOWN, RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT);
  const ear = (leftEAR + rightEAR) / 2;
  return ear > EAR_CLOSED;
}
function gazeDelta(landmarks){
  // ค่าพิกัด normalized (0..1)
  const L = landmarks[L_IRIS], R = landmarks[R_IRIS];
  if(!L || !R) return { dx: 1, dy: 1 }; // missing
  // เปรียบเทียบกับค่าคาลิเบรต (center)
  const dx = ((L.x - calibCenter.lx) + (R.x - calibCenter.rx)) / 2;
  const dy = ((L.y - calibCenter.ly) + (R.y - calibCenter.ry)) / 2;
  return { dx, dy };
}
function isLookingAtScreen(delta){
  return Math.abs(delta.dx) < GAZE_TOLERANCE && Math.abs(delta.dy) < GAZE_TOLERANCE;
}

// ===== Calibration =====
function calibrate(landmarks){
  if(!landmarks) { toast('ยังไม่เห็นหน้าในกล้อง'); return false; }
  const L = landmarks[L_IRIS], R = landmarks[R_IRIS];
  calibCenter = { lx:L.x, ly:L.y, rx:R.x, ry:R.y };
  calibrated = true;
  $('#calibInfo').textContent = 'คาลิเบรตแล้ว ✓';
  toast('Calibration สำเร็จ');
  return true;
}
$('#calibrateBtn').onclick = ()=> {
  toast('กำลังคาลิเบรต… กรุณามองจอตรง ๆ อยู่เฉย ๆ 1 วินาที');
  // จะ set ในรอบ onResults ถัดไปเมื่อมีใบหน้า
  pendingCalibration = true;
};
$('#resetCalibBtn').onclick = ()=> {
  calibrated = false;
  $('#calibInfo').textContent = 'ยังไม่ได้คาลิเบรต';
  toast('รีเซ็ตคาลิเบรตแล้ว');
};
let pendingCalibration = false;

// ===== onResults: core focus logic =====
function onResults(res){
  // Resize canvas
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;

  const draw = $('#drawOverlay').value === 'on';

  if(draw){
    ctx.save();
    ctx.clearRect(0,0,canvasEl.width,canvasEl.height);
    ctx.drawImage(res.image, 0, 0, canvasEl.width, canvasEl.height);
  }

  const det = res.multiFaceLandmarks && res.multiFaceLandmarks[0];
  let focusedNow = false;

  if(det){
    if(pendingCalibration){
      calibrate(det);
      pendingCalibration = false;
    }

    const eyesOpen = isEyesOpen(det);
    let looking = false;
    if(calibrated){
      const delta = gazeDelta(det);
      looking = isLookingAtScreen(delta);
    } else {
      // ยังไม่คาลิเบรต: ใช้ว่ามีใบหน้าบวกตาเปิด
      looking = true;
    }

    focusedNow = eyesOpen && looking;

    if(draw){
      // วาด iris & eye box
      drawingUtils.drawLandmarks(ctx, [det[L_IRIS], det[R_IRIS]], {color: '#6ee7ff', lineWidth: 2});
      drawingUtils.drawConnectors(ctx, det, FaceMesh.FACEMESH_LEFT_EYE,  {color:'#8b5cf6', lineWidth:1});
      drawingUtils.drawConnectors(ctx, det, FaceMesh.FACEMESH_RIGHT_EYE, {color:'#8b5cf6', lineWidth:1});
    }
  }

  // Update focus metrics
  totalSamples++;
  if(focusedNow) focusSamples++;

  const graceLimit = Number($('#graceSec').value || GRACE_SECONDS_DEFAULT);
  const autoPause = $('#autoPause').value === 'on';

  if(!focusedNow){
    graceCounter++;
    $('#focusBadge').textContent = `Not focused (${graceCounter}s)`;
    $('#focusBadge').style.background = '#2b1120';
    $('#bird').textContent = '🐦💢';
    $('#mood').textContent = 'โฟกัสหลุด! กลับมามองจอด้วยนะ';

    if(graceCounter >= graceLimit){
      violations++;
      updateMeters();
      if(running && autoPause){
        running=false; clearTimeout(timer);
        toast('Auto-pause เนื่องจากหลุดโฟกัส');
      }
      graceCounter = 0; // รีเซ็ตนับใหม่
    }
  } else {
    graceCounter = 0;
    $('#focusBadge').textContent = 'Focused ✓';
    $('#focusBadge').style.background = '#102b20';
    $('#bird').textContent = '🐦✨';
    $('#mood').textContent = 'ดีมาก! กำลังโฟกัสอยู่';
  }

  // Draw overlay label
  if(draw){
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(8, canvasEl.height-28, 150, 20);
    ctx.fillStyle = 'white';
    ctx.font = '12px ui-rounded, system-ui';
    const pct = Math.round((focusSamples / Math.max(1,totalSamples))*100);
    ctx.fillText(`Focus: ${pct}%  V: ${violations}`, 12, canvasEl.height-14);
    ctx.restore();
  }

  updateMeters();
}

// ===== Boot =====
function boot(){
  // KPIs boot
  $('#seeds').textContent = LS.get(seedsKey,0);
  $('#streak').textContent = LS.get(streakKey,0);
  $('#goal').value = LS.get(goalKey,120);
  updateGoalBar();
  renderLog();

  // Back button
  $('#backBtn').onclick = ()=> history.back();

  // Overlay / options listeners
  $('#drawOverlay').addEventListener('change', ()=> {
    // just affects drawing in onResults
  });

  initCameraAndFaceMesh()
  .then(()=> toast('กล้องพร้อมใช้งาน'))
  .catch(()=> { $('#mood').textContent = '❌ ไม่สามารถเข้าถึงกล้อง'; });
}
boot();
