import os
import json
import torch
from torch.utils.data import Dataset
from PIL import Image

class XViewDataset(Dataset):

    def __init__(self, img_dir, label_dir):

        self.img_dir = img_dir
        self.label_dir = label_dir

        self.files = []

        for f in os.listdir(label_dir):
            if "_post_disaster.json" in f:
                self.files.append(f)

    def __len__(self):
        return len(self.files)

    def __getitem__(self, idx):

        label_file = self.files[idx]

        post_img = label_file.replace(".json",".png")

        img = Image.open(
            os.path.join(self.img_dir, post_img)
        ).convert("RGB")

        img = img.resize((224,224))

        return img