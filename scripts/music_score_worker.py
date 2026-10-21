"""One offline GGUF composition request per process; exit releases GPU weights/KV cache."""
import json
import os
from pathlib import Path
import sys


def run(directory):
    from localAi.council_local_lane import wire_dlls, gpu_state
    wire_dlls()
    from llama_cpp import Llama
    request = json.loads((directory / 'request.json').read_text(encoding='utf8'))
    model = Path(request['model']).resolve(strict=True)
    if model.suffix.lower() != '.gguf' or not model.is_file():
        raise ValueError('A local GGUF score model is required')
    state = gpu_state()
    if not state or state['freeMb'] < model.stat().st_size / 2**20 + 1024:
        raise RuntimeError('Not enough free GPU memory for the score model and context; release other model workloads first')
    payload = request['payload']
    llm = Llama(model_path=str(model), n_gpu_layers=-1,
                n_ctx=payload['options']['num_ctx'], n_batch=256,
                n_threads=4, seed=payload['options']['seed'], verbose=False)
    try:
        response = llm.create_chat_completion(messages=payload['messages'],
                    max_tokens=payload['options']['num_predict'],
                    temperature=payload['options']['temperature'],
                    response_format={'type': 'json_object', 'schema': payload['format']})
        text = response['choices'][0]['message']['content']
        (directory / 'result.json').write_text(json.dumps({'message': {'content': text}}), encoding='utf8')
    finally:
        llm.close()


if __name__ == '__main__':
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    run(Path(sys.argv[1]).resolve(strict=True))
