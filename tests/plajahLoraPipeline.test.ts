import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plajahLoraRegistry, CURATED_FLUX_LORAS } from '../services/localAi/plajahLoraRegistry';
import { compileCinemaStillTask, compileComicPanelTask } from '../services/localAi/plajahPipelineEngine';
import { RECOMMENDED_MODELS } from '../services/localAi/localModelInstaller';

test('Plajah LoRA Registry: All curated FLUX LoRAs have permissive commercial licensing', () => {
  const loras = plajahLoraRegistry.getAllLoras();
  assert.equal(loras.length, 3);

  for (const lora of loras) {
    assert.equal(lora.commercialUseAllowed, true, `LoRA ${lora.id} must allow commercial use`);
    assert.equal(lora.license, 'Apache-2.0', `LoRA ${lora.id} must be Apache-2.0 licensed`);
    assert.equal(lora.baseModel, 'FLUX.2-Klein-4B', `LoRA ${lora.id} should target FLUX.2-Klein-4B`);
    assert.ok(lora.triggerWords.length >= 3, `LoRA ${lora.id} must have trigger words`);
    assert.ok(lora.vramOverheadMb <= 500, `LoRA ${lora.id} must fit 8GB RTX 4070 VRAM envelope`);
  }
});

test('Plajah LoRA Registry: Enriches user prompt with trigger words and configured weight', () => {
  const userPrompt = 'An ancient cybernetic scholar reading a stone tablet in an observatory';
  const result = plajahLoraRegistry.applyLoraToPrompt(userPrompt, 'flux_lora_cinematic_35mm', 0.85);

  assert.equal(result.activeWeight, 0.85);
  assert.ok(result.prompt.includes('cinematic film still'));
  assert.ok(result.prompt.includes('35mm photography'));
  assert.ok(result.prompt.includes(userPrompt));
});

test('Plajah Pipeline Engine: Compiles Cinema Still with FLUX.2 Klein 4B and 35mm LoRA', () => {
  const task = compileCinemaStillTask({
    prompt: 'A solitary astronaut looking out at Saturn rings',
    lens: 'anamorphic',
    lighting: 'chiaroscuro',
    loraId: 'flux_lora_cinematic_35mm',
  });

  assert.equal(task.modelId, 'flux2_klein_4b');
  assert.equal(task.taskType, 'cinema_still');
  assert.ok(task.steps >= 12, 'FLUX.2 Klein should use at least 12 steps');
  assert.ok(task.lora, 'LoRA payload should be attached');
  assert.equal(task.lora?.id, 'flux_lora_cinematic_35mm');
  assert.ok(task.prompt.includes('anamorphic'));
  assert.ok(task.prompt.includes('cinematic film still'));
});

test('Plajah Pipeline Engine: Compiles Manga Comic Panel with Manga Screentone LoRA', () => {
  const task = compileComicPanelTask({
    characterPrompt: 'Kaelen Ross with silver hair',
    sceneActionPrompt: 'Dodging laser fire across rain slicked rooftop',
    cameraShot: 'close_up',
    loraId: 'flux_lora_manga_screentone',
  });

  assert.equal(task.modelId, 'flux2_klein_4b');
  assert.equal(task.taskType, 'comic_panel');
  assert.ok(task.lora, 'LoRA payload should be attached');
  assert.equal(task.lora?.id, 'flux_lora_manga_screentone');
  assert.ok(task.prompt.includes('manga screentone'));
  assert.ok(task.prompt.includes('dynamic action lines'));
});

test('Plajah Pipeline Engine: Compiles Storybook Panel with Whimsical Watercolor LoRA', () => {
  const task = compileComicPanelTask({
    characterPrompt: 'A curious red fox wearing a woolen scarf',
    sceneActionPrompt: 'Finding a glowing acorn in the mossy hollow',
    cameraShot: 'medium',
    loraId: 'flux_lora_storybook_cartoon',
  });

  assert.equal(task.modelId, 'flux2_klein_4b');
  assert.equal(task.lora?.id, 'flux_lora_storybook_cartoon');
  assert.ok(task.prompt.includes('storybook illustration'));
  assert.ok(task.prompt.includes('soft watercolor wash'));
});

test('Model Package Registry: FLUX.2 Klein 4B, Qwen-Image 7B, Kokoro 82M, and Fish Speech 1.5 registered', () => {
  const klein = RECOMMENDED_MODELS.find(m => m.id === 'flux2_klein_4b');
  assert.ok(klein, 'flux2_klein_4b must be registered');
  assert.equal(klein?.category, 'cinema_stills');
  assert.equal(klein?.sizeGb, 4.2);
  assert.ok(klein?.vramRequiredGb <= 8.0, 'Must run within 8GB VRAM RTX 4070 limit');

  const qwen = RECOMMENDED_MODELS.find(m => m.id === 'qwen_image_7b');
  assert.ok(qwen, 'qwen_image_7b must be registered');
  assert.equal(qwen?.category, 'cinema_stills');
  assert.equal(qwen?.sizeGb, 5.1);

  const kokoro = RECOMMENDED_MODELS.find(m => m.id === 'kokoro_82m');
  assert.ok(kokoro, 'kokoro_82m must be registered in voice_dialogue');
  assert.equal(kokoro?.category, 'voice_dialogue');
  assert.equal(kokoro?.sizeGb, 0.35);

  const fish = RECOMMENDED_MODELS.find(m => m.id === 'fish_speech_15');
  assert.ok(fish, 'fish_speech_15 must be registered in voice_dialogue');
  assert.equal(fish?.category, 'voice_dialogue');
  assert.equal(fish?.sizeGb, 1.8);
});
