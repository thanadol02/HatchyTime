// plan.js — เชื่อมตาราง plan กับ Flask API

document.addEventListener("DOMContentLoaded", () => {
  // ===== DOM =====
  const addBtn     = document.getElementById("addPlanBtn");
  const planList   = document.getElementById("planList");

  // รองรับหลายชื่อ id ของ input ตามไฟล์ HTML ที่อาจต่างกัน
  const titleEl = document.getElementById("planTitle") || document.getElementById("bookTitle");
  const dateEl  = document.getElementById("planDate");
  const descEl  = document.getElementById("planDesc")  || document.getElementById("notes");
  const prioEl  = document.getElementById("planPrio")  || document.getElementById("priority");
  const subjEl  = document.getElementById("planSubject") || document.getElementById("subject"); // อาจเป็น select หรือ input

  // ===== Utils =====
  const esc = (s) => {
    const t = document.createElement("div");
    t.innerText = s ?? "";
    return t.innerHTML;
  };
  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString("th-TH"); }
    catch { return iso || ""; }
  };

  // ===== Subjects (ถ้ามีช่องให้เลือกวิชา จะโหลดมาเติม) =====
  async function loadSubjectsIfNeeded() {
    if (!subjEl || subjEl.tagName !== "SELECT") return;
    try {
      const rs = await fetch("/api/subjects");
      const rows = await rs.json();
      subjEl.innerHTML = `<option value="">-- เลือกวิชา --</option>`;
      (rows || []).forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.subjectID;
        opt.textContent = r.subjectname;
        subjEl.appendChild(opt);
      });
    } catch (e) {
      console.warn("โหลดรายวิชาไม่สำเร็จ:", e);
    }
  }

  // ===== Plans =====
  async function loadPlans() {
    try {
      const rs = await fetch("/api/plans");
      if (!rs.ok) {
        planList.innerHTML = `<li class="plan-item">ยังไม่ได้เข้าสู่ระบบ</li>`;
        return;
      }
      const data = await rs.json();
      renderList(data);
    } catch (e) {
      console.error(e);
      planList.innerHTML = `<li class="plan-item">โหลดข้อมูลไม่สำเร็จ</li>`;
    }
  }

  function renderList(plans) {
    planList.innerHTML = "";
    if (!plans || plans.length === 0) {
      planList.innerHTML = `<li class="plan-item">😴 ยังไม่มีแผน</li>`;
      return;
    }
    plans.forEach((p) => {
      const li = document.createElement("li");
      li.className = "plan-item";
      if (p.is_done) li.style.opacity = 0.6;

      li.innerHTML = `
        <div class="plan-info">
          <span class="plan-title">${esc(p.planname)}</span>
          <span class="plan-date">กำหนด: ${fmtDate(p.dateplan)}</span>
          ${p.priority ? `<span class="tag">⭐ ${esc(p.priority)}</span>` : ""}
          ${p.subjectname ? `<span class="tag">🏷️ ${esc(p.subjectname)}</span>` : ""}
          ${p.description ? `<div class="plan-note">📝 ${esc(p.description)}</div>` : ""}
        </div>
        <div class="plan-actions">
          <button class="btn tiny"        data-action="edit"  data-id="${p.planID}">✏️</button>
          <button class="btn tiny success" data-action="done"  data-id="${p.planID}">${p.is_done ? "↩️" : "✅"}</button>
          <button class="btn tiny danger"  data-action="del"   data-id="${p.planID}">🗑️</button>
        </div>
      `;
      planList.appendChild(li);
    });
  }

  async function addPlan() {
    const planname = (titleEl?.value || "").trim();
    const dateplan = (dateEl?.value || "").trim(); // ควรเป็น YYYY-MM-DD หรือ ISO
    const description = (descEl?.value || "").trim();
    const priority = (prioEl?.value || "ปกติ").trim();

    // subject อาจเป็น select (ส่ง id) หรือ input (ส่งชื่อ)
    let subjectPayload = {};
    if (subjEl) {
      if (subjEl.tagName === "SELECT") {
        const sid = parseInt(subjEl.value, 10);
        if (sid) subjectPayload.subjectID = sid;
      } else {
        const sname = (subjEl.value || "").trim();
        if (sname) subjectPayload.subject = sname; // backend จะ map เป็น subjectID ให้
      }
    }

    if (!planname) return alert("กรอกชื่อแผนก่อน!");
    if (!dateplan) return alert("เลือกวันที่ก่อน!");

    try {
      const rs = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planname, dateplan, priority, description, ...subjectPayload
        }),
      });
      const data = await rs.json();
      if (!rs.ok) {
        return alert(data?.error || "บันทึกไม่สำเร็จ");
      }
      // reset form
      if (titleEl) titleEl.value = "";
      if (dateEl)  dateEl.value = "";
      if (descEl)  descEl.value = "";
      if (prioEl)  prioEl.value = "ปกติ";
      if (subjEl)  subjEl.value = "";
      await loadPlans();
    } catch (e) {
      console.error(e);
      alert("บันทึกไม่สำเร็จ");
    }
  }

  async function deletePlan(id) {
    if (!confirm("ลบรายการนี้?")) return;
    const rs = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    if (!rs.ok) {
      const d = await rs.json().catch(() => ({}));
      return alert(d?.error || "ลบไม่สำเร็จ");
    }
    loadPlans();
  }

  async function toggleDone(id, currentDone) {
    const rs = await fetch(`/api/plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_done: !currentDone }),
    });
    if (!rs.ok) {
      const d = await rs.json().catch(() => ({}));
      return alert(d?.error || "อัปเดตไม่สำเร็จ");
    }
    loadPlans();
  }

  async function editPlan(id) {
    // inline แบบเร็วด้วย prompt — ปรับได้ตาม UI ที่คุณต้องการ
    const name = prompt("ชื่อแผน (เว้นว่างถ้าไม่แก้):");
    const date = prompt("วันที่ (YYYY-MM-DD) (เว้นว่างถ้าไม่แก้):");
    const prio = prompt("ความสำคัญ (ปกติ/สูง/ด่วนมาก) (เว้นว่างถ้าไม่แก้):");
    const subj = prompt("วิชา (ชื่อวิชา หรือเว้นว่าง):");
    const note = prompt("รายละเอียด/โน้ต (เว้นว่างถ้าไม่แก้):");

    const patch = {};
    if (name) patch.planname = name;
    if (date) patch.dateplan = date;
    if (prio) patch.priority = prio;
    if (note) patch.description = note;
    if (subj) patch.subject = subj; // backend จะ resolve เป็น subjectID

    if (Object.keys(patch).length === 0) return;

    const rs = await fetch(`/api/plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!rs.ok) {
      const d = await rs.json().catch(() => ({}));
      return alert(d?.error || "อัปเดตไม่สำเร็จ");
    }
    loadPlans();
  }

  // ===== Events =====
  addBtn?.addEventListener("click", addPlan);

  // event delegation สำหรับปุ่มใน list
  planList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = +btn.dataset.id;
    const action = btn.dataset.action;
    if (action === "del") return deletePlan(id);
    if (action === "done") {
      // หา state ปัจจุบันจาก DOM (ถ้าขีดเส้นแล้วถือว่า done)
      const isDone = btn.textContent.includes("↩️");
      return toggleDone(id, isDone);
    }
    if (action === "edit") return editPlan(id);
  });

  // ===== Init =====
  loadSubjectsIfNeeded();
  loadPlans();
});
