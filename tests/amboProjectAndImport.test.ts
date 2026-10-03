import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  type AmboProject,
  createDefaultProject,
  validateAmboProject,
  serializeAmboProject,
  deserializeAmboProject,
  countProjectSlides,
} from '../services/ambo/amboProjectModel';
import {
  exportProjectJson,
  exportProjectBundle,
  importProjectFile,
} from '../services/ambo/amboBundleService';
import {
  parseFreeShowJson,
  parsePowerPointBuffer,
} from '../services/ambo/amboImportService';
import { zipSync, strToU8 } from 'fflate';

describe('Ambo Project Model & Serialization', () => {
  it('creates default project with valid structure and schema', () => {
    const prj = createDefaultProject('Easter Service 2026', 'USER', 'user_123');
    assert.equal(prj.format, 'AMBO_PROJECT');
    assert.equal(prj.version, '1.0.0');
    assert.equal(prj.name, 'Easter Service 2026');
    assert.equal(prj.scope, 'USER');
    assert.equal(prj.ownerId, 'user_123');
    assert.ok(prj.shows.length > 0);
    assert.ok(prj.playlist.length > 0);
    assert.equal(prj.settings.aspectRatio, '16:9');
  });

  it('validates and heals project structure via validateAmboProject', () => {
    const raw = {
      format: 'AMBO_PROJECT',
      name: 'Sunday Morning',
      shows: [
        {
          id: 'show_1',
          title: 'Opening Song',
          kind: 'SONG',
          slides: [],
        },
      ],
    };
    const { valid, project } = validateAmboProject(raw);
    assert.equal(valid, true);
    assert.ok(project);
    assert.equal(project?.version, '1.0.0');
    assert.equal(project?.scope, 'USER');
    assert.ok(Array.isArray(project?.playlist));
  });

  it('accurately serializes and deserializes .amboprj without data loss', () => {
    const original = createDefaultProject('Midweek Prayer', 'ORGANIZATION', 'org_grace', 'org_grace', 'Grace Church');
    const jsonStr = serializeAmboProject(original);
    assert.ok(typeof jsonStr === 'string');

    const restored = deserializeAmboProject(jsonStr);
    assert.equal(restored.name, original.name);
    assert.equal(restored.scope, 'ORGANIZATION');
    assert.equal(restored.organizationId, 'org_grace');
    assert.equal(restored.organizationName, 'Grace Church');
    assert.equal(restored.shows.length, original.shows.length);
  });

  it('counts project slides accurately across all shows', () => {
    const prj = createDefaultProject('Test Count');
    const count = countProjectSlides(prj);
    assert.ok(count > 0);
  });
});

describe('Ambo Bundle (.amboz) Engine with fflate', () => {
  it('exports plain .amboprj JSON Blob', () => {
    const prj = createDefaultProject('Test JSON Export');
    const blob = exportProjectJson(prj);
    assert.equal(blob.type, 'application/json');
    assert.ok(blob.size > 100);
  });

  it('bundles project manifest and assets into .amboz ZIP archive', async () => {
    const prj = createDefaultProject('Bundle Test');
    // Add sample embedded data URI asset
    prj.shows[0].slides[0].layers.push({
      id: 'ly_test_asset',
      slot: 'background',
      content: {
        kind: 'IMAGE',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    });

    const bundleBlob = await exportProjectBundle(prj);
    assert.equal(bundleBlob.type, 'application/x-ambo-bundle');
    assert.ok(bundleBlob.size > 200);

    // Now test importing and extracting the bundle
    const arrayBuffer = await bundleBlob.arrayBuffer();
    const unpacked = await importProjectFile(arrayBuffer, 'service.amboz');
    assert.equal(unpacked.name, 'Bundle Test');
    assert.ok(unpacked.shows.length > 0);
  });
});

describe('Universal Presentation Importers', () => {
  it('parses FreeShow JSON format into Ambo Show with slide layers', () => {
    const freeShowData = {
      name: 'FreeShow Worship Anthem',
      category: 'Song',
      author: 'FreeShow Community',
      slides: [
        {
          group: 'Verse 1',
          color: '#00DAF3',
          items: [
            {
              type: 'text',
              lines: [{ text: 'Light of the world, You stepped down into darkness' }],
            },
          ],
        },
        {
          group: 'Chorus',
          color: '#FF8C00',
          items: [
            {
              type: 'text',
              lines: [{ text: 'Here I am to worship\nHere I am to bow down' }],
            },
          ],
        },
      ],
    };

    const show = parseFreeShowJson(JSON.stringify(freeShowData));
    assert.equal(show.title, 'FreeShow Worship Anthem');
    assert.equal(show.kind, 'SONG');
    assert.equal(show.slides.length, 2);
    assert.equal(show.slides[0].group, 'Verse 1');
    assert.equal(show.slides[0].layers[0].slot, 'slide');
    assert.equal(show.slides[0].layers[0].content.kind, 'TEXT');
    assert.equal((show.slides[0].layers[0].content as any).blocks[0].text, 'Light of the world, You stepped down into darkness');
  });

  it('parses PowerPoint (.pptx) OpenXML zip container', async () => {
    // Generate a minimal valid .pptx OpenXML structure in memory
    const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:t>Sermon Title Slide</a:t></a:p>
          <a:p><a:t>Subtitle - Grace and Truth</a:t></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:t>Point 1: The Foundation</a:t></a:p>
          <a:p><a:t>Key scripture: Matthew 7:24</a:t></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const zipFiles: Record<string, Uint8Array> = {
      'ppt/slides/slide1.xml': strToU8(slide1Xml),
      'ppt/slides/slide2.xml': strToU8(slide2Xml),
    };

    const pptxBuffer = zipSync(zipFiles).buffer;
    const show = await parsePowerPointBuffer(pptxBuffer, 'SundayMessage.pptx');

    assert.equal(show.title, 'SundayMessage');
    assert.equal(show.kind, 'PRESENTATION');
    assert.equal(show.slides.length, 2);
    assert.match((show.slides[0].layers[0].content as any).blocks[0].text, /Sermon Title Slide/);
    assert.match((show.slides[1].layers[0].content as any).blocks[0].text, /Point 1: The Foundation/);
  });
});
