import os
import zipfile
from pathlib import Path

def create_deploy_zip():
    repo_root = Path("/home/gustavo/Documentos/BlockMiner 2.1")
    zip_path = repo_root / "deploy.zip"
    
    # Exclude patterns (simplified for this script)
    exclude_dirs = {
        "node_modules", "client/node_modules", "client/dist", 
        ".git", ".github", ".idea", ".vscode", "backups", "logs", ".deploy",
        "__pycache__", "scratch", "coverage"
    }
    exclude_files = {
        ".env", ".env.production", "deploy.zip", ".DS_Store"
    }
    
    print(f"Creating {zip_path}...")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(repo_root):
            rel_path = Path(root).relative_to(repo_root)
            
            # Skip excluded directories
            if any(str(rel_path).startswith(d) for d in exclude_dirs) or rel_path.name in exclude_dirs:
                dirs[:] = [] # don't visit subdirs
                continue
                
            for file in files:
                if file in exclude_files:
                    continue
                if file.endswith(".log"):
                    continue
                
                file_path = Path(root) / file
                arcname = file_path.relative_to(repo_root)
                try:
                    if file_path.exists():
                        zipf.write(file_path, arcname)
                except (FileNotFoundError, PermissionError):
                    print(f"Skipping: {arcname}")
                
    print(f"Done! {zip_path.stat().st_size / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    create_deploy_zip()
