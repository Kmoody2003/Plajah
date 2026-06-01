// ============================================================
//  BodyExplorer.cs — Plajah Human Body Explorer (Unity)
//  Main controller: camera, scene setup, input routing
//  Target: Unity 2022+ LTS, WebGL Build
// ============================================================

using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Plajah.BodyExplorer
{
    /// <summary>
    /// Master controller for the Plajah Human Body Explorer.
    /// Attach to a root GameObject named "BodyExplorer" in the scene.
    /// </summary>
    public class BodyExplorer : MonoBehaviour
    {
        // ── Inspector References ──
        [Header("Scene References")]
        [Tooltip("The root transform of the 3D body model")]
        public Transform bodyRoot;

        [Tooltip("Camera used for orbit/zoom")]
        public Camera mainCamera;

        [Tooltip("Reference to the UI manager")]
        public UIManager uiManager;

        [Tooltip("Reference to the system manager")]
        public SystemManager systemManager;

        [Header("Camera Settings")]
        public float orbitSpeed     = 200f;
        public float zoomSpeed      = 5f;
        public float minZoom        = 1.5f;
        public float maxZoom        = 12f;
        public float panSpeed       = 0.3f;
        public float smoothTime     = 0.08f;

        [Header("Body Settings")]
        public float autoRotateSpeed = 8f;
        public bool  autoRotate      = true;

        // ── Private State ──
        private float   _targetZoom;
        private float   _currentZoom;
        private float   _zoomVelocity;
        private Vector3 _targetEuler;
        private Vector3 _currentEuler;
        private Vector3 _eulerVelocity;

        private bool    _isDragging;
        private Vector3 _lastMousePos;

        private OrganController _selectedOrgan;
        private bool            _isAnimatingToOrgan;

        // Touch
        private float _lastPinchDistance;

        // ── Lifecycle ──
        void Awake()
        {
            if (mainCamera == null) mainCamera = Camera.main;
            _targetZoom  = _currentZoom = mainCamera.transform.localPosition.z;
            _targetEuler = _currentEuler = bodyRoot ? bodyRoot.eulerAngles : Vector3.zero;
        }

        void Start()
        {
            systemManager?.ShowAllSystems();
            uiManager?.ShowPlaceholder();
        }

        void Update()
        {
            HandleMouseInput();
            HandleTouchInput();
            HandleKeyboardShortcuts();
            SmoothCameraTransform();
            if (autoRotate && !_isDragging && _selectedOrgan == null)
                _targetEuler.y += autoRotateSpeed * Time.deltaTime;
        }

        // ── Input ──
        void HandleMouseInput()
        {
            // Ignore clicks over UI
            if (EventSystem.current != null && EventSystem.current.IsPointerOverGameObject()) return;

            // Left drag → orbit
            if (Input.GetMouseButtonDown(0))
            {
                _isDragging  = true;
                _lastMousePos = Input.mousePosition;
                autoRotate   = false;
            }
            if (Input.GetMouseButtonUp(0)) _isDragging = false;

            if (_isDragging && Input.GetMouseButton(0))
            {
                Vector3 delta = Input.mousePosition - _lastMousePos;
                _targetEuler.y += delta.x * orbitSpeed * Time.deltaTime;
                _targetEuler.x -= delta.y * orbitSpeed * Time.deltaTime;
                _targetEuler.x  = Mathf.Clamp(_targetEuler.x, -85f, 85f);
                _lastMousePos   = Input.mousePosition;
            }

            // Scroll → zoom
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Abs(scroll) > 0.001f)
                _targetZoom = Mathf.Clamp(_targetZoom - scroll * zoomSpeed, minZoom, maxZoom);

            // Right drag → pan
            if (Input.GetMouseButton(1))
            {
                Vector3 delta = Input.mousePosition - _lastMousePos;
                mainCamera.transform.position += new Vector3(-delta.x, -delta.y, 0) * panSpeed * Time.deltaTime;
            }
        }

        void HandleTouchInput()
        {
            if (Input.touchCount == 1)
            {
                Touch t = Input.GetTouch(0);
                if (t.phase == TouchPhase.Moved)
                {
                    _targetEuler.y += t.deltaPosition.x * orbitSpeed * 0.5f * Time.deltaTime;
                    _targetEuler.x -= t.deltaPosition.y * orbitSpeed * 0.5f * Time.deltaTime;
                    _targetEuler.x  = Mathf.Clamp(_targetEuler.x, -85f, 85f);
                }
            }
            else if (Input.touchCount == 2)
            {
                Touch t0 = Input.GetTouch(0);
                Touch t1 = Input.GetTouch(1);
                float dist = Vector2.Distance(t0.position, t1.position);

                if (t1.phase == TouchPhase.Began)
                    _lastPinchDistance = dist;
                else
                {
                    float pinchDelta = dist - _lastPinchDistance;
                    _targetZoom       = Mathf.Clamp(_targetZoom - pinchDelta * 0.02f, minZoom, maxZoom);
                    _lastPinchDistance = dist;
                }
            }
        }

        void HandleKeyboardShortcuts()
        {
            // M = toggle medical mode
            if (Input.GetKeyDown(KeyCode.M))
                uiManager?.ToggleMedicalMode();

            // R = reset camera
            if (Input.GetKeyDown(KeyCode.R))
                ResetCamera();

            // Space = toggle auto-rotate
            if (Input.GetKeyDown(KeyCode.Space))
                autoRotate = !autoRotate;

            // 1–9 = select system
            for (int i = 0; i < 9; i++)
                if (Input.GetKeyDown(KeyCode.Alpha1 + i))
                    systemManager?.SelectSystemByIndex(i);
        }

        void SmoothCameraTransform()
        {
            // Smooth rotation
            _currentEuler = Vector3.SmoothDamp(
                _currentEuler, _targetEuler, ref _eulerVelocity, smoothTime);
            if (bodyRoot) bodyRoot.rotation = Quaternion.Euler(_currentEuler);

            // Smooth zoom
            _currentZoom = Mathf.SmoothDamp(
                _currentZoom, _targetZoom, ref _zoomVelocity, smoothTime);
            Vector3 camPos = mainCamera.transform.localPosition;
            mainCamera.transform.localPosition = new Vector3(camPos.x, camPos.y, -_currentZoom);
        }

        // ── Public API ──

        /// <summary>Called by OrganController when user clicks an organ.</summary>
        public void OnOrganSelected(OrganController organ)
        {
            if (_selectedOrgan == organ) return;
            _selectedOrgan?.Deselect();
            _selectedOrgan = organ;
            organ.Select();

            uiManager?.ShowOrganInfo(organ.organData);
            StartCoroutine(AnimateCameraToOrgan(organ.transform.position));
        }

        /// <summary>Deselects all organs and returns to default view.</summary>
        public void DeselectOrgan()
        {
            _selectedOrgan?.Deselect();
            _selectedOrgan = null;
            uiManager?.ShowPlaceholder();
            autoRotate = true;
        }

        public void ResetCamera()
        {
            _targetZoom  = 5f;
            _targetEuler = Vector3.zero;
            if (mainCamera) mainCamera.transform.localPosition = new Vector3(0, 0, -5f);
        }

        IEnumerator AnimateCameraToOrgan(Vector3 targetWorldPos)
        {
            _isAnimatingToOrgan = true;
            float duration = 0.6f;
            float t = 0;
            float startZoom = _targetZoom;
            float targetOrganZoom = Mathf.Clamp(startZoom * 0.6f, minZoom, maxZoom * 0.7f);

            while (t < duration)
            {
                t += Time.deltaTime;
                float progress = Mathf.SmoothStep(0, 1, t / duration);
                _targetZoom = Mathf.Lerp(startZoom, targetOrganZoom, progress);
                yield return null;
            }
            _isAnimatingToOrgan = false;
        }
    }
}
