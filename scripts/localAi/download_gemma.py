import sys
from huggingface_hub import hf_hub_download

print("[INFO] Starting download of gemma-2-2b-it-Q4_K_M.gguf from bartowski/gemma-2-2b-it-GGUF...")
path = hf_hub_download(
    repo_id="bartowski/gemma-2-2b-it-GGUF",
    filename="gemma-2-2b-it-Q4_K_M.gguf",
    local_dir=r"D:\Plajah Models\llm",
    local_dir_use_symlinks=False
)
print(f"[SUCCESS] Download completed successfully to: {path}")
