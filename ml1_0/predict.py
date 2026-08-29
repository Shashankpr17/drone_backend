import argparse
import json
import os
from pathlib import Path
from PIL import Image, ImageStat

import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models import efficientnet_b0, mobilenet_v2


CLASS_NAMES_4 = {
	0: "normal",
	1: "waterlogged",
	2: "infrastructure_damage",
	3: "severe_flood_damage",
}

CLASS_NAMES_5 = {
	0: "normal",
	1: "waterlogged",
	2: "infrastructure_damage",
	3: "submerged_vehicle",
	4: "severe_flood_damage",
}

MODEL_CANDIDATES = [
	Path(__file__).parent / "skyguardians_damage_model.pth",
	Path(__file__).parent / "best_skyguardians_model.pth",
	Path("skyguardians_damage_model.pth"),
	Path("best_skyguardians_model.pth"),
]


def get_device():
	if torch.backends.mps.is_available():
		return torch.device("mps")
	if torch.cuda.is_available():
		return torch.device("cuda")
	return torch.device("cpu")


def load_model(device, model_path=None):
	target_path = None
	if model_path and Path(model_path).exists():
		target_path = Path(model_path)
	else:
		for cand in MODEL_CANDIDATES:
			if cand.exists():
				target_path = cand
				break

	if not target_path or not target_path.exists():
		raise FileNotFoundError(
			f"No damage model checkpoint found. Checked: {[str(c) for c in MODEL_CANDIDATES]}"
		)

	state_dict = torch.load(target_path, map_location=device, weights_only=False)
	if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
		state_dict = state_dict["model_state_dict"]

	# Check output classes from classifier weight shape
	classifier_key = "classifier.1.weight"
	num_classes = 4
	if classifier_key in state_dict:
		num_classes = state_dict[classifier_key].shape[0]

	class_names = CLASS_NAMES_5 if num_classes == 5 else CLASS_NAMES_4

	# Try EfficientNet-B0 first
	try:
		model = efficientnet_b0(weights=None)
		model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
		model.load_state_dict(state_dict)
		model.to(device)
		model.eval()
		return model, class_names, str(target_path)
	except Exception:
		# Fallback to MobileNetV2
		model = mobilenet_v2(weights=None)
		model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
		model.load_state_dict(state_dict)
		model.to(device)
		model.eval()
		return model, class_names, str(target_path)


def is_invalid_image(image):
	stats = ImageStat.Stat(image.convert("RGB"))
	mean = sum(stats.mean) / 3
	variance = sum(stats.var) / 3
	return mean <= 2 or mean >= 253 or variance <= 2


def predict_image(image_path: str, model_path=None, device=None):
	if device is None:
		device = get_device()
	model, class_names, loaded_path = load_model(device, model_path)

	transform = transforms.Compose([
		transforms.Resize((224, 224)),
		transforms.ToTensor(),
		transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
	])

	image = Image.open(image_path).convert("RGB")
	if is_invalid_image(image):
		return {
			"damage": "uncertain",
			"confidence": 0.0,
			"probabilities": {},
			"model": loaded_path,
		}

	image_tensor = transform(image).unsqueeze(0).to(device)

	with torch.no_grad():
		outputs = model(image_tensor)
		probabilities = torch.softmax(outputs, dim=1)[0]
		confidence, predicted_index = probabilities.max(dim=0)

	prob_dict = {
		class_names.get(i, f"class_{i}"): round(float(prob) * 100, 2)
		for i, prob in enumerate(probabilities)
	}

	predicted_class = class_names[predicted_index.item()]
	confidence_percentage = round(confidence.item() * 100, 2)

	return {
		"damage": predicted_class,
		"confidence": confidence_percentage,
		"probabilities": prob_dict,
		"model": loaded_path,
	}


def main():
	parser = argparse.ArgumentParser(
		description="Predict disaster damage from an image."
	)
	parser.add_argument("image_path", help="Path to the input image")
	parser.add_argument("--model", default=None, help="Path to the model .pth file")
	parser.add_argument("--json", action="store_true", help="Output results in JSON format")
	args = parser.parse_args()

	result = predict_image(args.image_path, args.model)

	if args.json:
		print(json.dumps(result, indent=2))
	else:
		print(f"Predicted Damage: {result['damage']}")
		print(f"Confidence: {result['confidence']:.2f}%")
		print(f"Probabilities: {result['probabilities']}")


if __name__ == "__main__":
	main()

