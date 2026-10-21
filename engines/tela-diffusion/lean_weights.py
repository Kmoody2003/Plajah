"""
Lean FLUX weights for 8 GB GPUs and memory-tight Windows hosts.

convert(repo)  — one-time, streaming: reads the diffusers repo tensor by tensor and writes <repo>/lean/ with
                 • transformer: every Linear inside the double/single blocks as fp8 e4m3 + a per-output-row scale
                   (embedders, modulation, norms and the output head stay bf16)
                 • text_encoder: only the decoder layers FLUX.2 reads (hidden states 9/18/27 → first 29 layers),
                   attention/MLP Linears fp8 + row scale, no lm_head
                 Peak memory is one tensor plus one ~1 GB output shard.
load_*(repo)   — builds the module on the meta device and assigns the lean tensors one at a time, so loading costs
                 roughly the lean size in RAM (Windows charges a whole mmap view to the commit limit, which is why
                 the stock loaders fail on a busy machine).

Row-scaled fp8 keeps each output channel's full dynamic range; plain fp8 casting crushes small weights into
subnormals.
"""

import json
import os
import shutil

import torch
import torch.nn as nn
import torch.nn.functional as F
from safetensors import safe_open
from safetensors.torch import save_file

FP8 = torch.float8_e4m3fn
FP8_MAX = 448.0
TE_KEEP_LAYERS = 29  # FLUX.2 reads text-encoder hidden states 9, 18, 27; 29 layers keeps index 27 un-normed
SHARD_BYTES = 1 << 30


class ScaledFP8Linear(nn.Module):
    """nn.Linear with fp8 weights and a bf16 per-output-row scale; dequantised per call in the input's dtype."""

    def __init__(self, in_features, out_features, bias=True):
        super().__init__()
        self.in_features, self.out_features = in_features, out_features
        self.weight = nn.Parameter(torch.empty(out_features, in_features, dtype=FP8, device="meta"), requires_grad=False)
        self.weight_scale = nn.Parameter(torch.empty(out_features, 1, dtype=torch.bfloat16, device="meta"), requires_grad=False)
        self.bias = nn.Parameter(torch.empty(out_features, dtype=torch.bfloat16, device="meta"), requires_grad=False) if bias else None

    def forward(self, x):
        w = self.weight.to(x.dtype) * self.weight_scale.to(x.dtype)
        return F.linear(x, w, None if self.bias is None else self.bias.to(x.dtype))


def _quant_rows(w):
    w = w.float()
    scale = (w.abs().amax(dim=1, keepdim=True) / FP8_MAX).clamp(min=1e-12)
    return (w / scale).clamp(-FP8_MAX, FP8_MAX).to(FP8), scale.to(torch.bfloat16)


def _is_quant_transformer(name, shape):
    return len(shape) == 2 and name.endswith(".weight") and name.startswith(("transformer_blocks.", "single_transformer_blocks."))


def _te_layer_index(name):
    parts = name.split(".")
    return int(parts[2]) if name.startswith("model.layers.") else None


def _is_quant_te(name, shape):
    return len(shape) == 2 and name.endswith(".weight") and (".self_attn." in name or ".mlp." in name) and not name.endswith("norm.weight")


def _shard_files(folder):
    idx = os.path.join(folder, [f for f in os.listdir(folder) if f.endswith(".index.json")][0]) if any(f.endswith(".index.json") for f in os.listdir(folder)) else None
    if idx:
        with open(idx) as f:
            return sorted({os.path.join(folder, v) for v in json.load(f)["weight_map"].values()})
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.endswith(".safetensors"))


class _ShardWriter:
    def __init__(self, out_dir):
        self.out_dir, self.buf, self.size, self.n, self.weight_map = out_dir, {}, 0, 0, {}
        os.makedirs(out_dir, exist_ok=True)

    def add(self, name, t):
        self.buf[name] = t.contiguous()
        self.size += t.numel() * t.element_size()
        if self.size >= SHARD_BYTES:
            self.flush()

    def flush(self):
        if not self.buf:
            return
        fn = f"lean-{self.n:05d}.safetensors"
        save_file(self.buf, os.path.join(self.out_dir, fn))
        self.weight_map.update({k: fn for k in self.buf})
        self.buf, self.size, self.n = {}, 0, self.n + 1

    def close(self):
        self.flush()
        with open(os.path.join(self.out_dir, "lean.index.json"), "w") as f:
            json.dump({"weight_map": self.weight_map}, f)


def _convert_component(src_dir, out_dir, keep, quant):
    w = _ShardWriter(out_dir)
    for shard in _shard_files(src_dir):
        with safe_open(shard, framework="pt") as f:
            for name in f.keys():
                if not keep(name):
                    continue
                t = f.get_tensor(name)
                if quant(name, t.shape):
                    q, s = _quant_rows(t)
                    w.add(name, q)
                    w.add(name[: -len("weight")] + "weight_scale", s)
                else:
                    w.add(name, t.to(torch.bfloat16) if t.is_floating_point() else t)
                del t
    w.close()


def lean_dir(repo):
    return os.path.join(repo, "lean")


def is_converted(repo):
    d = lean_dir(repo)
    return all(os.path.isfile(os.path.join(d, c, "lean.index.json")) for c in ("transformer", "text_encoder"))


def convert(repo):
    out = lean_dir(repo)
    tmp = out + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    # transformer
    _convert_component(os.path.join(repo, "transformer"), os.path.join(tmp, "transformer"), lambda n: True, _is_quant_transformer)
    shutil.copy(os.path.join(repo, "transformer", "config.json"), os.path.join(tmp, "transformer", "config.json"))
    # text encoder, truncated to the layers FLUX.2 reads
    def keep_te(n):
        i = _te_layer_index(n)
        return not n.startswith("lm_head") and (i is None or i < TE_KEEP_LAYERS)
    _convert_component(os.path.join(repo, "text_encoder"), os.path.join(tmp, "text_encoder"), keep_te, _is_quant_te)
    with open(os.path.join(repo, "text_encoder", "config.json")) as f:
        cfg = json.load(f)
    cfg["num_hidden_layers"] = TE_KEEP_LAYERS
    cfg["max_window_layers"] = min(cfg.get("max_window_layers", TE_KEEP_LAYERS), TE_KEEP_LAYERS)
    if isinstance(cfg.get("layer_types"), list):
        cfg["layer_types"] = cfg["layer_types"][:TE_KEEP_LAYERS]
    with open(os.path.join(tmp, "text_encoder", "config.json"), "w") as f:
        json.dump(cfg, f, indent=2)
    shutil.rmtree(out, ignore_errors=True)
    os.replace(tmp, out)
    return out


def _swap_quant_linears(model, quant_names):
    for full in quant_names:
        mod_name = full[: -len(".weight")]
        parent_name, _, child = mod_name.rpartition(".")
        parent = model.get_submodule(parent_name) if parent_name else model
        old = getattr(parent, child)
        setattr(parent, child, ScaledFP8Linear(old.in_features, old.out_features, bias=old.bias is not None))


def _assign_from_lean(model, folder):
    with open(os.path.join(folder, "lean.index.json")) as f:
        weight_map = json.load(f)["weight_map"]
    quant = [n for n in weight_map if n.endswith(".weight") and n[: -len("weight")] + "weight_scale" in weight_map]
    _swap_quant_linears(model, quant)
    for shard in sorted(set(weight_map.values())):
        with safe_open(os.path.join(folder, shard), framework="pt") as f:
            for name in f.keys():
                mod_name, _, pname = name.rpartition(".")
                mod = model.get_submodule(mod_name)
                setattr(mod, pname, nn.Parameter(f.get_tensor(name), requires_grad=False))
    missing = [n for n, p in model.named_parameters() if p.is_meta]
    return missing


def load_transformer(repo):
    from diffusers import Flux2Transformer2DModel
    folder = os.path.join(lean_dir(repo), "transformer")
    with torch.device("meta"):
        model = Flux2Transformer2DModel.from_config(Flux2Transformer2DModel.load_config(folder))
    missing = _assign_from_lean(model, folder)
    if missing:
        raise RuntimeError(f"lean transformer missing {missing[:5]}")
    return model.eval()


def load_text_encoder(repo):
    from transformers import AutoConfig, Qwen3ForCausalLM
    folder = os.path.join(lean_dir(repo), "text_encoder")
    cfg = AutoConfig.from_pretrained(folder)
    cfg.torch_dtype = torch.bfloat16
    with torch.device("meta"):
        model = Qwen3ForCausalLM(cfg)
    missing = _assign_from_lean(model, folder)
    # lm_head is tied to the embeddings and never used (the pipeline reads hidden states only)
    model.lm_head.weight = model.model.embed_tokens.weight
    missing = [n for n in missing if not n.startswith("lm_head")]
    if missing:
        raise RuntimeError(f"lean text encoder missing {missing[:5]}")
    # non-persistent rotary buffers were created on meta; rebuild them for real
    rot_cls = type(model.model.rotary_emb)
    with torch.device("cpu"):
        model.model.rotary_emb = rot_cls(config=cfg)
    return model.eval()


if __name__ == "__main__":
    import sys
    print("lean weights ->", convert(sys.argv[1]))
