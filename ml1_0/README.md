# ML Inference

This folder contains the YOLO inference worker and model used by the backend.

Install dependencies from the repository root:

```bash
python3 -m pip install -r ml/requirements.txt
```

The backend invokes `inference.py` for uploaded images and videos. Override the
model location with `YOLO_MODEL_PATH` when needed; the default is
`ml/yolov11_flood.pt`.
