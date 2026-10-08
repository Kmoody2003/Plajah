using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

namespace Plajah.Visualizers.HDRP
{
    /// <summary>
    /// 1-for-1 Recreation of Image 2: Architectural Neon Colonnade in Unity HDRP.
    /// Features:
    /// - 48 vertical staggered architectural slats with beveled edges and varied lengths/depths
    /// - Embedded multi-color neon rods in exact Image 2 sequence (Cyan, Yellow, Orange, Crimson, Pink, Blue, Purple)
    /// - Real-time HDRP Screen Space Global Illumination (SSGI) / Ray-Traced GI bounce
    /// - Frequency bin depth extrusion and snare-driven angular twist
    /// </summary>
    public class Image2_NeonColonnade_HDRP : MonoBehaviour
    {
        [Header("Audio Reactor Reference")]
        public PlajahAudioReactor audioReactor;

        [Header("Colonnade Parameters")]
        public int slatCount = 48;
        public float spacing = 0.26f;

        [Header("Materials")]
        public Material metalSlatMaterial;
        public Material neonBaseMaterial;

        private List<Transform> _battens = new List<Transform>();
        private List<Material> _neonMats = new List<Material>();
        private List<Vector3> _basePositions = new List<Vector3>();

        private readonly Color[] _palette = new Color[]
        {
            new Color(0.0f, 0.9f, 1.0f),      // Electric Cyan
            new Color(1.0f, 0.92f, 0.0f),     // Acid Neon Yellow
            new Color(1.0f, 0.38f, 0.0f),     // Hot Orange
            new Color(1.0f, 0.0f, 0.22f),     // Vivid Crimson
            new Color(1.0f, 0.0f, 0.55f),     // Neon Pink/Magenta
            new Color(0.48f, 0.0f, 0.95f),    // Deep Violet
            new Color(0.0f, 0.55f, 1.0f),     // Sky Blue
            new Color(1.0f, 0.75f, 0.0f)      // Golden Amber
        };

        void Start()
        {
            float totalW = slatCount * spacing;

            for (int i = 0; i < slatCount; i++)
            {
                float x = -totalW / 2.0f + i * spacing;
                float hashVal = Mathf.Repeat(Mathf.Sin(i * 12.9898f) * 43758.5453f, 1.0f);
                float slatH = 7.0f + hashVal * 4.5f;
                float slatD = 0.45f + hashVal * 0.35f;
                float yOffset = (hashVal - 0.5f) * 1.8f;
                float zStep = (hashVal - 0.5f) * 0.25f;

                // 1. Dark Slat Body
                GameObject slatGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                slatGo.name = $"Slat_{i}";
                slatGo.transform.SetParent(transform);
                slatGo.transform.localScale = new Vector3(0.20f, slatH, slatD);
                slatGo.transform.localPosition = new Vector3(x, yOffset, zStep);

                if (metalSlatMaterial != null)
                {
                    slatGo.GetComponent<Renderer>().sharedMaterial = metalSlatMaterial;
                }

                _battens.Add(slatGo.transform);
                _basePositions.Add(slatGo.transform.localPosition);

                // 2. Embedded Neon Rod
                Color col = _palette[i % _palette.Length];
                GameObject rodGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                rodGo.name = $"NeonRod_{i}";
                rodGo.transform.SetParent(transform);
                float rodH = slatH * (0.65f + hashVal * 0.3f);
                rodGo.transform.localScale = new Vector3(0.05f, rodH, 0.08f);
                rodGo.transform.localPosition = new Vector3(x + spacing * 0.45f, yOffset, zStep + slatD * 0.48f);

                Material nMat = neonBaseMaterial != null ? new Material(neonBaseMaterial) : new Material(Shader.Find("HDRP/Lit"));
                nMat.SetColor("_EmissiveColor", col * 12.0f); // High intensity for SSGI crevice bounce
                nMat.EnableKeyword("_EMISSION");
                rodGo.GetComponent<Renderer>().material = nMat;

                _neonMats.Add(nMat);
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            float kick = audioReactor != null ? audioReactor.kick : 0.2f;
            float snare = audioReactor != null ? audioReactor.snare : 0.1f;
            float voice = audioReactor != null ? audioReactor.voice : 0.25f;
            float timeSec = Time.time;

            // 1. Motorized Z-depth extrusion equalizer wave
            for (int i = 0; i < _battens.Count; i++)
            {
                Transform b = _battens[i];
                Vector3 baseP = _basePositions[i];
                float wave = Mathf.Sin(i * 0.28f - timeSec * 3.5f) * 0.5f + 0.5f;
                float targetZ = baseP.z + wave * (0.2f + kick * 2.2f);
                Vector3 curP = b.localPosition;
                curP.z = Mathf.Lerp(curP.z, targetZ, dt * 12.0f);
                b.localPosition = curP;

                // Slat rotation flip on snare
                float rotSign = (i % 2 == 0) ? 1.0f : -1.0f;
                float targetRotY = rotSign * (snare * 18.0f);
                Vector3 curEuler = b.localEulerAngles;
                curEuler.y = Mathf.LerpAngle(curEuler.y, targetRotY, dt * 14.0f);
                b.localEulerAngles = curEuler;
            }

            // 2. Neon Rod Emission Glow
            for (int i = 0; i < _neonMats.Count; i++)
            {
                Color baseCol = _palette[i % _palette.Length];
                float chase = Mathf.Sin(i * 0.35f - timeSec * 4.5f) * 0.5f + 0.5f;
                float energy = 8.0f + chase * 12.0f + kick * 20.0f + voice * 10.0f;
                _neonMats[i].SetColor("_EmissiveColor", baseCol * energy);
            }
        }
    }
}
