import argparse
import os
import random
import shutil
from pathlib import Path


CLASS_NAMES = (
    "normal",
    "waterlogged",
    "infrastructure_damage",
    "submerged_vehicle",
    "severe_flood_damage",
)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def copy_or_link(source, destination):
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def split_counts(total, train_ratio, validation_ratio):
    train_count = int(total * train_ratio)
    validation_count = int(total * validation_ratio)
    return train_count, validation_count, total - train_count - validation_count


def main():
    parser = argparse.ArgumentParser(description="Create an 80/20 train/validation image split.")
    parser.add_argument("--source", type=Path, default=Path("dataset"))
    parser.add_argument("--output", type=Path, default=Path("dataset_split"))
    parser.add_argument("--train-ratio", type=float, default=0.8)
    parser.add_argument("--validation-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--copy", action="store_true", help="Copy images instead of moving them.")
    args = parser.parse_args()

    if not 0 < args.train_ratio < 1 or not 0 <= args.validation_ratio < 1:
        raise SystemExit("Ratios must satisfy 0 < train_ratio < 1 and 0 <= validation_ratio < 1")
    if args.train_ratio + args.validation_ratio != 1:
        raise SystemExit("Train and validation ratios must sum to 1")

    rng = random.Random(args.seed)
    operation = copy_or_link if args.copy else shutil.move
    totals = {split: 0 for split in ("train", "validation")}

    for class_name in CLASS_NAMES:
        images = [
            path for path in (args.source / class_name).rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        ]
        rng.shuffle(images)
        counts = split_counts(len(images), args.train_ratio, args.validation_ratio)
        start = 0

        for split, count in zip(("train", "validation"), counts[:2]):
            destination_dir = args.output / split / class_name
            destination_dir.mkdir(parents=True, exist_ok=True)
            for image_path in images[start:start + count]:
                operation(image_path, destination_dir / image_path.name)
                totals[split] += 1
            start += count

    print("Dataset split complete:")
    for split, count in totals.items():
        print(f"{split}: {count}")


if __name__ == "__main__":
    main()