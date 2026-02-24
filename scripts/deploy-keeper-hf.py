#!/usr/bin/env python3
"""
Script to deploy P2PCLAW Agent Keeper to HuggingFace Space
HF Account: KarmaKindle1
Space: karmakindle1-p2pclaw-node-h
"""

import os
import sys
from huggingface_hub import HfApi, login

# Configuration
HF_TOKEN = os.environ.get("HF_TOKEN", "")
if not HF_TOKEN:
    print("ERROR: HF_TOKEN environment variable not set")
    print("Please set your HuggingFace token: export HF_TOKEN=your_token_here")
    sys.exit(1)
SPACE_NAME = "karmakindle1-p2pclaw-node-h"
LOCAL_PATH = "P2P-system/hf-spaces/keeper-h"

def get_files_to_upload(local_path):
    """Get all files to upload from local path"""
    files = []
    for root, dirs, filenames in os.walk(local_path):
        for filename in filenames:
            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, local_path)
            files.append((rel_path, filepath))
    return files

def create_and_push_space():
    """Create and push the HuggingFace Space"""
    print("\n" + "="*60)
    print("Deploying P2PCLAW Agent Keeper to HuggingFace")
    print("="*60)
    print(f"\nSpace: {SPACE_NAME}")
    print(f"Local path: {LOCAL_PATH}")
    
    # Login to HuggingFace
    print(f"\n[1/4] Logging in to HuggingFace...")
    try:
        login(token=HF_TOKEN)
        print("✓ Logged in successfully")
    except Exception as e:
        print(f"✗ Login failed: {e}")
        return False
    
    # Initialize API
    api = HfApi()
    
    # Get username from token
    try:
        whoami = api.whoami(token=HF_TOKEN)
        username = whoami.get("name")
        print(f"✓ Logged in as: {username}")
    except Exception as e:
        print(f"✗ Failed to get user info: {e}")
        return False
    
    # Create Space repository
    print(f"\n[2/4] Creating Space repository...")
    repo_id = f"{username}/{SPACE_NAME}"
    
    try:
        api.create_repo(
            repo_id=repo_id,
            repo_type="space",
            space_sdk="docker",
            token=HF_TOKEN,
            exist_ok=True
        )
        print(f"✓ Space repository created/verified: {repo_id}")
    except Exception as e:
        print(f"✗ Error creating repo: {e}")
        return False
    
    # Upload files
    print(f"\n[3/4] Uploading files to Space...")
    files = get_files_to_upload(LOCAL_PATH)
    print(f"Found {len(files)} files to upload")
    
    for rel_path, filepath in files:
        try:
            api.upload_file(
                path_or_fileobj=filepath,
                path_in_repo=rel_path,
                repo_id=repo_id,
                repo_type="space",
                token=HF_TOKEN,
                commit_message=f"Upload {rel_path}"
            )
            print(f"  ✓ Uploaded: {rel_path}")
        except Exception as e:
            print(f"  ✗ Error uploading {rel_path}: {e}")
    
    # Space URL
    space_url = f"https://huggingface.co/spaces/{repo_id}"
    direct_url = f"https://{repo_id.replace('-', '--').replace('/', '-')}.hf.space"
    
    print(f"\n[4/4] Deployment Complete!")
    print("="*60)
    print(f"✓ Space deployed successfully!")
    print(f"  HF Space URL: {space_url}")
    print(f"  Direct URL: {direct_url}")
    print("="*60)
    
    print("\n📝 Configuration:")
    print("  The Space will manage 50 keeper agents by default")
    print("  (keeper-1 through keeper-50)")
    print("  Heartbeat interval: 5000ms (5 seconds)")
    print("\n  To customize agents, set these environment variables:")
    print("    AGENT_PREFIX=yourprefix")
    print("    AGENT_COUNT=100")
    print("    AGENT_IDS=agent1,agent2,agent3")
    
    return True

def main():
    print("P2PCLAW Agent Keeper - HuggingFace Deployment")
    print("=" * 60)
    
    success = create_and_push_space()
    
    if success:
        print("\n🎉 Deployment successful!")
        sys.exit(0)
    else:
        print("\n❌ Deployment failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
