import json
import os
import sys
import time
import numpy as np

# Auto-install cv2 and ultralytics if missing
try:
    import cv2
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "--break-system-packages", "opencv-python-headless", "ultralytics"], capture_output=True)
    import cv2

try:
    from ultralytics import YOLO
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "--break-system-packages", "ultralytics"], capture_output=True)
    from ultralytics import YOLO

def detect_water_ratio(frame):
    try:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_brown = np.array([6, 25, 25])
        upper_brown = np.array([40, 255, 220])
        mask_brown = cv2.inRange(hsv, lower_brown, upper_brown)

        lower_blue = np.array([80, 20, 20])
        upper_blue = np.array([135, 255, 220])
        mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)

        water_mask = cv2.bitwise_or(mask_brown, mask_blue)
        water_pixels = cv2.countNonZero(water_mask)
        total_pixels = frame.shape[0] * frame.shape[1]
        return round((water_pixels / max(1, total_pixels)) * 100.0, 1)
    except Exception:
        return 0.0

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing input video path"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(input_path)[0] + "_annotated.mp4"
    model_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "yolov11_flood.pt")
    std_model_path = os.path.join(os.path.dirname(__file__), "yolo11n.pt")

    if not os.path.exists(input_path):
        print(json.dumps({"error": f"Video not found: {input_path}"}))
        sys.exit(1)

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(json.dumps({"error": f"Cannot open video: {input_path}"}))
        sys.exit(1)

    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 100

    # Target lightweight output dimensions for fast rendering
    out_w, out_h = 640, int(640 * (orig_h / orig_w))
    out_w = out_w if out_w % 2 == 0 else out_w + 1
    out_h = out_h if out_h % 2 == 0 else out_h + 1

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    # Use 10-15 fps for high-speed output rendering
    target_out_fps = min(15.0, fps)
    out = cv2.VideoWriter(output_path, fourcc, target_out_fps, (out_w, out_h))

    flood_model = None
    if os.path.exists(model_path):
        try:
            flood_model = YOLO(model_path)
        except Exception:
            pass

    std_model = None
    if os.path.exists(std_model_path):
        try:
            std_model = YOLO(std_model_path)
        except Exception:
            pass

    max_victims = 0
    max_water = 0.0
    all_detected_classes = set()

    # Smart frame stepping to limit processing to max 60 keyframes (instant < 3 sec)
    max_process_frames = 60
    step = max(1, total_frames // max_process_frames)

    frame_idx = 0
    saved_frames = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        if frame_idx % step != 0:
            continue

        saved_frames += 1
        resized = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)
        annotated = resized.copy()
        water_cov = detect_water_ratio(resized)
        max_water = max(max_water, water_cov)

        detections = []

        # YOLO Model inference
        yolo_active = flood_model or std_model
        if yolo_active is not None:
            try:
                res = yolo_active.predict(source=resized, conf=0.35, iou=0.45, imgsz=640, verbose=False)[0]
                for box in res.boxes:
                    coords = box.xyxy[0].tolist()
                    cls_id = int(box.cls[0])
                    name = yolo_active.names.get(cls_id, "").lower()
                    conf = float(box.conf[0])

                    if name in ["person", "boat", "car", "truck", "bus", "motorcycle"]:
                        lbl = "Stranded Person" if name == "person" else "Rescue Boat" if name == "boat" else "Vehicle"
                        det_type = "victim" if name == "person" else "asset" if name == "boat" else "infrastructure"
                        detections.append({
                            "label": lbl,
                            "conf": round(conf, 2),
                            "box": [int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3])],
                            "type": det_type
                        })
            except Exception:
                pass

        # Draw detections onto the frame
        for d in detections:
            x1, y1, x2, y2 = d["box"]
            color = (0, 0, 240) if d["type"] == "victim" else (240, 150, 0)
            all_detected_classes.add(d["label"])

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            text = f"{d['label']} {int(d['conf']*100)}%"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), color, -1)
            cv2.putText(annotated, text, (x1 + 3, y1 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        victims_in_frame = len([d for d in detections if d["type"] == "victim"])
        if victims_in_frame > max_victims:
            max_victims = victims_in_frame
            best_detections = [
                {
                    "class": d["label"],
                    "confidence": d["conf"],
                    "type": d["type"],
                    "bbox": [
                        round(d["box"][0] / out_w, 4),
                        round(d["box"][1] / out_h, 4),
                        round(max(0, d["box"][2] - d["box"][0]) / out_w, 4),
                        round(max(0, d["box"][3] - d["box"][1]) / out_h, 4),
                    ]
                }
                for d in detections
            ]

        # Draw HUD bar at bottom
        hud_bg = annotated.copy()
        cv2.rectangle(hud_bg, (0, out_h - 26), (out_w, out_h), (15, 15, 20), -1)
        cv2.addWeighted(hud_bg, 0.85, annotated, 0.15, 0, annotated)
        hud_text = f"YOLOv8 FLOOD AI | FRAME #{frame_idx}/{total_frames} | VICTIMS: {victims_in_frame} | WATER: {water_cov}%"
        cv2.putText(annotated, hud_text, (10, out_h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 255, 240), 1)

        out.write(annotated)

    cap.release()
    out.release()

    print(json.dumps({
        "success": True,
        "outputPath": output_path,
        "totalFrames": saved_frames,
        "maxVictims": max_victims,
        "peakWaterCoverage": max_water,
        "detectedClasses": list(all_detected_classes),
        "peakDetections": best_detections if 'best_detections' in locals() else []
    }))

if __name__ == "__main__":
    main()
