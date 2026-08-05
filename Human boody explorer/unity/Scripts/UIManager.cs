// ============================================================
//  UIManager.cs — Plajah Human Body Explorer (Unity)
//  Drives all UI panels: info panel, tabs, medical mode,
//  search, system selector sidebar.
// ============================================================

using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Plajah.BodyExplorer
{
    public class UIManager : MonoBehaviour
    {
        // ── Inspector: Panel References ──
        [Header("Root Panels")]
        public GameObject placeholderPanel;
        public GameObject infoPanel;
        public CanvasGroup infoPanelCanvasGroup;

        [Header("Info Panel — Header")]
        public TMP_Text organNameText;
        public TMP_Text medicalNameText;
        public Image    systemBadgeImage;
        public TMP_Text systemBadgeLabel;
        public TMP_Text organIconText;

        [Header("Info Panel — Tabs")]
        public Button[] tabButtons;         // Overview, Nutrition, Cellular, Conditions
        public GameObject[] tabPanels;

        [Header("Overview Tab")]
        public TMP_Text descriptionText;
        public TMP_Text functionText;
        public TMP_Text bloodFlowText;
        public TMP_Text fluidRoleText;
        public TMP_Text factText;

        [Header("Nutrition Tab")]
        public Transform vitaminsContainer;
        public Transform mineralsContainer;
        public GameObject nutrientItemPrefab;

        [Header("Cellular Tab")]
        public TMP_Text cellularProcessText;
        public Transform cellTypesContainer;
        public GameObject cellTypeItemPrefab;

        [Header("Conditions Tab")]
        public Transform conditionsContainer;
        public GameObject conditionItemPrefab;

        [Header("Medical Mode")]
        public Button   medicalModeButton;
        public TMP_Text medicalModeLabel;
        public Image    medicalModeIndicator;
        public Color    medicalModeOnColor  = new Color(0f, 0.83f, 1f);
        public Color    medicalModeOffColor = new Color(0.3f, 0.38f, 0.5f);

        [Header("System Sidebar")]
        public Transform systemListContainer;
        public GameObject systemButtonPrefab;

        [Header("Search")]
        public TMP_InputField searchInput;
        public Transform      searchResultsContainer;
        public GameObject     searchResultPrefab;
        public GameObject     searchResultsPanel;

        [Header("Sex Toggle")]
        public Button maleSexButton;
        public Button femaleSexButton;

        // ── Private State ──
        private bool        _medicalMode  = false;
        private string      _activeSex    = "both";
        private int         _activeTab    = 0;
        private OrganData   _currentOrgan;
        private SystemManager _systemManager;
        private BodyExplorer  _explorer;

        // ── Lifecycle ──
        void Awake()
        {
            _systemManager = FindObjectOfType<SystemManager>();
            _explorer      = FindObjectOfType<BodyExplorer>();
        }

        void Start()
        {
            SetupTabButtons();
            SetupMedicalModeButton();
            SetupSexButtons();
            SetupSearch();
            ShowPlaceholder();
        }

        // ── Setup ──
        void SetupTabButtons()
        {
            for (int i = 0; i < tabButtons.Length; i++)
            {
                int idx = i;
                tabButtons[i].onClick.AddListener(() => SelectTab(idx));
            }
        }

        void SetupMedicalModeButton()
        {
            medicalModeButton?.onClick.AddListener(ToggleMedicalMode);
            UpdateMedicalModeVisuals();
        }

        void SetupSexButtons()
        {
            maleSexButton?.onClick.AddListener(()   => SetSex("male"));
            femaleSexButton?.onClick.AddListener(()  => SetSex("female"));
        }

        void SetupSearch()
        {
            searchInput?.onValueChanged.AddListener(OnSearchChanged);
            searchInput?.onEndEdit.AddListener(_ => StartCoroutine(HideSearchResultsDelayed()));
            if (searchResultsPanel) searchResultsPanel.SetActive(false);
        }

        // ── Public API ──

        public void ShowPlaceholder()
        {
            if (placeholderPanel) placeholderPanel.SetActive(true);
            if (infoPanel)        infoPanel.SetActive(false);
            _currentOrgan = null;
        }

        public void ShowOrganInfo(OrganData data)
        {
            if (data == null) { ShowPlaceholder(); return; }
            _currentOrgan = data;

            if (placeholderPanel) placeholderPanel.SetActive(false);
            if (infoPanel)        infoPanel.SetActive(true);

            RefreshHeader();
            SelectTab(_activeTab);
            StartCoroutine(AnimatePanelIn());
        }

        public void ToggleMedicalMode()
        {
            _medicalMode = !_medicalMode;
            UpdateMedicalModeVisuals();
            if (_currentOrgan != null) ShowOrganInfo(_currentOrgan);
        }

        // ── Internal Rendering ──

        void RefreshHeader()
        {
            if (_currentOrgan == null) return;

            string displayName = _medicalMode ? _currentOrgan.medicalName : _currentOrgan.commonName;
            string subName     = _medicalMode ? _currentOrgan.commonName  : _currentOrgan.medicalName;

            if (organNameText)    organNameText.text    = displayName;
            if (medicalNameText)  medicalNameText.text  = subName;

            Color sysColor = _systemManager?.GetSystemColor(_currentOrgan.system) ?? Color.white;
            if (systemBadgeImage)  systemBadgeImage.color = sysColor;
            if (systemBadgeLabel)  systemBadgeLabel.text  = GetSystemLabel(_currentOrgan.system);
        }

        void SelectTab(int idx)
        {
            _activeTab = idx;

            // Highlight active tab button
            for (int i = 0; i < tabButtons.Length; i++)
            {
                if (tabButtons[i] == null) continue;
                var colors = tabButtons[i].colors;
                colors.normalColor = (i == idx)
                    ? new Color(0f, 0.83f, 1f, 0.15f)
                    : new Color(0, 0, 0, 0);
                tabButtons[i].colors = colors;
                var label = tabButtons[i].GetComponentInChildren<TMP_Text>();
                if (label) label.color = (i == idx) ? new Color(0f, 0.83f, 1f) : new Color(0.54f, 0.64f, 0.78f);
            }

            // Show correct panel
            for (int i = 0; i < tabPanels.Length; i++)
                if (tabPanels[i]) tabPanels[i].SetActive(i == idx);

            if (_currentOrgan == null) return;

            switch (idx)
            {
                case 0: RenderOverview();    break;
                case 1: RenderNutrition();   break;
                case 2: RenderCellular();    break;
                case 3: RenderConditions();  break;
            }
        }

        void RenderOverview()
        {
            if (_currentOrgan == null) return;
            string desc  = _medicalMode ? (_currentOrgan.medicalDescription ?? _currentOrgan.description) : _currentOrgan.description;
            if (descriptionText) descriptionText.text = desc;
            if (functionText)    functionText.text    = _currentOrgan.function;
            if (bloodFlowText)   bloodFlowText.text   = _currentOrgan.bloodFlow;
            if (fluidRoleText)   fluidRoleText.text   = _currentOrgan.fluidRole;
            if (factText)        factText.text        = _currentOrgan.interestingFact;
        }

        void RenderNutrition()
        {
            if (_currentOrgan == null) return;
            PopulateList(vitaminsContainer,  nutrientItemPrefab, _currentOrgan.vitamins);
            PopulateList(mineralsContainer,  nutrientItemPrefab, _currentOrgan.minerals);
        }

        void RenderCellular()
        {
            if (_currentOrgan == null) return;
            if (cellularProcessText) cellularProcessText.text = _currentOrgan.cellularProcess;
            PopulateCellTypes(cellTypesContainer, cellTypeItemPrefab, _currentOrgan.cellTypes);
        }

        void RenderConditions()
        {
            if (_currentOrgan == null) return;
            PopulateConditions(conditionsContainer, conditionItemPrefab, _currentOrgan.conditions);
        }

        // ── List Population ──

        void PopulateList(Transform container, GameObject prefab, NutrientEntry[] entries)
        {
            if (container == null || prefab == null) return;
            foreach (Transform child in container) Destroy(child.gameObject);
            if (entries == null) return;
            foreach (var entry in entries)
            {
                var obj   = Instantiate(prefab, container);
                var texts = obj.GetComponentsInChildren<TMP_Text>();
                if (texts.Length > 0) texts[0].text = entry.name;
                if (texts.Length > 1) texts[1].text = entry.role;
            }
        }

        void PopulateCellTypes(Transform container, GameObject prefab, CellTypeEntry[] entries)
        {
            if (container == null || prefab == null) return;
            foreach (Transform child in container) Destroy(child.gameObject);
            if (entries == null) return;
            foreach (var entry in entries)
            {
                var obj   = Instantiate(prefab, container);
                var texts = obj.GetComponentsInChildren<TMP_Text>();
                if (texts.Length > 0) texts[0].text = entry.name;
                if (texts.Length > 1) texts[1].text = entry.description;
            }
        }

        void PopulateConditions(Transform container, GameObject prefab, ConditionEntry[] entries)
        {
            if (container == null || prefab == null) return;
            foreach (Transform child in container) Destroy(child.gameObject);
            if (entries == null) return;
            foreach (var entry in entries)
            {
                var obj   = Instantiate(prefab, container);
                var texts = obj.GetComponentsInChildren<TMP_Text>();
                if (texts.Length > 0) texts[0].text = entry.name;
                if (texts.Length > 1) texts[1].text = entry.description;
            }
        }

        // ── Medical Mode ──

        void UpdateMedicalModeVisuals()
        {
            if (medicalModeLabel)    medicalModeLabel.text  = _medicalMode ? "Medical Mode ON" : "Medical Mode";
            if (medicalModeIndicator) medicalModeIndicator.color = _medicalMode ? medicalModeOnColor : medicalModeOffColor;
        }

        // ── Sex Toggle ──

        void SetSex(string sex)
        {
            _activeSex = sex;
            // Notify organ controllers / system manager to show/hide sex-specific organs
            var organs = FindObjectsOfType<OrganController>();
            foreach (var o in organs)
            {
                if (o.organData == null) continue;
                bool show = o.organData.sex == "both" || o.organData.sex == sex;
                o.gameObject.SetActive(show);
            }
        }

        // ── Search ──

        void OnSearchChanged(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                if (searchResultsPanel) searchResultsPanel.SetActive(false);
                return;
            }

            // Find matching organs
            var organs = FindObjectsOfType<OrganController>();
            var results = new List<OrganController>();
            foreach (var o in organs)
            {
                if (o.organData == null) continue;
                if (o.organData.commonName.ToLower().Contains(query.ToLower()) ||
                    o.organData.medicalName.ToLower().Contains(query.ToLower()))
                    results.Add(o);
            }

            PopulateSearchResults(results);
        }

        void PopulateSearchResults(List<OrganController> results)
        {
            if (searchResultsContainer == null || searchResultPrefab == null) return;
            foreach (Transform child in searchResultsContainer) Destroy(child.gameObject);

            if (results.Count == 0) { if (searchResultsPanel) searchResultsPanel.SetActive(false); return; }
            if (searchResultsPanel) searchResultsPanel.SetActive(true);

            foreach (var organ in results)
            {
                var obj  = Instantiate(searchResultPrefab, searchResultsContainer);
                var text = obj.GetComponentInChildren<TMP_Text>();
                if (text) text.text = organ.organData.commonName;
                var btn  = obj.GetComponent<Button>();
                if (btn)
                {
                    var captured = organ;
                    btn.onClick.AddListener(() => {
                        _explorer?.OnOrganSelected(captured);
                        if (searchInput) searchInput.text = "";
                        if (searchResultsPanel) searchResultsPanel.SetActive(false);
                    });
                }
            }
        }

        IEnumerator HideSearchResultsDelayed()
        {
            yield return new WaitForSeconds(0.2f);
            if (searchResultsPanel) searchResultsPanel.SetActive(false);
        }

        // ── Animations ──

        IEnumerator AnimatePanelIn()
        {
            if (infoPanelCanvasGroup == null) yield break;
            float elapsed = 0f, duration = 0.25f;
            infoPanelCanvasGroup.alpha = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                infoPanelCanvasGroup.alpha = Mathf.SmoothStep(0, 1, elapsed / duration);
                yield return null;
            }
            infoPanelCanvasGroup.alpha = 1f;
        }

        // ── Utilities ──

        string GetSystemLabel(string key) => key switch
        {
            "nervous"       => "Nervous System",
            "circulatory"   => "Circulatory System",
            "respiratory"   => "Respiratory System",
            "digestive"     => "Digestive System",
            "skeletal"      => "Skeletal System",
            "muscular"      => "Muscular System",
            "lymphatic"     => "Lymphatic System",
            "endocrine"     => "Endocrine System",
            "urinary"       => "Urinary System",
            "reproductive"  => "Reproductive System",
            "integumentary" => "Integumentary System",
            "sensory"       => "Sensory System",
            _               => key
        };
    }
}
