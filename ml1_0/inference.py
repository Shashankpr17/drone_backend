import json
import os
import sys
import cv2
import numpy as np
from ultralytics import YOLO

RELEVANT_CLASSES = {
    "person": ("Stranded Person", "victim"),
    "boat": ("Rescue Boat", "asset"),
    "car": ("Vehicle", "infrastructure"),
    "truck": ("Vehicle", "infrastructure"),
    "bus": ("Vehicle", "infrastructure"),
    "motorcycle": ("Vehicle", "infrastructure"),
}

def detect_flood_water_ratio(frame):
    """Calculates real water coverage percentage using refined HSV color segmentation."""
    try:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Actual water:
        # 1. Blue / Cyan water: H in [85, 135], S > 35, V > 35
        lower_blue = np.array([85, 35, 35])
        upper_blue = np.array([135, 255, 240])
        mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)

        # 2. Muddy flood water: H in [10, 25], S in [80, 255], V in [30, 160] (dark muddy silt, not bright dry sand)
        lower_muddy = np.array([10, 80, 30])
        upper_muddy = np.array([25, 255, 160])
        mask_muddy = cv2.inRange(hsv, lower_muddy, upper_muddy)

        water_mask = cv2.bitwise_or(mask_blue, mask_muddy)
        water_pixels = cv2.countNonZero(water_mask)
        total_pixels = frame.shape[0] * frame.shape[1]
        return round((water_pixels / max(1, total_pixels)) * 100.0, 1)
    except Exception:
        return 0.0

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"detections": [], "error": "Missing image path argument"}))
        sys.exit(1)

    image_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "data/uploads"
    model_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "yolov8m.pt")

    if not os.path.exists(image_path):
        print(json.dumps({"detections": [], "error": f"Image file not found: {image_path}"}))
        sys.exit(1)

    frame = cv2.imread(image_path)
    if frame is None:
        print(json.dumps({"detections": [], "error": f"Unable to read image: {image_path}"}))
        sys.exit(1)

    orig_h, orig_w = frame.shape[:2]
    water_coverage = detect_flood_water_ratio(frame)

    # Choose model
    actual_model_path = model_path
    if not os.path.exists(actual_model_path):
        actual_model_path = os.path.join(os.path.dirname(__file__), "yolov8m.pt")
    if not os.path.exists(actual_model_path):
        actual_model_path = os.path.join(os.path.dirname(__file__), "yolo11n.pt")

    detections = []
    try:
        model = YOLO(actual_model_path)
        results = model.predict(source=frame, conf=0.35, iou=0.45, verbose=False)[0]

        for box in results.boxes:
            coords = box.xyxy[0].tolist()
            cls_id = int(box.cls[0])
            raw_name = model.names.get(cls_id, "").lower()
            conf = float(box.conf[0])

            if raw_name in RELEVANT_CLASSES:
                display_label, det_type = RELEVANT_CLASSES[raw_name]
                w_norm = max(0.0, coords[2] - coords[0]) / orig_w
                h_norm = max(0.0, coords[3] - coords[1]) / orig_h

                detections.append({
                    "class": display_label,
                    "confidence": round(conf, 2),
                    "type": det_type,
                    "bbox": [
                        round(coords[0] / orig_w, 4),
                        round(coords[1] / orig_h, 4),
                        round(w_norm, 4),
                        round(h_norm, 4)
                    ]
                })
    except Exception as e:
        sys.stderr.write(f"YOLO inference error: {e}\n")

    victims_count = len([d for d in detections if d.get("type") == "victim" or "person" in d["class"].lower()])
    vehicles_count = len([d for d in detections if d.get("type") == "infrastructure" or "vehicle" in d["class"].lower()])
    boats_count = len([d for d in detections if d.get("type") == "asset" or "boat" in d["class"].lower()])

    print(json.dumps({
        "detections": detections,
        "waterCoverage": water_coverage,
        "victimsCount": victims_count,
        "vehiclesCount": vehicles_count,
        "boatsCount": boats_count,
        "roadsBlocked": 0
    }))

if __name__ == "__main__":
    main()