import socket
import json
import time
import requests
from pymavlink import mavutil

UDP_IP = "0.0.0.0"
UDP_PORT = 14550
BACKEND_URL = "http://localhost:8000/api/v1/telemetry/mavlink"

print("============================================================")
print("📡 Sky Guardians — Universal Telemetry UDP Receiver")
print(f"🎧 Listening on udp:{UDP_IP}:{UDP_PORT} (Supports MAVLink & JSON)")
print(f"🌐 Forwarding to: {BACKEND_URL}")
print("============================================================")

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind((UDP_IP, UDP_PORT))
sock.settimeout(0.5)

mav = mavutil.mavlink.MAVLink(None)

lat = 0.0
lng = 0.0
alt = 0.0
battery = 0.0
yaw = 0.0
dist_wp = 0.0
vertical_speed = 0.0
dist_mav = 0.0

while True:
    try:
        data, addr = sock.recvfrom(4096)
        if not data:
            continue

        # Try parsing as JSON first (from Mission Planner direct UDP bridge)
        try:
            text = data.decode('utf-8').strip()
            if text.startswith('{') and text.endswith('}'):
                parsed = json.loads(text)
                requests.post(BACKEND_URL, json=parsed, timeout=0.8)
                print(f"⚡ Live UDP Telemetry -> Lat: {parsed.get('lat', 0):.6f}, Lng: {parsed.get('lng', 0):.6f}, Alt: {parsed.get('altitude', 0):.1f}m, Yaw: {parsed.get('yaw', 0):.1f}°, V.Speed: {parsed.get('verticalSpeed', 0):.2f}m/s, Batt: {parsed.get('battery', 0):.0f}%")
                continue
        except Exception:
            pass

        # Parse as raw MAVLink packet
        try:
            msgs = mav.parse_buffer(data)
            if msgs:
                for msg in msgs:
                    mtype = msg.get_type()
                    if mtype == 'GLOBAL_POSITION_INT':
                        lat = msg.lat / 1e7
                        lng = msg.lon / 1e7
                        alt = msg.relative_alt / 1000.0
                        vertical_speed = -(msg.vz / 100.0)
                        yaw = msg.hdg / 100.0
                    elif mtype == 'SYS_STATUS':
                        battery = float(msg.battery_remaining)
                    elif mtype == 'NAV_CONTROLLER_OUTPUT':
                        dist_wp = float(msg.wp_dist)
                        dist_mav = float(msg.target_bearing)
                    elif mtype == 'VFR_HUD':
                        if vertical_speed == 0.0:
                            vertical_speed = float(msg.climb)
                        if yaw == 0.0:
                            yaw = float(msg.heading)
                        if alt == 0.0:
                            alt = float(msg.alt)

                payload = {
                    "lat": round(lat, 6),
                    "lng": round(lng, 6),
                    "altitude": round(alt, 2),
                    "battery": round(battery, 1),
                    "yaw": round(yaw, 2),
                    "distToWP": round(dist_wp, 2),
                    "verticalSpeed": round(vertical_speed, 2),
                    "distToMAV": round(dist_mav, 2),
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                }
                requests.post(BACKEND_URL, json=payload, timeout=0.8)
                print(f"⚡ MAVLink -> Lat: {lat:.6f}, Lng: {lng:.6f}, Alt: {alt:.1f}m, Yaw: {yaw:.1f}°, Batt: {battery:.0f}%")
        except Exception:
            pass

    except socket.timeout:
        pass
    except Exception as e:
        time.sleep(0.05)
