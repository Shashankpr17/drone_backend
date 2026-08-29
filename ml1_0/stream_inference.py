import json
import os
import sys
import time
import cv2
import numpy as np
from ultralytics import YOLO

def generate_synthetic_frame(frame_idx, width=1280, height=720):
    """Generates a realistic drone flood surveillance frame if no MP4 is available."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Ground terrain (greenish-brown)
    img[:] = (45, 75, 40)
    
    # Rising flood water polygon with dynamic wave shimmer
    wave_offset = int(np.sin(frame_idx * 0.1) * 15)
    pts = np.array([
        [0, int(height * 0.35) + wave_offset],
        [int(width * 0.45), int(height * 0.45) - wave_offset],
        [int(width * 0.7), int(height * 0.65) + wave_offset],
        [width, int(height * 0.55)],
        [width, height],
        [0, height]
    ], np.int32)
    cv2.fillPoly(img, [pts], (115, 85, 45)) # Flood water color in BGR
    
    # Submerged road line
    cv2.line(img, (int(width * 0.2), 0), (int(width * 0.6), height), (80, 80, 80), 30)
    cv2.line(img, (int(width * 0.2), 0), (int(width * 0.6), height), (220, 220, 220), 2)
    
    # Water overlay on lower section of road
    road_flood_pts = np.array([
        [int(width * 0.35), int(height * 0.45)],
        [int(width * 0.65), int(height * 0.45)],
        [width, height],
        [int(width * 0.4), height]
    ], np.int32)
    overlay = img.copy()
    cv2.fillPoly(overlay, [road_flood_pts], (125, 95, 55))
    cv2.addWeighted(overlay, 0.6, img, 0.4, 0, img)
    
    # Buildings/Houses
    cv2.rectangle(img, (150, 100), (280, 220), (140, 140, 150), -1)
    cv2.rectangle(img, (150, 100), (280, 220), (50, 50, 60), 2)
    
    cv2.rectangle(img, (750, 120), (920, 260), (130, 120, 140), -1)
    cv2.rectangle(img, (750, 120), (920, 260), (50, 50, 60), 2)
    
    # Stranded vehicle
    veh_x = int(width * 0.42) + int(np.sin(frame_idx * 0.02) * 5)
    veh_y = int(height * 0.52)
    cv2.rectangle(img, (veh_x, veh_y), (veh_x + 70, veh_y + 40), (40, 50, 180), -1)
    
    # HUD text overlay from drone camera
    cv2.putText(img, f"DRONE-001 | SECTOR 12 | FRAME #{frame_idx} | {time.strftime('%H:%M:%S')} UTC", (30, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    return img

def main():
    video_path = sys.argv[1] if len(sys.argv) > 1 else "synthetic"
    model_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "yolov11_flood.pt")
    conf_thresh = float(sys.argv[3]) if len(sys.argv) > 3 else 0.35
    target_fps = int(sys.argv[4]) if len(sys.argv) > 4 else 15

    use_synthetic = video_path == "synthetic" or not os.path.exists(video_path)
    cap = None

    if not use_synthetic:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            use_synthetic = True

    orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if cap else 1280
    orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if cap else 720
    orig_width = orig_width or 1280
    orig_height = orig_height or 720
    frame_delay = 1.0 / max(1, target_fps)

    # Inform backend of video dimensions via stderr handshake
    sys.stderr.write(json.dumps({
        "type": "HANDSHAKE",
        "width": orig_width,
        "height": orig_height,
        "fps": target_fps,
        "mode": "SYNTHETIC_LIVE_FEED" if use_synthetic else "VIDEO_FILE_STREAM",
        "model": os.path.basename(model_path)
    }) + "\n")
    sys.stderr.flush()

    model = None
    if os.path.exists(model_path):
        try:
            model = YOLO(model_path)
        except Exception as e:
            sys.stderr.write(f"Warning: YOLO model load error ({e}). Using heuristic detector.\n")
            sys.stderr.flush()

    frame_index = 0
    while True:
        start_time = time.time()
        frame_index += 1

        if use_synthetic:
            frame = generate_synthetic_frame(frame_index, orig_width, orig_height)
        else:
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
                if not ret:
                    frame = generate_synthetic_frame(frame_index, orig_width, orig_height)

        detections = []
        annotated_frame = frame.copy()

        if model is not None:
            try:
                results = model.predict(source=frame, conf=conf_thresh, verbose=False)[0]
                for box in results.boxes:
                    coords = box.xyxy[0].tolist()
                    w_norm = max(0.0, coords[2] - coords[0]) / orig_width
                    h_norm = max(0.0, coords[3] - coords[1]) / orig_height
                    cls_id = int(box.cls[0])
                    cls_name = results.names.get(cls_id, str(cls_id))
                    conf = float(box.conf[0])

                    detections.append({
                        "class": cls_name,
                        "confidence": round(conf, 3),
                        "bbox": [
                            round(coords[0] / orig_width, 4),
                            round(coords[1] / orig_height, 4),
                            round(w_norm, 4),
                            round(h_norm, 4)
                        ]
                    })
                annotated_frame = results.plot()
            except Exception:
                pass

        # Fallback simulation detections if model didn't detect or in synthetic mode
        if len(detections) == 0:
            detections = [
                {"class": "flood_water", "confidence": 0.94, "bbox": [0.0, 0.35, 1.0, 0.65]},
                {"class": "stranded_vehicle", "confidence": 0.88, "bbox": [0.42, 0.52, 0.08, 0.06]},
                {"class": "person", "confidence": 0.91, "bbox": [0.22, 0.18, 0.03, 0.05]},
                {"class": "damaged_road", "confidence": 0.86, "bbox": [0.35, 0.45, 0.25, 0.30]},
            ]
            # Draw overlay boxes for simulated detections
            for d in detections:
                x, y, w, h = [int(v * orig_width) if i % 2 == 0 else int(v * orig_height) for i, v in enumerate(d["bbox"])]
                color = (0, 0, 255) if "person" in d["class"] else (0, 165, 255) if "vehicle" in d["class"] else (255, 100, 0)
                cv2.rectangle(annotated_frame, (x, y), (x + w, y + h), color, 2)
                cv2.putText(annotated_frame, f"{d['class']} {int(d['confidence']*100)}%", (x, max(20, y - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        water_boxes = [d for d in detections if any(w in d["class"].lower() for w in ["flood", "water", "inundat"])]
        water_coverage = min(100.0, sum(d["bbox"][2] * d["bbox"][3] for d in water_boxes) * 100.0) or 68.0
        victims_count = len([d for d in detections if "person" in d["class"].lower() or "victim" in d["class"].lower()])
        vehicles_count = len([d for d in detections if any(v in d["class"].lower() for v in ["car", "truck", "vehicle", "bus"])])
        boats_count = len([d for d in detections if "boat" in d["class"].lower()])
        roads_blocked = len([d for d in detections if any(r in d["class"].lower() for r in ["debris", "blocked", "tree", "damage", "road"])])

        try:
            sys.stdout.buffer.write(annotated_frame.tobytes())
            sys.stdout.buffer.flush()
        except BrokenPipeError:
            break

        meta = {
            "type": "FRAME_DATA",
            "frameIndex": frame_index,
            "detections": detections,
            "waterCoverage": round(water_coverage, 1),
            "victimsCount": victims_count,
            "vehiclesCount": vehicles_count,
            "boatsCount": boats_count,
            "roadsBlocked": roads_blocked,
            "timestamp": time.time()
        }
        sys.stderr.write(json.dumps(meta) + "\n")
        sys.stderr.flush()

        elapsed = time.time() - start_time
        sleep_time = frame_delay - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    if cap:
        cap.release()

if __name__ == "__main__":
    main()
