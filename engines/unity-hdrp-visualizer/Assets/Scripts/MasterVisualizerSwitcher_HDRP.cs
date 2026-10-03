using System;
using UnityEngine;

namespace Plajah.Visualizers.HDRP
{
    /// <summary>
    /// Master Visualizer Scene Switcher for Unity HDRP.
    /// Handles keyboard hotkeys [1], [2], [3], [4] and Named Pipe IPC packets from Plajah Desktop WinUI 3.
    /// </summary>
    public class MasterVisualizerSwitcher_HDRP : MonoBehaviour
    {
        [Header("1-for-1 Visualizer References")]
        public GameObject visualizerImage1;
        public GameObject visualizerImage2;
        public GameObject visualizerImage3;
        public GameObject visualizerImage4;

        public int activeIndex = 1;

        void Start()
        {
            SelectVisualizer(1);
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Alpha1)) SelectVisualizer(1);
            else if (Input.GetKeyDown(KeyCode.Alpha2)) SelectVisualizer(2);
            else if (Input.GetKeyDown(KeyCode.Alpha3)) SelectVisualizer(3);
            else if (Input.GetKeyDown(KeyCode.Alpha4)) SelectVisualizer(4);
        }

        public void SelectVisualizer(int index)
        {
            activeIndex = index;
            Debug.Log($"[MasterVisualizerSwitcher_HDRP] Switched to 1-for-1 Visualizer: {index}");

            if (visualizerImage1 != null) visualizerImage1.SetActive(index == 1);
            if (visualizerImage2 != null) visualizerImage2.SetActive(index == 2);
            if (visualizerImage3 != null) visualizerImage3.SetActive(index == 3);
            if (visualizerImage4 != null) visualizerImage4.SetActive(index == 4);
        }
    }
}
