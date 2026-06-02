#!/usr/bin/env python3
"""
Merge LoRA adapter into base ChemBERTa and push to HuggingFace Hub.

Usage:
    python scripts/push_to_hub.py

Pushes to: mike-malloy/chemberta-tox21-multitarget
"""
import glob
import os

BASE_MODEL   = 'DeepChem/ChemBERTa-77M-MTR'
HF_REPO_ID   = 'mike-malloy/chemberta-tox21-multitarget'
NUM_TARGETS  = 12
TARGET_NAMES = [
    'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
    'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
    'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
]

checkpoints = sorted(glob.glob('chemberta-tox21-multitarget-*'))
if not checkpoints:
    raise FileNotFoundError("No chemberta-tox21-multitarget-* checkpoint found in current directory.")
MODEL_DIR = checkpoints[-1]
print(f"Checkpoint: {MODEL_DIR}")

print("Loading base model + LoRA adapter...")
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)

base = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL,
    num_labels=NUM_TARGETS,
    ignore_mismatched_sizes=True,
    attn_implementation='eager',
)
# Add label mappings
base.config.id2label = {i: name for i, name in enumerate(TARGET_NAMES)}
base.config.label2id = {name: i for i, name in enumerate(TARGET_NAMES)}
base.config.problem_type = "multi_label_classification"

model = PeftModel.from_pretrained(base, MODEL_DIR)
print("Merging LoRA weights into base model...")
model = model.merge_and_unload()
model.eval()

print(f"\nPushing to HuggingFace Hub: {HF_REPO_ID}")
print("(This may take a minute — uploading ~300MB merged model...)")

model.push_to_hub(
    HF_REPO_ID,
    private=False,
    commit_message="Add merged ChemBERTa multi-target toxicity classifier (Tox21, 12 targets)",
)
tokenizer.push_to_hub(
    HF_REPO_ID,
    private=False,
    commit_message="Add tokenizer",
)

print(f"\nDone! Model available at: https://huggingface.co/{HF_REPO_ID}")
print(f"\nLoad it in production with:")
print(f'  model = AutoModelForSequenceClassification.from_pretrained("{HF_REPO_ID}")')
print(f'  tokenizer = AutoTokenizer.from_pretrained("{HF_REPO_ID}")')
