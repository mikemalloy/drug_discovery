#!/usr/bin/env python3
# scripts/deploy.py — terraform apply + App Runner trigger + S3 frontend sync
import json
import os
import subprocess
import sys

SCRIPTS_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT  = os.path.dirname(SCRIPTS_DIR)
TERRAFORM_DIR = os.path.join(PROJECT_ROOT, 'terraform')
FRONTEND_OUT  = os.path.join(PROJECT_ROOT, 'frontend', 'out')


def run(cmd: list[str], cwd: str = None, capture: bool = False):
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=True, cwd=cwd,
                          capture_output=capture, text=capture)


def tf_output(key: str) -> str:
    result = run(['terraform', 'output', '-raw', key],
                 cwd=TERRAFORM_DIR, capture=True)
    return result.stdout.strip()


def main():
    region = os.environ.get('AWS_REGION', 'us-east-1')

    # Terraform init + apply
    run(['terraform', 'init'], cwd=TERRAFORM_DIR)
    run(['terraform', 'apply', '-auto-approve'], cwd=TERRAFORM_DIR)

    api_url = tf_output('api_url')
    print(f"\nAPI URL: {api_url}")

    # Sync frontend if built
    if os.path.isdir(FRONTEND_OUT):
        bucket = tf_output('frontend_bucket')
        run(['aws', 's3', 'sync', FRONTEND_OUT, f's3://{bucket}',
             '--delete', '--region', region])
        frontend_url = tf_output('frontend_url')
        print(f"Frontend URL: {frontend_url}")
    else:
        print(f"(Frontend not built — {FRONTEND_OUT} not found, skipping S3 sync)")

    print("\nDeployment complete.")
    print(f"  API: {api_url}/health")


if __name__ == '__main__':
    main()
