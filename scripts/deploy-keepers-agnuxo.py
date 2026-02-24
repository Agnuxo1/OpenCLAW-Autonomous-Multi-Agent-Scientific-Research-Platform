#!/usr/bin/env python3
"""
Script to deploy P2PCLAW Agent Keeper Spaces to HuggingFace
HF Account: Agnuxo (using token provided by user)
"""

import os
import sys
from huggingface_hub import HfApi, login

# Configuration - Agnuxo account
HF_TOKEN = os.environ.get("HF_TOKEN", "")
if not HF_TOKEN:
    print("ERROR: HF_TOKEN environment variable not set")
    print("Please set your HuggingFace token: export HF_TOKEN=your_token_here")
    sys.exit(1)

# Define the keeper spaces to deploy
# Each space manages a batch of agents with different prefixes
KEEPER_SPACES = [
    {
        "name": "karmakindle1-p2pclaw-node-h",
        "agent_prefix": "keeper",
        "agent_count": 50,
        "description": "P2PCLAW Keeper - Agent batch H (keepers 1-50)"
    },
    {
        "name": "agnuxo-p2pclaw-keeper-i",
        "agent_prefix": "keeper-i",
        "agent_count": 50,
        "description": "P2PCLAW Keeper - Agent batch I (keeper-i 1-50)"
    },
    {
        "name": "agnuxo-p2pclaw-keeper-j",
        "agent_prefix": "keeper-j",
        "agent_count": 50,
        "description": "P2PCLAW Keeper - Agent batch J (keeper-j 1-50)"
    },
    {
        "name": "agnuxo-p2pclaw-keeper-k",
        "agent_prefix": "keeper-k",
        "agent_count": 50,
        "description": "P2PCLAW Keeper - Agent batch K (keeper-k 1-50)"
    }
]

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

def create_and_push_space(space_config):
    """Create and push a HuggingFace Space"""
    space_name = space_config["name"]
    agent_prefix = space_config["agent_prefix"]
    agent_count = space_config["agent_count"]
    
    print("\n" + "="*60)
    print(f"Deploying: {space_name}")
    print("="*60)
    print(f"Agent prefix: {agent_prefix}")
    print(f"Agent count: {agent_count}")
    print(f"Local path: {LOCAL_PATH}")
    
    # Login to HuggingFace
    print(f"\n[1/4] Logging in to HuggingFace...")
    try:
        login(token=HF_TOKEN)
        print("[OK] Logged in successfully")
    except Exception as e:
        print(f"[FAIL] Login failed: {e}")
        return False, None
    
    # Initialize API
    api = HfApi()
    
    # Get username from token
    try:
        whoami = api.whoami(token=HF_TOKEN)
        username = whoami.get("name")
        print(f"[OK] Logged in as: {username}")
    except Exception as e:
        print(f"[FAIL] Failed to get user info: {e}")
        return False, None
    
    # Create Space repository
    print(f"\n[2/4] Creating Space repository...")
    repo_id = f"{username}/{space_name}"
    
    try:
        api.create_repo(
            repo_id=repo_id,
            repo_type="space",
            space_sdk="docker",
            token=HF_TOKEN,
            exist_ok=True
        )
        print(f"[OK] Space repository created/verified: {repo_id}")
    except Exception as e:
        print(f"[FAIL] Error creating repo: {e}")
        return False, None
    
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
            print(f"  [OK] Uploaded: {rel_path}")
        except Exception as e:
            print(f"  [FAIL] Error uploading {rel_path}: {e}")
    
    # Set environment variables for the Space
    print(f"\n[4/4] Configuring Space environment variables...")
    try:
        # Update Space settings with environment variables
        api.upload_file(
            path_or_fileobj="# P2PCLAW HuggingFace Space - Agent Keeper\n".encode(),
            path_in_repo=".env",
            repo_id=repo_id,
            repo_type="space",
            token=HF_TOKEN,
            commit_message="Update environment configuration"
        )
        
        # Update the README with the correct Space URL
        readme_content = f"""---
title: P2PCLAW Agent Keeper - {agent_prefix}
emoji: 🤖
colorFrom: green
colorTo: yellow
sdk: docker
sdk_version: "latest"
pinned: false
---

# P2PCLAW HuggingFace Space - Agent Keeper

## Deployment Information

- **HF Space URL**: https://huggingface.co/spaces/{repo_id}
- **Space ID**: {repo_id.replace('-', '--').replace('/', '-')}.hf.space

## Agent Configuration

- **Agent Prefix**: {agent_prefix}
- **Agent Count**: {agent_count}
- **Agents**: {agent_prefix}-1 through {agent_prefix}-{agent_count}

## Environment Variables

Configure these in HF Space settings:

- `GATEWAY` - MCP server URL (default: https://p2pclaw-mcp-server-production.up.railway.app)
- `RELAY_NODE` - Gun.js relay URL (default: https://p2pclaw-relay-production.up.railway.app/gun)
- `AGENT_PREFIX` - Prefix for agent IDs (default: {agent_prefix})
- `AGENT_COUNT` - Number of agents (default: {agent_count})
- `HEARTBEAT_MS` - Heartbeat interval in ms (default: 5000)

## Running Locally

```bash
docker build -f P2P-system/hf-spaces/keeper-h/Dockerfile -t p2pclaw-keeper .
docker run -p 7860:7860 \\
  -e GATEWAY=https://p2pclaw-mcp-server-production.up.railway.app \\
  -e RELAY_NODE=https://p2pclaw-relay-production.up.railway.app/gun \\
  -e AGENT_PREFIX={agent_prefix} \\
  -e AGENT_COUNT={agent_count} \\
  p2pclaw-keeper
```

## Health Check

The container exposes port 7860 for HF Spaces health checks.
"""
        
        api.upload_file(
            path_or_fileobj=readme_content.encode(),
            path_in_repo="README.md",
            repo_id=repo_id,
            repo_type="space",
            token=HF_TOKEN,
            commit_message="Update README with Space info"
        )
        print("[OK] Environment configuration updated")
    except Exception as e:
        print(f"  Note: Could not update env vars via API: {e}")
        print("  Environment variables should be set manually in Space settings")
    
    # Space URL
    space_url = f"https://huggingface.co/spaces/{repo_id}"
    direct_url = f"https://{repo_id.replace('-', '--').replace('/', '-')}.hf.space"
    
    print(f"\n[OK] Deployment Complete for {space_name}!")
    print(f"  HF Space URL: {space_url}")
    print(f"  Direct URL: {direct_url}")
    
    return True, direct_url

def main():
    print("P2PCLAW Agent Keeper - HuggingFace Deployment")
    print("=" * 60)
    print(f"Account: Agnuxo")
    print(f"Token: {HF_TOKEN[:10]}...{HF_TOKEN[-4:]}")
    print(f"Spaces to deploy: {len(KEEPER_SPACES)}")
    
    deployed_urls = []
    
    for i, space_config in enumerate(KEEPER_SPACES):
        print(f"\n\n{'#'*60}")
        print(f"# Deploying Space {i+1}/{len(KEEPER_SPACES)}")
        print(f"{'#'*60}")
        
        success, direct_url = create_and_push_space(space_config)
        
        if success and direct_url:
            deployed_urls.append({
                "name": space_config["name"],
                "url": direct_url,
                "agents": f"{space_config['agent_prefix']}-1 to {space_config['agent_prefix']}-{space_config['agent_count']}"
            })
        else:
            print(f"\n[FAIL] Failed to deploy {space_config['name']}")
    
    # Summary
    print("\n\n" + "="*60)
    print("DEPLOYMENT SUMMARY")
    print("="*60)
    print(f"\nTotal spaces deployed: {len(deployed_urls)}/{len(KEEPER_SPACES)}")
    print("\nDeployed Spaces:")
    print("-"*60)
    
    for i, space in enumerate(deployed_urls, 1):
        print(f"{i}. {space['name']}")
        print(f"   URL: {space['url']}")
        print(f"   Agents: {space['agents']}")
        print()
    
    print("="*60)
    print("\nNOTE: Next Steps:")
    print("1. Visit each Space URL and configure environment variables:")
    print("   - GATEWAY=https://p2pclaw-mcp-server-production.up.railway.app")
    print("   - RELAY_NODE=https://p2pclaw-relay-production.up.railway.app/gun")
    print("2. The agents will automatically start heartbeating")
    print("3. Check p2pclaw.com to see agents online")
    print("="*60)
    
    if len(deployed_urls) == len(KEEPER_SPACES):
        print("\n==> All deployments successful!")
        return 0
    else:
        print(f"\nWARNING: {len(KEEPER_SPACES) - len(deployed_urls)} deployment(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
