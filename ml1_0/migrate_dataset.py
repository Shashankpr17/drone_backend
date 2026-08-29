import argparse
import csv
import hashlib
import os
import shutil
from pathlib import Path

from PIL import Image, ImageStat


CLASS_NAMES = (
    "normal",
    "waterlogged",
    "infrastructure_damage",
    "submerged_vehicle",
    "severe_flood_damage",
)
LABEL_TO_CLASS = {
    0: "normal",
    1: "waterlogged",
    2: "infrastructure_damage",
    3: "severe_flood_damage",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def is_invalid_image(path):
    try:
        with Image.open(path) as image:
            image = image.convert("RGB")
            image.verify()
        with Image.open(path) as image:
            stats = ImageStat.Stat(image.convert("RGB"))
            mean = sum(stats.mean) / 3
            variance = sum(stats.var) / 3
            return mean <= 2 or mean >= 253 or variance <= 2
    except Exception:
        return True


def find_image(source_root, image_name):
    preferred = source_root / "dataset" / "train" / "images" / image_name
    if preferred.is_file():
        return preferred

    matches = [
        path for path in source_root.rglob(image_name)
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    return matches[0] if matches else None


def main():
    parser = argparse.ArgumentParser(description="Migrate labeled images into class folders.")
    parser.add_argument("--labels", type=Path, default=Path("labels.csv"))
    parser.add_argument("--source-root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("dataset"))
    parser.add_argument("--clean", action="store_true", help="Remove existing images in destination class folders first.")
    args = parser.parse_args()

    if not args.labels.exists():
        raise SystemExit(f"Labels file not found: {args.labels}")

    for class_name in CLASS_NAMES:
        class_dir = args.output / class_name
        class_dir.mkdir(parents=True, exist_ok=True)
        if args.clean:
            for path in class_dir.iterdir():
                if path.is_file():
                    path.unlink()

    counts = {class_name: 0 for class_name in CLASS_NAMES}
    seen_hashes = set()
    missing = 0
    invalid = 0
    duplicates = 0
    unsupported_labels = 0

    with args.labels.open("r", newline="", encoding="utf-8") as labels_file:
        for row in csv.DictReader(labels_file):
            try:
                label = int(row["label"])
            except (KeyError, TypeError, ValueError):
                unsupported_labels += 1
                continue

            class_name = LABEL_TO_CLASS.get(label)
            if class_name is None:
                unsupported_labels += 1
                continue

            image_path = find_image(args.source_root, row.get("image", ""))
            if image_path is None:
                missing += 1
                continue
            if is_invalid_image(image_path):
                invalid += 1
                continue

            image_data = image_path.read_bytes()
            digest = hashlib.sha256(image_data).hexdigest()
            if digest in seen_hashes:
                duplicates += 1
                continue

            destination = args.output / class_name / f"{digest[:16]}_{image_path.name}"
            try:
                os.link(image_path, destination)
            except OSError:
                shutil.copy2(image_path, destination)
            seen_hashes.add(digest)
            counts[class_name] += 1

    print("Migration complete")
    for class_name in CLASS_NAMES:
        print(f"{class_name}: {counts[class_name]}")
    print(f"Total migrated: {sum(counts.values())}")
    print(f"Missing source images: {missing}")
    print(f"Corrupted/blank/monochrome skipped: {invalid}")
    print(f"Duplicates skipped: {duplicates}")
    print(f"Unsupported labels: {unsupported_labels}")

    if counts["submerged_vehicle"] == 0:
        print("WARNING: submerged_vehicle has no verified labels in the current labels.csv")


if __name__ == "__main__":
    main()