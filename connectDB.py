import mysql.connector

def run_query(sql):
    """ฟังก์ชันรัน query แล้วคืนผลลัพธ์"""
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="จๅจภจถจุ",  # ใส่รหัสผ่านที่ถูกต้อง
            database="seminar"
        )

        cursor = conn.cursor()
        cursor.execute(sql)
        results = cursor.fetchall()
        return results

    except mysql.connector.Error as err:
        print("❌ Error:", err)
        return []

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals() and conn.is_connected():
            conn.close()

# 🔹 ตัวอย่างใช้งาน
print("ตาราง user_login:")
for row in run_query("SELECT * FROM user_login"):
    print(row)

print("\nตาราง dashboard:")
for row in run_query("SELECT * FROM dashboard"):
    print(row)

print("\nตาราง subject:")
for row in run_query("SELECT * FROM subject"):
    print(row)
print("\nตาราง plan:")
for row in run_query("SELECT * FROM plan"):
    print(row)

print("\nชื่อทุกตารางใน seminar:")
for row in run_query("SHOW TABLES"):
    print(row[0])
