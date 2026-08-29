import json
import cv2
import numpy as np
from shapely import wkt

IMAGE_PATH = "dataset/train/images/guatemala-volcano_00000000_post_disaster.png"
LABEL_PATH = "dataset/train/labels/guatemala-volcano_00000000_post_disaster.json"

colors = {
    "no-damage": (0,255,0),
    "minor-damage": (0,255,255),
    "major-damage": (0,165,255),
    "destroyed": (0,0,255),
    "un-classified": (255,255,255)
}

img = cv2.imread(IMAGE_PATH)

with open(LABEL_PATH) as f:
    data = json.load(f)

for feature in data["features"]["xy"]:

    damage = feature["properties"]["subtype"]

    polygon = wkt.loads(feature["wkt"])

    pts = np.array(
        list(polygon.exterior.coords),
        np.int32
    )

    cv2.polylines(
        img,
        [pts],
        True,
        colors.get(damage,(255,255,255)),
        2
    )

cv2.imwrite("output.png",img)

print("Saved -> output.png")