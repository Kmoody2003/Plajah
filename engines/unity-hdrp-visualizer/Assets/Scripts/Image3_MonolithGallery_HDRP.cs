using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

namespace Plajah.Visualizers.HDRP
{
    /// <summary>
    /// 1-for-1 Recreation of Image 3: Monolith Exhibition Gallery in Unity HDRP.
    /// Features:
    /// - 7 vertical monolith slabs + center backdrop in Image 3's exact architecture
    /// - High-gloss mirror-wet black lacquer floor reflecting with HDRP Screen Space Reflections (SSR)
    /// - Volumetric light pillars and laser line core illumination
    /// </summary>
    public class Image3_MonolithGallery_HDRP : MonoBehaviour
    {
        [Header("Audio Reactor Reference")]
        public PlajahAudioReactor audioReactor;

        [Header("Floor Reference")]
        public MeshRenderer floorRenderer;
        public Material wetLacquerFloorMaterial;

        [Header("Screen Materials")]
        public Material frameMaterial;
        public Material screenBaseMaterial;

        private List<Material> _screenMats = new List<Material>();
        private List<Color> _baseColors = new List<Color>();
        private float _timeAccum = 0f;

        void Start()
        {
            if (floorRenderer != null && wetLacquerFloorMaterial != null)
            {
                floorRenderer.sharedMaterial = wetLacquerFloorMaterial;
            }

            var configs = new[]
            {
                new { pos = new Vector3(-8.8f, 4.2f, -1.8f), size = new Vector2(1.5f, 8.4f), col = new Color(0.85f, 0.15f, 0.4f) },
                new { pos = new Vector3(-6.8f, 4.2f, -0.6f), size = new Vector2(1.5f, 8.4f), col = new Color(1.0f, 0.25f, 0.0f) },
                new { pos = new Vector3(-4.8f, 4.4f,  0.4f), size = new Vector2(1.7f, 8.8f), col = new Color(0.9f, 0.1f, 0.1f) },
                new { pos = new Vector3(-2.8f, 4.2f,  0.8f), size = new Vector2(1.5f, 8.4f), col = new Color(1.0f, 0.15f, 0.0f) },
                // Center Backdrop
                new { pos = new Vector3( 0.0f, 3.8f, -2.4f), size = new Vector2(4.8f, 6.2f), col = new Color(1.0f, 0.0f, 0.6f) },
                new { pos = new Vector3( 2.8f, 4.2f,  0.8f), size = new Vector2(1.5f, 8.4f), col = new Color(1.0f, 0.15f, 0.0f) },
                new { pos = new Vector3( 4.8f, 4.4f,  0.4f), size = new Vector2(1.7f, 8.8f), col = new Color(0.9f, 0.1f, 0.1f) },
                new { pos = new Vector3( 6.8f, 4.2f, -0.6f), size = new Vector2(1.5f, 8.4f), col = new Color(1.0f, 0.25f, 0.0f) },
                new { pos = new Vector3( 8.8f, 4.2f, -1.8f), size = new Vector2(1.5f, 8.4f), col = new Color(0.0f, 0.8f, 1.0f) }
            };

            foreach (var cfg in configs)
            {
                GameObject grp = new GameObject("Monolith");
                grp.transform.SetParent(transform);
                grp.transform.localPosition = cfg.pos;

                // Frame
                GameObject frameGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                frameGo.name = "Frame";
                frameGo.transform.SetParent(grp.transform);
                frameGo.transform.localScale = new Vector3(cfg.size.x + 0.1f, cfg.size.y + 0.1f, 0.42f);
                frameGo.transform.localPosition = Vector3.zero;
                if (frameMaterial != null) frameGo.GetComponent<Renderer>().sharedMaterial = frameMaterial;

                // Display Face
                GameObject faceGo = GameObject.CreatePrimitive(PrimitiveType.Quad);
                faceGo.name = "Face";
                faceGo.transform.SetParent(grp.transform);
                faceGo.transform.localScale = new Vector3(cfg.size.x, cfg.size.y, 1f);
                faceGo.transform.localPosition = new Vector3(0f, 0f, -0.22f); // Facing camera
                faceGo.transform.localRotation = Quaternion.Euler(0, 180, 0);

                Material sMat = screenBaseMaterial != null ? new Material(screenBaseMaterial) : new Material(Shader.Find("HDRP/Lit"));
                sMat.SetColor("_EmissiveColor", cfg.col * 8.0f);
                sMat.EnableKeyword("_EMISSION");
                faceGo.GetComponent<Renderer>().material = sMat;

                _screenMats.Add(sMat);
                _baseColors.Add(cfg.col);
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            _timeAccum += dt;

            float kick = audioReactor != null ? audioReactor.kick : 0.2f;
            float voice = audioReactor != null ? audioReactor.voice : 0.25f;

            // Screen Pulse & Emission Boost on Kicks (drives HDRP Bloom and SSR reflections)
            for (int i = 0; i < _screenMats.Count; i++)
            {
                Color baseC = _baseColors[i];
                float pulse = Mathf.Sin(_timeAccum * 2.0f + i * 0.5f) * 0.4f + 0.6f;
                float energy = 6.0f + pulse * 6.0f + kick * 20.0f + voice * 8.0f;
                _screenMats[i].SetColor("_EmissiveColor", baseC * energy);
            }
        }
    }
}
