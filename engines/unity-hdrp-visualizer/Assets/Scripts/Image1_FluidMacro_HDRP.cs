using System;
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

namespace Plajah.Visualizers.HDRP
{
    /// <summary>
    /// 1-for-1 Recreation of Image 1: High-Speed Fluid Macro Impact in Unity HDRP.
    /// Features:
    /// - Concentric trochoidal ripples radiating from off-center impact (1.2, 0.8)
    /// - Central rising Worthington fluid jet column with detached spherical droplet
    /// - Dual-tone lighting (incandescent crimson key + cool slate fill)
    /// - HDRP Diffusion Profile Subsurface Scattering (SSS) on wave crests
    /// </summary>
    public class Image1_FluidMacro_HDRP : MonoBehaviour
    {
        [Header("Audio Reactor Reference")]
        public PlajahAudioReactor audioReactor;

        [Header("Basin Mesh")]
        public MeshFilter basinMeshFilter;
        public Material fluidDiffusionMaterial;

        [Header("Worthington Jet & Droplet")]
        public Transform worthingtonColumn;
        public Transform detachedDroplet;
        public Transform microDroplet;

        [Header("Dual-Tone Lighting")]
        public HDAdditionalLightData crimsonKeySpot;
        public HDAdditionalLightData slateFillLight;

        private Vector3[] _baseVertices;
        private Vector3[] _deformedVertices;
        private Mesh _deformedMesh;

        private Vector2 _impactOrigin = new Vector2(1.2f, 0.8f);
        private float _timeAccum = 0f;

        void Start()
        {
            if (basinMeshFilter != null && basinMeshFilter.sharedMesh != null)
            {
                _deformedMesh = Instantiate(basinMeshFilter.sharedMesh);
                _baseVertices = _deformedMesh.vertices;
                _deformedVertices = new Vector3[_baseVertices.Length];
                basinMeshFilter.mesh = _deformedMesh;
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            _timeAccum += dt;

            float kick = audioReactor != null ? audioReactor.kick : 0.2f;
            float voice = audioReactor != null ? audioReactor.voice : 0.25f;
            float snare = audioReactor != null ? audioReactor.snare : 0.1f;

            // 1. Trochoidal Wave Vertex Deformation
            if (_deformedMesh != null && _baseVertices != null)
            {
                float freq = 3.4f;
                float spd = 3.2f + voice * 1.5f;
                float amp = 0.26f * (1.0f + kick * 0.9f);

                for (int i = 0; i < _baseVertices.Length; i++)
                {
                    Vector3 v = _baseVertices[i];
                    Vector2 delta = new Vector2(v.x, v.z) - _impactOrigin;
                    float r = delta.magnitude;

                    float phase = r * freq - _timeAccum * spd;
                    float h = Mathf.Sin(phase) * amp / (1.0f + r * 0.35f);

                    // Trochoidal crest sharpening
                    float sharp = Mathf.Pow(Mathf.Max(0f, Mathf.Sin(phase * 1.8f)), 3f) * (amp * 0.45f) / (1.0f + r * 0.5f);
                    float crater = -Mathf.Exp(-r * r * 1.8f) * 0.5f * (1.0f + kick * 0.8f);

                    v.y = h + sharp + crater;
                    _deformedVertices[i] = v;
                }

                _deformedMesh.vertices = _deformedVertices;
                _deformedMesh.RecalculateNormals();
            }

            // 2. Worthington Fluid Column Dynamics
            if (worthingtonColumn != null)
            {
                float targetH = 1.0f + kick * 1.5f + Mathf.Sin(_timeAccum * 4.0f) * 0.15f;
                Vector3 curScale = worthingtonColumn.localScale;
                curScale.y = Mathf.Lerp(curScale.y, targetH, dt * 10f);
                worthingtonColumn.localScale = curScale;
                worthingtonColumn.localPosition = new Vector3(_impactOrigin.x, (1.6f * curScale.y) * 0.5f, _impactOrigin.y);
            }

            // 3. Detached Droplet Ballistic Suspension
            if (detachedDroplet != null && worthingtonColumn != null)
            {
                float dropY = 1.6f * worthingtonColumn.localScale.y + 0.35f + Mathf.Sin(_timeAccum * 5.0f) * 0.12f;
                Vector3 p = detachedDroplet.localPosition;
                p.y = Mathf.Lerp(p.y, dropY, dt * 12f);
                detachedDroplet.localPosition = p;
                detachedDroplet.localScale = Vector3.one * (1.0f + snare * 0.35f);
            }

            // 4. Dual-Tone HDRP Lighting Modulation
            if (crimsonKeySpot != null)
            {
                crimsonKeySpot.intensity = 80000f + kick * 150000f; // Lumens
            }
        }
    }
}
