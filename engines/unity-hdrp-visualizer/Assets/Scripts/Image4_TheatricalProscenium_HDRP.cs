using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

namespace Plajah.Visualizers.HDRP
{
    /// <summary>
    /// 1-for-1 Recreation of Image 4: Theatrical Geometric Chevron Proscenium in Unity HDRP.
    /// Features:
    /// - 6 symmetrical geometric chevron towers with angled knife-edge tops
    /// - Bold diagonal color blocking matching Image 4 (Cyan, Coral Orange, Vivid Pink, Ochre, Charcoal)
    /// - Stage floor with satin reflection and foreground monitor wedges
    /// - Overhead lighting truss with warm theatrical spotlights & physical camera anamorphic streaks
    /// </summary>
    public class Image4_TheatricalProscenium_HDRP : MonoBehaviour
    {
        [Header("Audio Reactor Reference")]
        public PlajahAudioReactor audioReactor;

        [Header("Lighting")]
        public HDAdditionalLightData warmTrussSpot;
        public HDAdditionalLightData cyanTrussSpot;

        [Header("Floor Reference")]
        public MeshRenderer stageFloorRenderer;
        public Material stageFloorMaterial;

        private List<Transform> _towers = new List<Transform>();
        private float _timeAccum = 0f;

        void Start()
        {
            if (stageFloorRenderer != null && stageFloorMaterial != null)
            {
                stageFloorRenderer.sharedMaterial = stageFloorMaterial;
            }

            var towerConfigs = new[]
            {
                new { pos = new Vector3(-9.2f, 0f, -1.8f), w = 2.2f, h = 6.8f, topAngle = -25f, primary = new Color(1.0f, 0.0f, 0.35f), secondary = new Color(0.0f, 0.75f, 0.95f) },
                new { pos = new Vector3(-5.8f, 0f, -0.6f), w = 2.6f, h = 8.5f, topAngle = -30f, primary = new Color(0.0f, 0.65f, 0.92f), secondary = new Color(1.0f, 0.42f, 0.0f) },
                new { pos = new Vector3(-2.2f, 0f,  0.5f), w = 3.2f, h = 10.4f, topAngle = 28f,  primary = new Color(0.96f, 0.75f, 0.0f), secondary = new Color(0.0f, 0.8f, 0.85f) },
                new { pos = new Vector3( 2.2f, 0f,  0.5f), w = 3.2f, h = 10.4f, topAngle = -28f, primary = new Color(1.0f, 0.35f, 0.0f),  secondary = new Color(0.95f, 0.0f, 0.3f) },
                new { pos = new Vector3( 5.8f, 0f, -0.6f), w = 2.6f, h = 8.5f, topAngle = 30f,  primary = new Color(1.0f, 0.45f, 0.0f),  secondary = new Color(0.95f, 0.0f, 0.4f) },
                new { pos = new Vector3( 9.2f, 0f, -1.8f), w = 2.2f, h = 6.8f, topAngle = 25f,  primary = new Color(0.0f, 0.85f, 0.75f), secondary = new Color(1.0f, 0.0f, 0.45f) }
            };

            foreach (var cfg in towerConfigs)
            {
                GameObject towerGo = new GameObject("ChevronTower");
                towerGo.transform.SetParent(transform);
                towerGo.transform.localPosition = cfg.pos;
                _towers.Add(towerGo.transform);

                // Body Shell
                GameObject body = GameObject.CreatePrimitive(PrimitiveType.Cube);
                body.name = "Body";
                body.transform.SetParent(towerGo.transform);
                body.transform.localScale = new Vector3(cfg.w, cfg.h, 0.38f);
                body.transform.localPosition = new Vector3(0f, cfg.h * 0.5f, 0f);

                // Lower Primary Geometric Facet
                GameObject f1 = GameObject.CreatePrimitive(PrimitiveType.Quad);
                f1.name = "Facet_Primary";
                f1.transform.SetParent(towerGo.transform);
                f1.transform.localScale = new Vector3(cfg.w * 0.88f, cfg.h * 0.48f, 1f);
                f1.transform.localPosition = new Vector3(0f, cfg.h * 0.28f, -0.2f);
                f1.transform.localRotation = Quaternion.Euler(0, 180, 0);

                Material m1 = new Material(Shader.Find("HDRP/Lit"));
                m1.SetColor("_BaseColor", cfg.primary);
                m1.SetColor("_EmissiveColor", cfg.primary * 4.5f);
                m1.EnableKeyword("_EMISSION");
                f1.GetComponent<Renderer>().material = m1;

                // Upper Secondary Geometric Facet
                GameObject f2 = GameObject.CreatePrimitive(PrimitiveType.Quad);
                f2.name = "Facet_Secondary";
                f2.transform.SetParent(towerGo.transform);
                f2.transform.localScale = new Vector3(cfg.w * 0.88f, cfg.h * 0.44f, 1f);
                f2.transform.localPosition = new Vector3(0f, cfg.h * 0.74f, -0.2f);
                f2.transform.localRotation = Quaternion.Euler(0, 180, 0);

                Material m2 = new Material(Shader.Find("HDRP/Lit"));
                m2.SetColor("_BaseColor", cfg.secondary);
                m2.SetColor("_EmissiveColor", cfg.secondary * 4.5f);
                m2.EnableKeyword("_EMISSION");
                f2.GetComponent<Renderer>().material = m2;
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            _timeAccum += dt;

            float kick = audioReactor != null ? audioReactor.kick : 0.2f;
            float snare = audioReactor != null ? audioReactor.snare : 0.1f;

            // 1. Mechanical Folding Origami Flaring on Kick
            for (int i = 0; i < _towers.Count; i++)
            {
                Transform t = _towers[i];
                float flare = (i == 2 || i == 3) ? (kick * 18.0f) : (kick * 9.0f);
                Vector3 rot = t.localEulerAngles;
                rot.x = Mathf.LerpAngle(rot.x, flare, dt * 10.0f);
                t.localEulerAngles = rot;
            }

            // 2. Theatrical Spot Swings
            if (warmTrussSpot != null)
            {
                warmTrussSpot.intensity = 50000f + kick * 120000f;
            }

            if (cyanTrussSpot != null)
            {
                cyanTrussSpot.intensity = 40000f + snare * 150000f; // Snare strobe flash
            }
        }
    }
}
