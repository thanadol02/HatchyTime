/* ========= DOM ========= */
const display = document.getElementById("display");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn  = document.getElementById("stopBtn");

const timeSelect = document.getElementById("timeSelect");
const subjectSelect = document.getElementById("subjectSelect");
const newSubjectInput = document.getElementById("newSubject");
const addSubjectBtn = document.getElementById("addSubjectBtn");

const totalTimeEl = document.getElementById("totalTime");
const todayTimeEl = document.getElementById("todayTime");
const sessionsEl = document.getElementById("sessions");
const subjectsCountEl = document.getElementById("subjectsCount");
const progressBar = document.getElementById("progressBar");

/* Mode switch UI */
let mode = "timer"; // 'timer' | 'pomo'
let pomo = { focus: 25, short: 5, long: 15, longGap: 4, auto: true };
const modeTimerBtn = document.getElementById("modeTimerBtn");
const modePomoBtn  = document.getElementById("modePomoBtn");
const pomoPreset   = document.getElementById("pomoPreset");
const modeHint     = document.getElementById("modeHint");

/* Bird */
const birdEl = document.getElementById("bird");
const moodEl = document.getElementById("mood");

/* Chart */
let chartInstance = null;

/* ---------- Timer State ---------- */
let timer = null;
let remainingSeconds = 0;
let isRunning = false;
let selectedSubject = "";            // subjectID (string)
const subjectsMap = new Map();       // id -> name
let sessions = 0;
let totalFocusMinutes = 0;
let todayFocusMinutes = 0;
let initialSeconds = 0;              // วินาทีตั้งต้นของรอบนี้

/* ---------- Bird ---------- */
const BIRD_EMOJI = {
  focused:"🦜", happy:"🦜✨", bored:"🦜😐", sleepy:"🦜💤",
  celebrate:"🦜🎉", annoyed:"🦜😤", rest:"🦜🧘"
};
function setBird(state, text){
  if(!birdEl || !moodEl) return;
  birdEl.textContent = BIRD_EMOJI[state] || "🦜";
  if(text) moodEl.textContent = text;
}

/* ---------- Display / Progress ---------- */
function updateDisplay(val = remainingSeconds){
  const m = String(Math.floor(val/60)).padStart(2,"0");
  const s = String(val%60).padStart(2,"0");
  if (display) display.textContent = `${m}:${s}`;
}
function updateProgress(){
  const goal = 2*60*60; // 2h
  const running = isRunning ? (parseInt(timeSelect?.value||"0",10)*60 - remainingSeconds) : 0;
  const total = todayFocusMinutes*60 + Math.max(0,running);
  if (progressBar) progressBar.style.width = Math.min(total/goal*100,100) + "%";
}

/* ---------- Subjects (DB) ---------- */
async function loadSubjectsFromDB() {
  try {
    const rs = await fetch("/api/subjects");
    const data = await rs.json(); // [{subjectID, subjectname}]
    subjectSelect.innerHTML = "";
    subjectsMap.clear();

    if (!Array.isArray(data) || data.length === 0) {
      subjectSelect.innerHTML = `<option value="">-- ยังไม่มีวิชา --</option>`;
      selectedSubject = "";
      subjectsCountEl && (subjectsCountEl.textContent = "0");
      return;
    }

    for (const row of data) {
      const o = document.createElement("option");
      o.value = row.subjectID;
      o.textContent = row.subjectname;
      subjectSelect.appendChild(o);
      subjectsMap.set(String(row.subjectID), row.subjectname);
    }
    selectedSubject = subjectSelect.value || "";
    subjectsCountEl && (subjectsCountEl.textContent = String(subjectSelect.options.length));
  } catch (e) {
    console.error("loadSubjectsFromDB:", e);
  }
}

addSubjectBtn?.addEventListener("click", async () => {
  const name = (newSubjectInput.value || "").trim();
  if (!name) return alert("กรอกชื่อวิชา");
  addSubjectBtn.disabled = true;
  try {
    const rs = await fetch("/api/subjects", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ name })
    });
    const data = await rs.json();
    if (!rs.ok) throw new Error(data?.error || "เพิ่มวิชาไม่สำเร็จ");

    // เติม option ใหม่ทันที
    const o = document.createElement("option");
    o.value = data.subjectID;
    o.textContent = data.subjectname;
    subjectSelect.appendChild(o);
    subjectSelect.value = data.subjectID;
    selectedSubject = String(data.subjectID);
    subjectsMap.set(String(data.subjectID), data.subjectname);
    newSubjectInput.value = "";
    subjectsCountEl && (subjectsCountEl.textContent = String(subjectSelect.options.length));
  } catch (e) {
    alert(e.message);
  } finally {
    addSubjectBtn.disabled = false;
  }
});

subjectSelect?.addEventListener("change", ()=>{
  selectedSubject = subjectSelect.value || "";
});

/* ---------- Mode Switch ---------- */
function resetTimerUI(){
  clearInterval(timer); isRunning=false; remainingSeconds=0; initialSeconds=0;
  updateDisplay(0); updateProgress();
  setBird("happy", mode==="pomo" ? "⏳ พร้อมเริ่ม Pomodoro" : "🦜 พร้อมเริ่มเมื่อไหร่ก็กด START");
  document.body.classList.remove("running","paused");
}
function setMode(next){
  mode = next;
  if(mode==="timer"){
    modeTimerBtn?.classList.add("is-active"); modePomoBtn?.classList.remove("is-active");
    timeSelect?.classList.remove("hidden");   pomoPreset?.classList.add("hidden");
    modeHint && (modeHint.textContent = "โหมดจับเวลาปกติ");
  }else{
    modePomoBtn?.classList.add("is-active");  modeTimerBtn?.classList.remove("is-active");
    timeSelect?.classList.add("hidden");      pomoPreset?.classList.remove("hidden");
    modeHint && (modeHint.textContent = `Pomodoro: โฟกัส ${pomo.focus} นาที`);
    if(timeSelect) timeSelect.value = String(pomo.focus);
  }
  resetTimerUI();
}
modeTimerBtn?.addEventListener("click", ()=>setMode("timer"));
modePomoBtn?.addEventListener("click", ()=>setMode("pomo"));
pomoPreset?.addEventListener("change", ()=>{
  const [f,s,l,g] = pomoPreset.value.split("-").map(n=>parseInt(n,10));
  pomo = { focus:f, short:s, long:l, longGap:g, auto:true };
  modeHint && (modeHint.textContent = `Pomodoro: โฟกัส ${pomo.focus} นาที`);
  if(timeSelect) timeSelect.value = String(pomo.focus);
  resetTimerUI();
});
document.addEventListener("DOMContentLoaded", ()=>setMode("timer"));

/* ---------- Pomodoro Cycle ---------- */
let pomoRound = 0;
function handlePomodoroCycle(){
  pomoRound++;
  if(pomoRound % pomo.longGap === 0){
    remainingSeconds = pomo.long*60; setBird("rest", `พักยาว ${pomo.long} นาที`); alert(`พักยาว ${pomo.long} นาที`);
  }else{
    remainingSeconds = pomo.short*60; setBird("rest", `พักสั้น ${pomo.short} นาที`); alert(`พักสั้น ${pomo.short} นาที`);
  }
  updateDisplay();
  document.body.classList.remove("running");
  document.body.classList.add("paused");
}

/* ---------- Timer Control ---------- */
function startTimer(){
  if(isRunning) return;
  const val = subjectSelect.value || subjectSelect.options[0]?.value || "";
  if(!val){ alert("กรุณาเพิ่ม/เลือกวิชา"); return; }
  selectedSubject = val;

  if(remainingSeconds<=0){
    const minutes = (mode==="timer") ? parseInt(timeSelect.value,10) : pomo.focus;
    if(!minutes || isNaN(minutes)){ alert("เลือกเวลาหรือพรีเซตก่อนนะ"); return; }
    remainingSeconds = minutes*60;
    initialSeconds   = remainingSeconds; // เก็บค่าตั้งต้นของรอบ
  }

  const subjectName = subjectsMap.get(String(selectedSubject)) || "ไม่ระบุ";
  isRunning = true;
  setBird("focused", `กำลังโฟกัสที่ ${subjectName}…`);

  document.body.classList.remove("paused");
  document.body.classList.add("running");

  timer = setInterval(()=>{
    remainingSeconds = Math.max(0, remainingSeconds-1);
    updateDisplay(); updateProgress();
    if(remainingSeconds<=0){
      clearInterval(timer);
      isRunning=false;
      logSession(); // หมดเวลา -> บันทึกตามแผน

      document.body.classList.remove("running","paused");
      if(mode==="pomo") handlePomodoroCycle();
      else { setBird("celebrate","🎉 หมดเวลาพอดี เก่งมาก!"); alert("⏰ หมดเวลาแล้ว!"); }
      initialSeconds = 0;
    }
  },1000);
}

function pauseTimer(){
  if(!isRunning) return;
  clearInterval(timer);
  isRunning=false;
  setBird("bored","⏸️ หยุดพักชั่วคราว");
  document.body.classList.remove("running");
  document.body.classList.add("paused");
}

async function stopTimer(){
  // หยุดนาฬิกา
  clearInterval(timer);
  const wasRunning = isRunning;
  isRunning = false;

  // เวลาที่ทำไปแล้ว (วินาที -> นาที)
  const workedSeconds = Math.max(0, initialSeconds - remainingSeconds);
  const workedMinutes = Math.max(0, Math.round(workedSeconds / 60));

  // รีเซ็ต UI
  remainingSeconds = 0;
  updateDisplay(0); updateProgress();
  setBird("bored","พร้อมเริ่มเมื่อไหร่ก็กด START");
  document.body.classList.remove("running","paused");

  // ถ้าเคยเริ่มและทำไป > 0 นาที => บันทึกลง DB (ขั้นต่ำ 1 นาที)
  if (wasRunning || workedMinutes > 0) {
    const subjectID = Number(subjectSelect.value || selectedSubject || 0);
    if (!subjectID) { initialSeconds = 0; return alert("กรุณาเลือกวิชา"); }

    try {
      const minutes = Math.max(1, workedMinutes);
      const rs = await fetch("/api/log", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ subjectID, timer: minutes })
      });
      const data = await rs.json();
      if (!rs.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");

      totalFocusMinutes += minutes;
      todayFocusMinutes += minutes;
      sessions++;
      totalTimeEl && (totalTimeEl.textContent = Math.floor(totalFocusMinutes/60)+"h");
      todayTimeEl && (todayTimeEl.textContent = todayFocusMinutes+"m");
      sessionsEl && (sessionsEl.textContent = sessions);
      await refreshLogsFromDB();
      renderChartFromTotals(_latestTotalsMap); // ใช้ map ล่าสุด
    } catch (e) {
      alert(e.message);
    }
  }

  initialSeconds = 0;
}

/* ---------- Progress / Log (DB) ---------- */
function formatHM(mins){
  const m = Math.max(0, parseInt(mins,10) || 0);
  const h = Math.floor(m/60), r = m % 60;
  if (h > 0) return `${h} ชม ${r} นาที`;
  return `${r} นาที`;
}
let _latestTotalsMap = new Map(); // เก็บ totals ล่าสุดไว้ให้กราฟ

async function logSession(){
  // ใช้เวลาที่ตั้งไว้ (initialSeconds) เป็น "แผน" ถ้าไม่เจอ ก็ fallback timeSelect/pomo
  const plannedMinutes = initialSeconds > 0 ? Math.round(initialSeconds/60) : 0;
  const sessionMinutes = (mode==="timer") ? (parseInt(timeSelect.value,10)||plannedMinutes) : (pomo.focus || plannedMinutes);
  const subjectID = Number(subjectSelect.value || selectedSubject || 0);
  if (!subjectID || sessionMinutes <= 0) return;

  try {
    const rs = await fetch("/api/log", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ subjectID, timer: sessionMinutes })
    });
    const data = await rs.json();
    if (!rs.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");

    totalFocusMinutes += sessionMinutes;
    todayFocusMinutes += sessionMinutes;
    sessions++;
    totalTimeEl && (totalTimeEl.textContent = Math.floor(totalFocusMinutes/60)+"h");
    todayTimeEl && (todayTimeEl.textContent = todayFocusMinutes+"m");
    sessionsEl && (sessionsEl.textContent = sessions);

    await refreshLogsFromDB();
    renderChartFromTotals(_latestTotalsMap);
    updateProgress();
  } catch (e) {
    alert(e.message);
  }
}

async function refreshLogsFromDB(){
  try{
    const rs = await fetch("/api/logs");  // [{Date,timer,subjectname}]
    if (!rs.ok) {
      const tbody = document.querySelector("#subjectTotals tbody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="2">ยังไม่ได้เข้าสู่ระบบ</td></tr>`;
      document.getElementById("grandTotal").textContent = "0 นาที";
      _latestTotalsMap = new Map();
      return;
    }
    const rows = await rs.json();

    // รวมเวลาต่อวิชา
    const map = new Map();
    let grand = 0;
    for (const r of rows) {
      const name = r.subjectname || "(ไม่ระบุ)";
      const mins = Number(r.timer || 0);
      map.set(name, (map.get(name) || 0) + mins);
      grand += mins;
    }
    _latestTotalsMap = map; // เก็บไว้ใช้วาดกราฟ

    // สร้างตาราง
    const tbody = document.querySelector("#subjectTotals tbody");
    if (tbody) {
      tbody.innerHTML = "";
      if (map.size === 0) {
        tbody.innerHTML = `<tr><td colspan="2">ยังไม่มีประวัติ</td></tr>`;
      } else {
        const items = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
        for (const [name, mins] of items) {
          const tr = document.createElement("tr");
          const td1 = document.createElement("td");
          const td2 = document.createElement("td");
          td1.textContent = name;
          td2.textContent = formatHM(mins);
          tr.appendChild(td1); tr.appendChild(td2);
          tbody.appendChild(tr);
        }
      }
    }

    // total รวมทั้งหมด
    const grandEl = document.getElementById("grandTotal");
    if (grandEl) grandEl.textContent = formatHM(grand);

    // อัปเดตกราฟ
    renderChartFromTotals(map);
  }catch(e){
    console.error("refreshLogsFromDB:", e);
  }
}

/* ---------- Chart ---------- */
function renderChartFromTotals(map){
  const ctx=document.getElementById("focusChart"); if(!ctx) return;
  const labels = [];
  const values = [];
  const items = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  for (const [name, mins] of items) {
    labels.push(name);
    values.push(mins);
  }
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "เวลาสะสม (นาที)", data: values, borderRadius: 8 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "นาที" } } }
    }
  });
}

/* ---------- Idle Detector ---------- */
let idleStart=Date.now(); const IDLE_LIMIT=120;
setInterval(()=>{ const idleSec=Math.floor((Date.now()-idleStart)/1000);
  if(!isRunning && idleSec>=IDLE_LIMIT) setBird("sleepy","🥱 ง่วงแล้วน้า… กลับมาโฟกัสกันเถอะ");
},5000);
["mousemove","keydown","pointerdown","touchstart","visibilitychange"].forEach(ev=>{
  window.addEventListener(ev,()=>{ idleStart=Date.now(); });
});

/* ---------- Events ---------- */
startBtn?.addEventListener("click", startTimer);
pauseBtn?.addEventListener("click", pauseTimer);
stopBtn?.addEventListener("click", stopTimer);

/* ---------- Init ---------- */
async function init(){
  await loadSubjectsFromDB();
  updateDisplay(0);
  updateProgress();
  setBird("happy","🦜 พร้อมลุย!");
  await refreshLogsFromDB(); // แสดง “เวลาสะสมต่อวิชา” จาก DB
}
init();

/* ===============================
   Eye Tracking with MediaPipe FaceMesh
   =============================== */
const cam = document.getElementById("cameraFeed");
const eyeStatus = document.getElementById("eyeStatus");

// เตรียม canvas ซ้อนบนวิดีโอ
let faceCanvas = document.getElementById("faceCanvas");
if (!faceCanvas) {
  faceCanvas = document.createElement("canvas");
  faceCanvas.id = "faceCanvas";
  faceCanvas.width = 640;
  faceCanvas.height = 480;
  faceCanvas.style.position = "absolute";
  faceCanvas.style.left = 0;
  faceCanvas.style.top = 0;
  const wrap = cam?.closest(".video-wrap") || document.body;
  if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
  wrap.appendChild(faceCanvas);
}
const faceCtx = faceCanvas.getContext("2d");

// สร้าง FaceMesh
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

// heuristic ง่ายๆ ว่ามองจอไหม
function isLooking(landmarks) {
  if (!landmarks || landmarks.length < 468) return false;
  const L = Math.abs(landmarks[33].x - landmarks[133].x);
  const R = Math.abs(landmarks[362].x - landmarks[263].x);
  return (L > 0.01 && R > 0.01);
}

// วาด + trigger pause/resume
faceMesh.onResults((results) => {
  const w = cam?.videoWidth || faceCanvas.width;
  const h = cam?.videoHeight || faceCanvas.height;
  if (faceCanvas.width !== w || faceCanvas.height !== h) { faceCanvas.width=w; faceCanvas.height=h; }

  faceCtx.save();
  faceCtx.clearRect(0,0,faceCanvas.width,faceCanvas.height);
  faceCtx.drawImage(results.image, 0, 0, faceCanvas.width, faceCanvas.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const lm = results.multiFaceLandmarks[0];
    drawConnectors(faceCtx, lm, FACEMESH_LEFT_EYE,  { lineWidth: 1 });
    drawConnectors(faceCtx, lm, FACEMESH_RIGHT_EYE, { lineWidth: 1 });

    if (isLooking(lm)) {
      if (eyeStatus){ eyeStatus.textContent = "✅ กำลังมองจอ"; eyeStatus.style.color="green"; }
      if (typeof startTimer === "function" && !isRunning) startTimer();
    } else {
      if (eyeStatus){ eyeStatus.textContent = "⏸️ ไม่เจอสายตา"; eyeStatus.style.color="red"; }
      if (typeof pauseTimer === "function" && isRunning) pauseTimer();
    }
  } else {
    if (eyeStatus){ eyeStatus.textContent = "❌ ไม่เจอหน้า"; eyeStatus.style.color="gray"; }
  }

  faceCtx.restore();
});

// เปิดกล้อง + ส่งเฟรมเข้าโมเดล
async function openCameraMP() {
  if (!cam) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    cam.srcObject = stream;
    cam.muted = true;
    cam.setAttribute("playsinline", "true");
    await cam.play();
    return true;
  } catch (e) {
    console.error("openCamera error", e);
    if (eyeStatus) eyeStatus.textContent = "❌ เปิดกล้องไม่สำเร็จ";
    return false;
  }
}

// เริ่มทำงาน
(async function initEyeTrackingMP(){
  try{
    if(!cam || !eyeStatus) return;
    eyeStatus.textContent = "🎥 เปิดกล้อง...";
    const ok = await openCameraMP();
    if (!ok) return;

    eyeStatus.textContent = "👀 กำลังโหลด MediaPipe...";
    const camera = new Camera(cam, {
      onFrame: async () => { await faceMesh.send({ image: cam }); },
      width: 640,
      height: 480
    });
    camera.start();
    eyeStatus.textContent = "✅ พร้อมตรวจจับด้วย MediaPipe";
  }catch(e){
    console.warn("Eye tracking init failed:", e);
    if (eyeStatus) eyeStatus.textContent = "❌ ใช้งานกล้อง/โมเดลไม่ได้";
  }
})();
