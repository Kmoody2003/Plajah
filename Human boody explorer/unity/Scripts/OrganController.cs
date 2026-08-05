// ============================================================
//  OrganController.cs — Plajah Human Body Explorer (Unity)
//  Attach to every organ GameObject in the scene.
//  Handles hover glow, click, selection, pulse animations.
// ============================================================

using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Plajah.BodyExplorer
{
    [RequireComponent(typeof(Collider))]
    public class OrganController : MonoBehaviour,
        IPointerEnterHandler, IPointerExitHandler, IPointerClickHandler
    {
        // ── Inspector ──
        [Header("Organ Data")]
        public OrganData organData;

        [Header("Visual Settings")]
        [Tooltip("All renderers belonging to this organ (can span multiple child objects)")]
        public Renderer[] organRenderers;

        [Tooltip("Highlight/glow color when hovered")]
        public Color hoverColor    = new Color(0f, 0.83f, 1f, 1f);   // cyan
        [Tooltip("Color when selected")]
        public Color selectedColor = new Color(1f, 0.7f, 0.1f, 1f);  // gold
        [Tooltip("Base emission intensity multiplier")]
        public float baseEmission  = 0f;
        public float hoverEmission = 1.2f;
        public float selectEmission = 2.0f;

        [Header("Pulse (for heart, lungs, etc.)")]
        public bool  doPulse       = false;
        public float pulseSpeed    = 1.2f;
        public float pulseAmount   = 0.04f;

        [Header("Tooltip")]
        public GameObject tooltipPrefab;

        // ── Private ──
        private BodyExplorer        _explorer;
        private SystemManager       _systemManager;
        private MaterialPropertyBlock _mpb;
        private Vector3             _originalScale;
        private bool                _isHovered;
        private bool                _isSelected;
        private GameObject          _tooltip;
        private Coroutine           _pulseCoroutine;

        static readonly int EmissionColorID = Shader.PropertyToID("_EmissionColor");
        static readonly int BaseColorID     = Shader.PropertyToID("_BaseColor");

        // ── Lifecycle ──
        void Awake()
        {
            _explorer      = FindObjectOfType<BodyExplorer>();
            _systemManager = FindObjectOfType<SystemManager>();
            _mpb           = new MaterialPropertyBlock();
            _originalScale = transform.localScale;

            // Auto-find renderers if not assigned
            if (organRenderers == null || organRenderers.Length == 0)
                organRenderers = GetComponentsInChildren<Renderer>();
        }

        void Start()
        {
            SetEmission(baseEmission, Color.black);
            if (doPulse) _pulseCoroutine = StartCoroutine(PulseRoutine());
        }

        // ── Pointer Events ──
        public void OnPointerEnter(PointerEventData eventData)
        {
            if (_isSelected) return;
            _isHovered = true;
            SetEmission(hoverEmission, hoverColor);
            ShowTooltip(eventData.position);
            _systemManager?.HighlightSystem(organData?.system);
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            if (_isSelected) return;
            _isHovered = false;
            SetEmission(baseEmission, Color.black);
            HideTooltip();
            _systemManager?.ClearHighlight();
        }

        public void OnPointerClick(PointerEventData eventData)
        {
            if (eventData.button != PointerEventData.InputButton.Left) return;
            _explorer?.OnOrganSelected(this);
        }

        // ── Selection ──
        public void Select()
        {
            _isSelected = true;
            _isHovered  = false;
            SetEmission(selectEmission, selectedColor);
            StartCoroutine(ScaleBounce(1.06f, 0.18f));
            HideTooltip();
        }

        public void Deselect()
        {
            _isSelected = false;
            _isHovered  = false;
            SetEmission(baseEmission, Color.black);
            transform.localScale = _originalScale;
        }

        // ── Visual Helpers ──
        void SetEmission(float intensity, Color color)
        {
            foreach (var rend in organRenderers)
            {
                if (rend == null) continue;
                rend.GetPropertyBlock(_mpb);
                _mpb.SetColor(EmissionColorID, color * intensity);
                rend.SetPropertyBlock(_mpb);
            }
        }

        IEnumerator ScaleBounce(float targetScale, float duration)
        {
            float elapsed = 0f;
            Vector3 startScale = transform.localScale;
            Vector3 peakScale  = _originalScale * targetScale;

            while (elapsed < duration * 0.5f)
            {
                elapsed += Time.deltaTime;
                transform.localScale = Vector3.Lerp(startScale, peakScale, elapsed / (duration * 0.5f));
                yield return null;
            }
            elapsed = 0f;
            while (elapsed < duration * 0.5f)
            {
                elapsed += Time.deltaTime;
                transform.localScale = Vector3.Lerp(peakScale, _originalScale, elapsed / (duration * 0.5f));
                yield return null;
            }
            transform.localScale = _originalScale;
        }

        IEnumerator PulseRoutine()
        {
            float t = Random.Range(0f, Mathf.PI * 2f); // randomize phase
            while (true)
            {
                t += Time.deltaTime * pulseSpeed;
                float s = 1f + Mathf.Sin(t) * pulseAmount;
                transform.localScale = _originalScale * s;
                yield return null;
            }
        }

        // ── Tooltip ──
        void ShowTooltip(Vector2 screenPos)
        {
            if (tooltipPrefab == null || organData == null) return;
            if (_tooltip == null)
                _tooltip = Instantiate(tooltipPrefab, FindObjectOfType<Canvas>().transform);

            _tooltip.SetActive(true);

            var label = _tooltip.GetComponentInChildren<TMPro.TMP_Text>();
            if (label != null)
                label.text = organData.commonName;

            // Position tooltip near cursor
            var rt = _tooltip.GetComponent<RectTransform>();
            if (rt != null) rt.anchoredPosition = screenPos + new Vector2(16, 16);
        }

        void HideTooltip()
        {
            if (_tooltip != null) _tooltip.SetActive(false);
        }

        void OnDestroy()
        {
            if (_tooltip != null) Destroy(_tooltip);
            if (_pulseCoroutine != null) StopCoroutine(_pulseCoroutine);
        }
    }

    // ── OrganData ScriptableObject ──────────────────────────────
    [CreateAssetMenu(fileName = "OrganData", menuName = "Plajah/OrganData")]
    public class OrganData : ScriptableObject
    {
        [Header("Identity")]
        public string id;
        public string commonName;
        public string medicalName;
        public string system;         // matches SystemManager system keys
        public string sex = "both";   // "both", "male", "female"
        public Color  systemColor = Color.white;

        [Header("Overview")]
        [TextArea(3, 6)] public string description;
        [TextArea(3, 6)] public string medicalDescription;
        [TextArea(2, 4)] public string function;
        [TextArea(2, 4)] public string interestingFact;

        [Header("Nutrition")]
        public NutrientEntry[] vitamins;
        public NutrientEntry[] minerals;

        [Header("Cellular")]
        [TextArea(3, 6)] public string cellularProcess;
        public CellTypeEntry[] cellTypes;

        [Header("Blood & Fluids")]
        [TextArea(2, 4)] public string bloodFlow;
        [TextArea(2, 4)] public string fluidRole;

        [Header("Conditions")]
        public ConditionEntry[] conditions;
    }

    [System.Serializable]
    public struct NutrientEntry
    {
        public string name;
        [TextArea(1, 3)] public string role;
    }

    [System.Serializable]
    public struct CellTypeEntry
    {
        public string name;
        [TextArea(1, 3)] public string description;
    }

    [System.Serializable]
    public struct ConditionEntry
    {
        public string name;
        [TextArea(1, 2)] public string description;
    }
}
