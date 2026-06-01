// ============================================================
//  SystemManager.cs — Plajah Human Body Explorer (Unity)
//  Manages body system visibility, colors, and layer isolation.
// ============================================================

using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Plajah.BodyExplorer
{
    public class SystemManager : MonoBehaviour
    {
        [System.Serializable]
        public class BodySystem
        {
            public string    key;
            public string    label;
            public Color     color;
            public Transform root;           // parent transform holding all organ GameObjects for this system
            public bool      visibleByDefault = true;
        }

        [Header("System Definitions")]
        public BodySystem[] systems;

        [Header("Fade Settings")]
        public float dimAlpha      = 0.06f;
        public float transitionTime = 0.35f;

        private string _activeSystem = null;
        private Dictionary<string, BodySystem> _lookup;

        // ── Lifecycle ──
        void Awake()
        {
            _lookup = new Dictionary<string, BodySystem>();
            foreach (var s in systems)
                if (!string.IsNullOrEmpty(s.key))
                    _lookup[s.key] = s;
        }

        void Start() => ShowAllSystems();

        // ── Public API ──

        /// <summary>Toggle a system on/off (exclusive isolation mode).</summary>
        public void SelectSystem(string systemKey)
        {
            if (_activeSystem == systemKey)
            {
                _activeSystem = null;
                ShowAllSystems();
                return;
            }
            _activeSystem = systemKey;
            StartCoroutine(IsolateSystems(systemKey));
        }

        public void SelectSystemByIndex(int idx)
        {
            if (idx < 0 || idx >= systems.Length) return;
            SelectSystem(systems[idx].key);
        }

        public void ShowAllSystems()
        {
            _activeSystem = null;
            foreach (var s in systems)
            {
                if (s.root) StartCoroutine(FadeSystem(s.root, s.visibleByDefault ? 1f : 0f));
            }
        }

        public void HighlightSystem(string systemKey)
        {
            if (_activeSystem != null) return; // already in isolation mode
            foreach (var s in systems)
            {
                float target = (s.key == systemKey) ? 1f : 0.2f;
                if (s.root) StartCoroutine(FadeSystem(s.root, target));
            }
        }

        public void ClearHighlight()
        {
            if (_activeSystem != null) return;
            foreach (var s in systems)
                if (s.root) StartCoroutine(FadeSystem(s.root, 1f));
        }

        public Color GetSystemColor(string systemKey)
        {
            return _lookup.TryGetValue(systemKey, out var s) ? s.color : Color.white;
        }

        // ── Private ──
        IEnumerator IsolateSystems(string activeKey)
        {
            var tasks = new List<Coroutine>();
            foreach (var s in systems)
            {
                if (s.root == null) continue;
                float target = (s.key == activeKey) ? 1f : dimAlpha;
                tasks.Add(StartCoroutine(FadeSystem(s.root, target)));
            }
            yield return null;
        }

        IEnumerator FadeSystem(Transform systemRoot, float targetAlpha)
        {
            var renderers = systemRoot.GetComponentsInChildren<Renderer>(true);
            float elapsed = 0f;

            // Capture start alpha values
            var startAlphas = new float[renderers.Length];
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i].material.HasProperty("_BaseColor"))
                    startAlphas[i] = renderers[i].material.GetColor("_BaseColor").a;
                else
                    startAlphas[i] = 1f;
            }

            while (elapsed < transitionTime)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.SmoothStep(0, 1, elapsed / transitionTime);

                for (int i = 0; i < renderers.Length; i++)
                {
                    if (renderers[i] == null) continue;
                    var mat = renderers[i].material;
                    if (mat.HasProperty("_BaseColor"))
                    {
                        Color c = mat.GetColor("_BaseColor");
                        c.a = Mathf.Lerp(startAlphas[i], targetAlpha, t);
                        mat.SetColor("_BaseColor", c);
                        // Switch render mode for transparency
                        SetMaterialTransparency(mat, c.a < 0.99f);
                    }
                }
                yield return null;
            }
        }

        void SetMaterialTransparency(Material mat, bool transparent)
        {
            if (transparent)
            {
                mat.SetFloat("_Mode", 3);
                mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                mat.SetInt("_ZWrite", 0);
                mat.DisableKeyword("_ALPHATEST_ON");
                mat.EnableKeyword("_ALPHABLEND_ON");
                mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                mat.renderQueue = 3000;
            }
            else
            {
                mat.SetFloat("_Mode", 0);
                mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.One);
                mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.Zero);
                mat.SetInt("_ZWrite", 1);
                mat.DisableKeyword("_ALPHATEST_ON");
                mat.DisableKeyword("_ALPHABLEND_ON");
                mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                mat.renderQueue = -1;
            }
        }
    }
}
