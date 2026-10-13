import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterSheet,
  createDefaultCharacter,
  saveCharacter,
  listSavedCharacters,
} from '../services/story/characterBible';
import { compileComicPanelTask } from '../services/localAi/plajahPipelineEngine';
import { plajahLoraRegistry } from '../services/localAi/plajahLoraRegistry';
import { plajahAudioCore } from '../services/voice/plajahAudioCore';

test('Character Bible: Creates and persists character likeness anchor', () => {
  const char = createDefaultCharacter(
    'Kaelen Ross',
    'athletic build, sharp jawline, short silver hair, mechanical ocular implant on right eye, weathered leather duster'
  );
  char.turnaroundUrls = {
    front: 'blob:http://localhost/kaelen_front.png',
    threeQuarter: 'blob:http://localhost/kaelen_3q.png',
    profile: 'blob:http://localhost/kaelen_prof.png',
    closeUp: 'blob:http://localhost/kaelen_close.png',
  };

  saveCharacter(char);

  const savedList = listSavedCharacters();
  const retrieved = savedList.find((c) => c.id === char.id);
  assert.ok(retrieved, 'Character should be saved in Character Bible');
  assert.equal(retrieved?.name, 'Kaelen Ross');
  assert.ok(retrieved?.turnaroundUrls.closeUp?.includes('kaelen_close.png'));
});

test('Cross-Panel Likeness Anchor: Retains identity anchor across 3 sequential comic panels', () => {
  const char = listSavedCharacters().find((c) => c.name === 'Kaelen Ross');
  assert.ok(char, 'Test character must exist');

  const panels = [
    { shot: 'establishing' as const, action: 'Surveying the neon rain from an observatory parapet' },
    { shot: 'medium' as const, action: 'Stepping forward into the flickering halogen light' },
    { shot: 'close_up' as const, action: 'Narrowing eyes as the ocular implant flashes cyan' },
  ];

  for (let i = 0; i < panels.length; i++) {
    const task = compileComicPanelTask({
      characterPrompt: `${char.name}: ${char.visualAnchor}`,
      faceEmbeddingRef: char.turnaroundUrls.closeUp,
      sceneActionPrompt: panels[i].action,
      cameraShot: panels[i].shot,
      moodLighting: 'neon noir lighting with rain reflections',
      aspect: '1:1',
    });

    assert.equal(task.taskType, 'comic_panel');
    assert.ok(task.prompt.includes('Kaelen Ross'), `Panel ${i + 1} must preserve character name`);
    assert.ok(task.prompt.includes('short silver hair'), `Panel ${i + 1} must retain silver hair anchor`);
    assert.ok(task.prompt.includes('mechanical ocular implant'), `Panel ${i + 1} must retain ocular implant`);
    assert.equal(task.identity?.characterRef, char.turnaroundUrls.closeUp, `Panel ${i + 1} must lock face embedding ref`);
    assert.equal(task.identity?.likenessStrength, 0.85, `Panel ${i + 1} likeness strength should be locked`);
  }
});

test('Character LoRA Cross-Panel Lock: Compiles FLUX.2 Klein panel with fine-tuned character LoRA', async () => {
  const char = listSavedCharacters().find((c) => c.name === 'Kaelen Ross');
  assert.ok(char);

  // Train/register character LoRA
  const trainRes = await plajahLoraRegistry.trainCharacterLora({
    characterId: char.id,
    characterName: char.name,
    triggerWord: 'kaelen_ross_char',
    turnaroundUrls: Object.values(char.turnaroundUrls).filter(Boolean) as string[],
    rank: 16,
    steps: 500,
  });

  assert.equal(trainRes.ok, true);
  assert.ok(trainRes.lora);

  // Compile comic panel targeting FLUX.2 Klein 4B with the newly trained LoRA
  const task = compileComicPanelTask({
    characterPrompt: `${char.name}: ${char.visualAnchor}`,
    faceEmbeddingRef: char.turnaroundUrls.closeUp,
    sceneActionPrompt: 'Drawing heavy arc pistol under shattered glass dome',
    cameraShot: 'low_angle_hero',
    loraId: trainRes.lora.id,
  });

  assert.equal(task.modelId, 'flux2_klein_4b');
  assert.equal(task.lora?.id, trainRes.lora.id);
  assert.ok(task.prompt.includes('kaelen_ross_char'), 'Trigger word must be injected into panel prompt');
  assert.ok(task.prompt.includes('consistent facial features'));
});

test('Character Dialogue Audio Binding: Synthesizes character speech bubble with correct persona', async () => {
  const speechBubbleText = 'Stay behind the bulkhead! The frequency pulse is discharging!';
  
  const take = await plajahAudioCore.synthesizeFabulaDialogue({
    text: speechBubbleText,
    speakerName: 'Kaelen Ross',
    emotion: 'urgent',
    takeIndex: 1,
    engine: 'kokoro',
  });

  assert.equal(take.speakerName, 'Kaelen Ross');
  assert.equal(take.emotion, 'urgent');
  assert.ok(take.durationSeconds > 0.5);
  assert.ok(take.audioBlob.size > 0);
  assert.ok(take.sceneSnapSeconds > take.durationSeconds, 'Scene snap must cradle vocal delivery');
});
