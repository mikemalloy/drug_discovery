#!/usr/bin/env python3
# scripts/destroy.py — tear down all AWS resources
import os
import subprocess

TERRAFORM_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'terraform')


def main():
    print("Destroying all AWS resources (this cannot be undone)...")
    subprocess.run(['terraform', 'destroy', '-auto-approve'],
                   check=True, cwd=TERRAFORM_DIR)
    print("All resources destroyed. AWS costs zeroed.")


if __name__ == '__main__':
    main()
