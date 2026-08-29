import argparse
from collections import Counter
from pathlib import Path


CLASS_NAMES = (
    "normal",
    "waterlogged",
    "infrastructure_damage",
    "submerged_vehicle",
    "severe_flood_damage",
)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def main():
    parser = argparse.ArgumentParser(description="Print image counts for dataset class folders.")
    parser.add_argument("--data-dir", type=Path, default=Path("dataset"))
    args = parser.parse_args()

    counts = Counter()
    total = 0
    for class_name in CLASS_NAMES:
        class_dir = args.data_dir / class_name
        count = sum(
            path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
            for path in class_dir.rglob("*")
        ) if class_dir.exists() else 0
        counts[class_name] = count
        total += count

    print(f"Dataset: {args.data_dir}")
    print(f"Total images: {total}")
    print("Class distribution:")
    for class_name in CLASS_NAMES:
        percentage = (counts[class_name] / total * 100) if total else 0.0
        print(f"{class_name}: {counts[class_name]} ({percentage:.2f}%)")


if __name__ == "__main__":
    main()