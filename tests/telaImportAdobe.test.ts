import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { writePsd } from 'ag-psd';
import { importPsdDocument } from '../services/tela/import/psdImport';
import { decodeLayerPixels } from '../services/tela/import/psdChannels';
import { importAiNative } from '../services/tela/import/aiNative';
import { importIndesignDocument } from '../services/tela/import/indesignImport';
import type { ImportEnv } from '../services/tela/import/types';

const memoryEnv = (): ImportEnv => ({
  putImage: async (im, name) => ({ src: `mem://${encodeURIComponent(name)}-${im.width}x${im.height}.png`, sessionOnly: true }),
  putBlob: async (_b, name) => `blob://${name}`,
  resolveFonts: async names => Object.fromEntries(names.map(n => [n, { requested: n, css: 'Inter, sans-serif', family: 'Inter', weight: 400, italic: false, status: 'library' as const }])),
});

test('PSD importer decodes multi-layer Photoshop files quickly without canvas throws', async () => {
  const bytes = new Uint8Array(writePsd({
    width: 64,
    height: 48,
    children: [
      {
        name: 'Background Fill',
        left: 0,
        top: 0,
        right: 64,
        bottom: 48,
        imageData: { width: 64, height: 48, data: new Uint8ClampedArray(64 * 48 * 4).fill(200) } as ImageData,
      },
      {
        name: 'Badge Text',
        text: { text: 'PLAJAH' },
      },
    ],
  }));

  const res = await importPsdDocument(bytes, { fileName: 'poster.psd', env: memoryEnv() });
  assert.equal(res.report.format, 'psd');
  assert.equal(res.pages.length, 1);
  assert.equal(res.pages[0].width, 64);
  assert.equal(res.pages[0].height, 48);
  assert.ok(res.pages[0].objects.length >= 1);
});

test('psdChannels handles truncated/malformed compressed buffers safely without RangeError', () => {
  const decoded = decodeLayerPixels({
    colorMode: 3,
    bitsPerChannel: 32,
    large: false,
    channels: [
      { id: 0, compression: 3, data: new Uint8Array([1, 2, 3]) },
      { id: 1, compression: 1, data: new Uint8Array([0, 4]) },
    ],
  }, 16, 16, {});
  assert.equal(decoded.width, 16);
  assert.equal(decoded.height, 16);
  assert.equal(decoded.data.length, 16 * 16 * 4);
});

test('Illustrator native .ai parser imports vector paths accurately', async () => {
  const sampleAi = [
    '%!PS-Adobe-3.0',
    '%%Creator: Adobe Illustrator(R) 24',
    '%AI3_Cropmarks: 0 0 400 300',
    '%AI5_BeginLayer',
    '1 (Shapes) Ln',
    '0 1 1 0 k',
    '20 20 m',
    '200 20 l',
    '200 180 l',
    '20 180 l',
    'f',
    '%AI5_EndLayer--',
  ].join('\n');

  const doc = await importAiNative(strToU8(sampleAi), { fileName: 'icon.ai', format: 'ai', env: memoryEnv() });
  assert.ok(doc);
  assert.equal(doc!.pages.length, 1);
  assert.equal(doc!.pages[0].width, 400);
  assert.equal(doc!.pages[0].height, 300);
  assert.ok(doc!.pages[0].objects.length >= 1);
});

test('InDesign .idml archive imports spreads, vector rectangles, swatches, and live TextFrames', async () => {
  const spreadXml = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Spread>
  <Spread Self="sp1">
    <Page Self="pg1" Name="Cover" ItemTransform="1 0 0 1 0 0" GeometricBounds="0 0 792 612" />
    <Rectangle Self="r1" Name="HeroCard" FillColor="Color/Brand" StrokeColor="Color/Black" StrokeWeight="2" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
        <PathPointType Anchor="36 36" LeftDirection="36 36" RightDirection="36 36"/>
        <PathPointType Anchor="300 36" LeftDirection="300 36" RightDirection="300 36"/>
        <PathPointType Anchor="300 200" LeftDirection="300 200" RightDirection="300 200"/>
        <PathPointType Anchor="36 200" LeftDirection="36 200" RightDirection="36 200"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
    </Rectangle>
    <TextFrame Self="tf1" ParentStory="st1" Name="HeadlineBox" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
        <PathPointType Anchor="48 240" LeftDirection="48 240" RightDirection="48 240"/>
        <PathPointType Anchor="400 240" LeftDirection="400 240" RightDirection="400 240"/>
        <PathPointType Anchor="400 320" LeftDirection="400 320" RightDirection="400 320"/>
        <PathPointType Anchor="48 320" LeftDirection="48 320" RightDirection="48 320"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
    </TextFrame>
  </Spread>
</idPkg:Spread>`;

  const storyXml = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Story>
  <Story Self="st1">
    <ParagraphStyleRange Justification="CenterAlign">
      <CharacterStyleRange PointSize="24" FontStyle="Bold" FillColor="Color/Brand">
        <Properties><AppliedFont type="string">Inter</AppliedFont></Properties>
        <Content>Issue #1 Cover</Content>
      </CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`;

  const graphicXml = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Graphic>
  <Color Self="Color/Brand" Space="RGB" ColorValue="212 0 85" />
</idPkg:Graphic>`;

  const archive = zipSync({
    'designmap.xml': strToU8('<Document/>'),
    'Resources/Graphic.xml': strToU8(graphicXml),
    'Spreads/Spread_sp1.xml': strToU8(spreadXml),
    'Stories/Story_st1.xml': strToU8(storyXml),
  });

  const imported = await importIndesignDocument(archive, { fileName: 'magazine.idml', env: memoryEnv() });
  assert.equal(imported.report.format, 'idml');
  assert.equal(imported.pages.length, 1);
  assert.equal(imported.pages[0].width, 816);
  assert.equal(imported.pages[0].height, 1056);
  assert.equal(imported.pages[0].objects.length, 2);
  const shape = imported.pages[0].objects.find(o => o.kind === 'PATH')!;
  const text = imported.pages[0].objects.find(o => o.kind === 'TEXT')!;
  assert.equal(shape.fill, '#d40055');
  assert.equal(text.text, 'Issue #1 Cover');
  assert.equal(text.textAlign, 'center');
});

test('InDesign binary .indd extracts embedded XMP preview thumbnails', async () => {
  const fakeJpegB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description><xmpTPg:NPages>1</xmpTPg:NPages><stDim:w>8.5</stDim:w><stDim:h>11</stDim:h><stDim:unit>Inches</stDim:unit><xmpGImg:image>${fakeJpegB64}</xmpGImg:image></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const header = new Uint8Array([0x06, 0x06, 0xed, 0xf5, 0xd8, 0x1d, 0x46, 0xe5]);
  const payload = strToU8(xmp);
  const combined = new Uint8Array(header.length + payload.length);
  combined.set(header, 0);
  combined.set(payload, header.length);

  const imported = await importIndesignDocument(combined, { fileName: 'brochure.indd', env: memoryEnv() });
  assert.equal(imported.report.format, 'indd');
  assert.equal(imported.pages.length, 1);
  assert.equal(imported.pages[0].width, 816);
  assert.equal(imported.pages[0].height, 1056);
  assert.ok(imported.pages[0].objects[0].sourceImageSrc?.startsWith('data:image/jpeg;base64,'));
});
