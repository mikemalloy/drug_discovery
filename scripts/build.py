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

    # Build from project root so Dockerfile can COPY checkpoint
    run(['docker', 'build',
         '-f', os.path.join(PROJECT_ROOT, 'backend', 'Dockerfile'),
         '-t', image_name,
         PROJECT_ROOT])

    # Tag and push
    run(['docker', 'tag', f'{image_name}:latest', f'{repo_url}:latest'])
    run(['docker', 'push', f'{repo_url}:latest'])
    print(f"\nPushed: {repo_url}:latest")


if __name__ == '__main__':
    main()
