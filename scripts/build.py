#!/usr/bin/env python3
# scripts/build.py — Build Docker image and push to ECR
import base64
import os
import subprocess
import sys
import boto3

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_aws_account_id() -> str:
    return boto3.client('sts').get_caller_identity()['Account']


def make_image_name(project: str) -> str:
    return f"{project}-backend"


def get_ecr_login(region: str, account_id: str):
    ecr  = boto3.client('ecr', region_name=region)
    data = ecr.get_authorization_token(registryIds=[account_id])
    auth = data['authorizationData'][0]
    password = base64.b64decode(auth['authorizationToken']).decode().split(':')[1]
    return password, auth['proxyEndpoint']


def run(cmd: list[str], **kwargs):
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def main():
    region  = os.environ.get('AWS_REGION', 'us-east-1')
    project = os.environ.get('PROJECT_NAME', 'drug-discovery')

    account_id = get_aws_account_id()
    image_name = make_image_name(project)
    repo_url   = f"{account_id}.dkr.ecr.{region}.amazonaws.com/{image_name}"

    # ECR login
    password, endpoint = get_ecr_login(region, account_id)
    run(['docker', 'login', '--username', 'AWS', '--password-stdin', endpoint],
        input=password.encode())

    # Build for linux/amd64 (App Runner target) and push directly to ECR.
    # --platform is required when building on Apple Silicon.
    run(['docker', 'buildx', 'build',
         '--platform', 'linux/amd64',
         '-f', os.path.join(PROJECT_ROOT, 'backend', 'Dockerfile'),
         '-t', f'{repo_url}:latest',
         '--push',
         PROJECT_ROOT])
    print(f"\nPushed: {repo_url}:latest")


if __name__ == '__main__':
    main()
