from flask import (
    Flask, render_template, redirect, url_for, session, flash,
    jsonify, request, send_from_directory
)
import mysql.connector, os
from werkzeug.security import generate_password_hash, check_password_hash
import pandas as pd
from PyPDF2 import PdfReader
from datetime import datetime

# ---------- พาธหลัก ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JS_DIR   = os.path.join(BASE_DIR, "JS")

# ---------- สร้างแอป ----------
# HTML ใน "template", CSS ใน "CSS"
app = Flask(__name__, template_folder="template", static_folder="CSS", static_url_path="/CSS")
app.secret_key = "change_me_to_random_secret"  # เปลี่ยนเป็นค่า random ในโปรดักชัน

# ---------- DB CONFIG ----------
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "จๅจภจถจุ",  # แก้ให้ตรงของคุณ
    "database": "seminar",
    "auth_plugin": "mysql_native_password",
}
def get_conn():
    return mysql.connector.connect(**DB_CONFIG)

# ---------- เสิร์ฟไฟล์ JS ----------
@app.route("/js/<path:filename>")
@app.route("/JS/<path:filename>")
def serve_js(filename):
    return send_from_directory(JS_DIR, filename)

# ---------- โฟลเดอร์อัปโหลด & ไฟล์ข้อความที่สกัด ----------
app.config["UPLOAD_FOLDER"] = os.path.join(BASE_DIR, "uploads")
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

EXTRACT_FOLDER = os.path.join(app.config["UPLOAD_FOLDER"], "extracted")
os.makedirs(EXTRACT_FOLDER, exist_ok=True)

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    # ใช้สำหรับแสดง PDF ใน iframe
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

@app.route("/extracted/<path:filename>")
def extracted_file(filename):
    # ดาวน์โหลดไฟล์ข้อความที่สกัด (txt)
    return send_from_directory(EXTRACT_FOLDER, filename, as_attachment=True)

# ================== PAGES ==================
@app.route("/")
def home():
    return redirect(url_for("login_page"))

@app.route("/login", methods=["GET"])
def login_page():
    return render_template("login.html")

@app.route("/signup", methods=["GET"])
def signup_page():
    return render_template("signup.html")

@app.route("/plan", methods=["GET"])
def plan_page():
    if "user_id" not in session:
        flash("กรุณาเข้าสู่ระบบก่อน", "error")
        return redirect(url_for("login_page"))
    return render_template("plan.html")

@app.route("/success", methods=["GET"])
def success_page():
    if "user_id" not in session:
        flash("กรุณาเข้าสู่ระบบก่อน", "error")
        return redirect(url_for("login_page"))
    return render_template("success.html")

@app.route("/user", methods=["GET"])
def user_page():
    if "user_id" not in session:
        flash("กรุณาเข้าสู่ระบบก่อน", "error")
        return redirect(url_for("login_page"))
    return render_template("user.html")

# (aliases *.html)
@app.route("/login.html")
def _login_alias():   return redirect(url_for("login_page"))
@app.route("/signup.html")
def _signup_alias():  return redirect(url_for("signup_page"))
@app.route("/dashboard.html")
def _dash_alias():    return redirect(url_for("dashboard"))
@app.route("/plan.html")
def _plan_alias():    return redirect(url_for("plan_page"))
@app.route("/success.html")
def _success_alias(): return redirect(url_for("success_page"))
@app.route("/user.html")
def _user_alias():    return redirect(url_for("user_page"))

# ---------- DASHBOARD (อัปโหลด + โหมดอ่านหนังสือ) ----------
@app.route("/dashboard", methods=["GET", "POST"])
def dashboard():
    if "user_id" not in session:
        flash("กรุณาเข้าสู่ระบบก่อน", "error")
        return redirect(url_for("login_page"))

    reading_text = None   # ข้อความล้วน ที่แสดงในโหมดอ่านหนังสือ
    download_url = None   # ลิงก์ดาวน์โหลดไฟล์ .txt ที่สกัด
    pdf_url = None        # สำหรับแสดงตัวอย่าง PDF (ถ้าอยากเปิดดูคู่กัน)

    if request.method == "POST":
        if "file" not in request.files or request.files["file"].filename == "":
            flash("❌ กรุณาเลือกไฟล์", "error")
            return redirect(request.url)

        f = request.files["file"]
        filename = f.filename
        path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        f.save(path)

        ext = os.path.splitext(filename)[1].lower()

        try:
            if ext == ".txt":
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    reading_text = fh.read()

            elif ext == ".csv":
                df = pd.read_csv(path)
                # แปลงตารางเป็นข้อความอ่านง่าย
                reading_text = df.to_string(index=False)

            elif ext in [".xls", ".xlsx"]:
                df = pd.read_excel(path)
                reading_text = df.to_string(index=False)

            elif ext == ".pdf":
                pdf_url = url_for("uploaded_file", filename=filename)
                reader = PdfReader(path)
                pieces = []
                # ถ้าไฟล์ใหญ่มาก ปรับ min(len, 10) เพื่อเร็วขึ้นได้
                for i in range(len(reader.pages)):
                    text = reader.pages[i].extract_text() or ""
                    pieces.append(text.strip())
                reading_text = "\n\n".join(pieces).strip()

            else:
                flash("รองรับเฉพาะ .txt, .csv, .xls, .xlsx, .pdf", "warning")
                return redirect(request.url)

            # สร้างไฟล์ข้อความที่สกัด เพื่อให้กดโหลดได้
            if reading_text:
                base = os.path.splitext(os.path.basename(filename))[0]
                outname = f"{base}_extracted_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
                outpath = os.path.join(EXTRACT_FOLDER, outname)
                with open(outpath, "w", encoding="utf-8", errors="ignore") as out:
                    out.write(reading_text)
                download_url = url_for("extracted_file", filename=outname)

        except Exception as e:
            flash(f"เกิดข้อผิดพลาดในการอ่านไฟล์: {e}", "error")
            return redirect(request.url)

    return render_template(
        "dashboard.html",
        reading_text=reading_text,
        download_url=download_url,
        pdf_url=pdf_url
    )

# ================== AUTH ==================
@app.route("/signup", methods=["POST"])
def signup_submit():
    username = request.form.get("username", "").strip()
    email    = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")
    confirm  = request.form.get("confirm", "")

    if not username or not email or not password:
        flash("กรอกข้อมูลให้ครบ", "error"); return redirect(url_for("signup_page"))
    if password != confirm:
        flash("รหัสผ่านไม่ตรงกัน", "error"); return redirect(url_for("signup_page"))
    if len(password) < 8:
        flash("รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร", "error"); return redirect(url_for("signup_page"))

    pwd_hash = generate_password_hash(password)
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("SELECT userID FROM user_login WHERE email=%s", (email,))
        if cur.fetchone():
            flash("อีเมลนี้ถูกใช้งานแล้ว", "warning")
            return redirect(url_for("signup_page"))

        cur.execute("""
            INSERT INTO user_login (username, email, password, role)
            VALUES (%s, %s, %s, %s)
        """, (username, email, pwd_hash, "Member"))
        conn.commit()

        flash("สมัครสมาชิกสำเร็จ! เข้าสู่ระบบได้เลย", "success")
        return redirect(url_for("login_page"))
    except mysql.connector.Error as e:
        flash(f"เกิดข้อผิดพลาดฐานข้อมูล: {e}", "error")
        return redirect(url_for("signup_page"))
    finally:
        try: cur.close(); conn.close()
        except: pass

@app.route("/login", methods=["POST"])
def login_submit():
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")

    try:
        conn = get_conn(); cur = conn.cursor(dictionary=True)
        cur.execute("SELECT userID, username, password, role FROM user_login WHERE email=%s", (email,))
        user = cur.fetchone()

        if not user or not check_password_hash(user["password"], password):
            flash("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "error")
            return redirect(url_for("login_page"))

        session["user_id"] = user["userID"]
        session["username"] = user["username"]
        session["role"] = user["role"]

        flash("เข้าสู่ระบบสำเร็จ", "success")
        return redirect(url_for("dashboard"))
    except mysql.connector.Error as e:
        flash(f"เกิดข้อผิดพลาดฐานข้อมูล: {e}", "error")
        return redirect(url_for("login_page"))
    finally:
        try: cur.close(); conn.close()
        except: pass

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))

# ================== APIs ==================
@app.route("/api/subjects", methods=["GET"])
def api_get_subjects():
    try:
        conn = get_conn(); cur = conn.cursor(dictionary=True)
        cur.execute("SELECT subjectID, subjectname FROM subject ORDER BY subjectname")
        rows = cur.fetchall()
        return jsonify(rows)
    finally:
        try: cur.close(); conn.close()
        except: pass

@app.route("/api/subjects", methods=["POST"])
def api_add_subject():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "กรอกชื่อวิชาก่อน"}), 400
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("INSERT INTO subject (subjectname) VALUES (%s)", (name,))
        conn.commit()
        return jsonify({"subjectID": cur.lastrowid, "subjectname": name}), 201
    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try: cur.close(); conn.close()
        except: pass

@app.route("/api/log", methods=["POST"])
def api_log_session():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    subjectID = data.get("subjectID")
    timer_min = data.get("timer")

    if not subjectID or timer_min in (None, ""):
        return jsonify({"error": "ข้อมูลไม่ครบ"}), 400

    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("""
            INSERT INTO dashboard (userID, subjectID, timer, Date)
            VALUES (%s, %s, %s, NOW())
        """, (session["user_id"], int(subjectID), int(timer_min)))
        conn.commit()
        return jsonify({"ok": True}), 201
    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try: cur.close(); conn.close()
        except: pass

@app.route("/api/logs", methods=["GET"])
def api_get_logs():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401
    try:
        conn = get_conn(); cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT d.Date, d.timer, s.subjectname
            FROM dashboard d
            LEFT JOIN subject s ON s.subjectID = d.subjectID
            WHERE d.userID=%s
            ORDER BY d.Date DESC
            LIMIT 50
        """, (session["user_id"],))
        return jsonify(cur.fetchall())
    finally:
        try: cur.close(); conn.close()
        except: pass
        
def get_user():
    return session.get("user_id", 1)

@app.route("/api/plans", methods=["GET"])
def list_plans():
    """ดึงแผนการอ่านทั้งหมดของ user"""
    uid = get_user()
    conn = get_conn(); cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT p.planID, p.planname, p.priority, p.dateplan, p.description,
               p.is_done, s.subjectname
        FROM plan p
        LEFT JOIN subject s ON p.subjectID=s.subjectID
        WHERE p.userID=%s
        ORDER BY p.dateplan ASC
    """, (uid,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify(rows)

@app.route("/api/plans", methods=["POST"])
def create_plan():
    """เพิ่มแผนใหม่"""
    uid = get_user()
    data = request.get_json() or {}
    planname = data.get("planname", "").strip()
    dateplan = data.get("dateplan")
    subjectID = data.get("subjectID")
    description = data.get("description", "").strip()
    priority = data.get("priority", "ปกติ")
    if not planname or not dateplan:
        return jsonify({"error": "ต้องใส่ชื่อแผนและวันที่"}), 400
    try:
        dt = datetime.fromisoformat(dateplan)
    except:
        return jsonify({"error": "รูปแบบวันที่ไม่ถูกต้อง"}), 400

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        INSERT INTO plan (userID, planname, priority, dateplan, subjectID, description, is_done)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
    """, (uid, planname, priority, dt, subjectID, description, 0))
    conn.commit()
    pid = cur.lastrowid
    cur.close(); conn.close()
    return jsonify({"ok": True, "planID": pid})

@app.route("/api/plans/<int:pid>", methods=["PUT"])
def update_plan(pid):
    """แก้ไขแผน"""
    uid = get_user()
    data = request.get_json() or {}
    fields, vals = [], []
    for col in ["planname","priority","description"]:
        if col in data: fields.append(f"{col}=%s"); vals.append(data[col])
    if "dateplan" in data:
        try:
            vals.append(datetime.fromisoformat(data["dateplan"]))
            fields.append("dateplan=%s")
        except:
            return jsonify({"error":"date format"}),400
    if "is_done" in data:
        vals.append(1 if data["is_done"] else 0)
        fields.append("is_done=%s")
    if "subjectID" in data:
        vals.append(data["subjectID"]); fields.append("subjectID=%s")
    if not fields:
        return jsonify({"error":"no update"}),400

    vals += [uid, pid]
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"UPDATE plan SET {','.join(fields)} WHERE userID=%s AND planID=%s", vals)
    conn.commit()
    ok = cur.rowcount
    cur.close(); conn.close()
    if not ok: return jsonify({"error":"not found"}),404
    return jsonify({"ok":True})

@app.route("/api/plans/<int:pid>", methods=["DELETE"])
def delete_plan(pid):
    """ลบแผน"""
    uid = get_user()
    conn = get_conn(); cur = conn.cursor()
    cur.execute("DELETE FROM plan WHERE userID=%s AND planID=%s",(uid,pid))
    conn.commit()
    ok=cur.rowcount
    cur.close(); conn.close()
    if not ok: return jsonify({"error":"not found"}),404
    return jsonify({"ok":True})
# ==================   ==================

# ================== RUN ==================
if __name__ == "__main__":
    # อย่าวาง route/ตั้งค่าเพิ่มเติมไว้ใต้บรรทัดนี้
    app.run(host="127.0.0.1", port=5000, debug=True)
# ================== APIs for Plan Management ==================
   