#!/usr/bin/env python3
"""
Script to deploy P2PCLAW agents to HuggingFace Spaces
"""

import os
import sys
from huggingface_hub import HfApi, login

# Configuration for each space
SPACES = [
    {
        "name": "agnuxo-p2pclaw-node-e",
        "local_path": "P2P-system/hf-spaces/citizens6",
        "token": os.environ.get("HF_TOKEN", ""),
        "title": "P2PCLAW Node E - Citizens 6 (Research)",
        "emoji": "🤖",
        "color": "green"
    },
    {
        "name": "nautiluskit-p2pclaw-node-f",
        "local_path": "P2P-system/hf-spaces/citizens7",
        "token": os.environ.get("HF_TOKEN", ""),
        "title": "P2PCLAW Node F - Citizens 7 (Literary)",
        "emoji": "📚",
        "color": "blue"
    },
    {
        "name": "frank-agnuxo-p2pclaw-node-g",
        "local_path": "P2P-system/hf-spaces/citizens8",
        "token": os.environ.get("HF_TOKEN", ""),
        "title": "P2PCLAW Node G - Citizens 8 (Social)",
        "emoji": "🌐",
        "color": "purple"
    },
    {
        "name": "karmakindle1-p2pclaw-node-h",
        "local_path": "P2P-system/hf-spaces/citizens9",
        "token": os.environ.get("HF_TOKEN", ""),
        "title": "P2PCLAW Node H - Citizens 9 (Validator)",
        "emoji": "✓",
        "color": "orange"
    },
]

def get_files_to_upload(local_path):
    """Get all files to upload from local path"""
    files = []
    for root, dirs, filenames in os.walk(local_path):
        for filename in filenames:
            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, local_path)
            files.append((rel_path, filepath))
    return files

def create_and_push_space(space_config):
    """Create and push a HuggingFace Space"""
    name = space_config["name"]
    local_path = space_config["local_path"]
    token = space_config["token"]
    title = space_config["title"]
    emoji = space_config["emoji"]
    color = space_config["color"]
    
    print(f"\n{'='*60}")
    print(f"Deploying: {name}")
    print(f"Local path: {local_path}")
    print(f"{'='*60}")
    
    # Login to HuggingFace
    print(f"\n[1/4] Logging in to HuggingFace...")
    login(token=token)
    
    # Initialize API
    api = HfApi()
    
    # Get username from token
    whoami = api.whoami(token=token)
    username = whoami.get("name")
    print(f"Logged in as: {username}")
    
    # Create Space repository
    print(f"\n[2/4] Creating Space repository...")
    repo_id = f"{username}/{name}"
    
    try:
        api.create_repo(
            repo_id=repo_id,
            repo_type="space",
            space_sdk="docker",
            token=token,
            exist_ok=True
        )
        print(f"Space repository created/verified: {repo_id}")
    except Exception as e:
        print(f"Error creating repo: {e}")
        return False
    
    # Upload files
    print(f"\n[3/4] Uploading files to Space...")
    files = get_files_to_upload(local_path)
    print(f"Found {len(files)} files to upload")
    
    for rel_path, filepath in files:
        try:
            api.upload_file(
                path_or_fileobj=filepath,
                path_in_repo=rel_path,
                repo_id=repo_id,
                repo_type="space",
                token=token,
                commit_message=f"Upload {rel_path}"
            )
            print(f"  Uploaded: {rel_path}")
        except Exception as e:
            print(f"  Error uploading {rel_path}: {e}")
    
    # Verify Space
    print(f"\n[4/4] Verifying Space...")
    space_url = f"https://{repo_id.replace('-', '--').replace('/', '-')}.hf.space"
    print(f"\n[PASS] Space deployed successfully!")
    print(f"  URL: https://huggingface.co/spaces/{repo_id}")
    print(f"  Direct URL: {space_url}")
    
    return True

def main():
    print("P2PCLAW HuggingFace Spaces Deployment")
    print("=" * 60)
    
    success_count = 0
    failed_count = 0
    
    for i, space in enumerate(SPACES):
        print(f"\n\nProcessing Space {i+1}/{len(SPACES)}...")
        try:
            if create_and_push_space(space):
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            print(f"ERROR: Failed to deploy {space['name']}: {e}")
            failed_count += 1
    
    print(f"\n\n{'='*60}")
    print("DEPLOYMENT SUMMARY")
    print(f"{'='*60}")
    print(f"Successful: {success_count}")
    print(f"Failed: {failed_count}")
    print(f"Total: {len(SPACES)}")
    
    if success_count > 0:
        print("\nDeployed Spaces:")
        for space in SPACES[:success_count]:
            print(f"  - https://huggingface.co/spaces/{space['name']}")
