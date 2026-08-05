// ============================================================
//  app.js — Plajah Human Body Explorer
//  Main application: UI, SVG body, panels, 3D viewer
// ============================================================

(function () {
  'use strict';

  // ── State ──
  let state = {
    activeSystem: null,
    activeOrgan: null,
    activeTab: 'overview',
    medicalMode: false,
    sex: 'male',
    view: 'front',
    zoom: 1,
    pan: { x: 0, y: 0 },
    dragging: false,
    dragStart: null,
    threeScene: null,
    threeAnimId: null,
  };

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    buildSystemList();
    buildBodySVG();
    bindEvents();
    setTimeout(hideLoader, 2200);
  });

  function hideLoader() {
    const loader = document.getElementById('loadingScreen');
    if (loader) loader.classList.add('hidden');
  }

  // ── Build System Sidebar ──
  function buildSystemList() {
    const list = document.getElementById('systemList');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(window.BODY_SYSTEMS).forEach(([key, sys]) => {
      const count = window.ANATOMY.filter(o => o.system === key).length;
      const item = document.createElement('div');
      item.className = 'system-item';
      item.dataset.system = key;
      item.style.setProperty('--sys-color', sys.color);
      item.innerHTML = `
        <div class="system-dot" style="background:${sys.color};box-shadow:0 0 6px ${sys.color}"></div>
        <span class="system-label">${sys.label}</span>
        <span class="system-count">${count}</span>
      `;
      item.addEventListener('click', () => selectSystem(key));
      list.appendChild(item);
    });
  }

  function selectSystem(key) {
    state.activeSystem = state.activeSystem === key ? null : key;
    document.querySelectorAll('.system-item').forEach(el => {
      el.classList.toggle('active', el.dataset.system === state.activeSystem);
    });
    updateSVGVisibility();
    const label = document.getElementById('activeSystemLabel');
    if (label) {
      label.textContent = state.activeSystem ? (window.BODY_SYSTEMS[state.activeSystem]?.label + ' System') : 'All Systems';
    }
  }

  // ── Build SVG Body ──
  function buildBodySVG() {
    const svg = document.getElementById('bodySVG');
    if (!svg) return;

    // ── Draw full anatomical body layers ──
    svg.innerHTML = `
      <defs>
        <radialGradient id="skinGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#c8956c"/>
          <stop offset="100%" stop-color="#a0724a"/>
        </radialGradient>
        <radialGradient id="deepBodyGrad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#1a2a3a"/>
          <stop offset="100%" stop-color="#0d1520"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <marker id="arrowBlue" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#2a7fff" opacity="0.6"/>
        </marker>
      </defs>

      <!-- ========== BODY SILHOUETTE (Skin layer) ========== -->
      <g id="layer-skin" class="body-layer">
        <!-- Head -->
        <ellipse cx="200" cy="68" rx="46" ry="55" fill="url(#skinGrad)" opacity="0.15" stroke="#4a6280" stroke-width="0.5"/>
        <!-- Neck -->
        <rect x="186" y="118" width="28" height="28" rx="6" fill="#c8956c" opacity="0.12" stroke="#4a6280" stroke-width="0.5"/>
        <!-- Torso -->
        <path d="M150,146 Q140,155 135,175 L130,310 Q130,325 145,330 L255,330 Q270,325 270,310 L265,175 Q260,155 250,146 Z"
          fill="#c8956c" opacity="0.10" stroke="#4a6280" stroke-width="0.5"/>
        <!-- Left Arm -->
        <path d="M148,150 Q130,160 118,200 L110,300 Q108,320 118,325 L132,325 Q142,320 144,300 L148,200 Z"
          fill="#c8956c" opacity="0.09" stroke="#4a6280" stroke-width="0.4"/>
        <!-- Right Arm -->
        <path d="M252,150 Q270,160 282,200 L290,300 Q292,320 282,325 L268,325 Q258,320 256,300 L252,200 Z"
          fill="#c8956c" opacity="0.09" stroke="#4a6280" stroke-width="0.4"/>
        <!-- Left Leg -->
        <path d="M150,330 L140,480 Q138,520 148,560 L168,560 Q178,520 176,480 L166,330 Z"
          fill="#c8956c" opacity="0.09" stroke="#4a6280" stroke-width="0.4"/>
        <!-- Right Leg -->
        <path d="M250,330 L260,480 Q262,520 252,560 L232,560 Q222,520 224,480 L234,330 Z"
          fill="#c8956c" opacity="0.09" stroke="#4a6280" stroke-width="0.4"/>
      </g>

      <!-- ========== SKELETON LAYER ========== -->
      <g id="layer-skeleton" class="body-layer" data-system="skeletal">
        <!-- Skull outline -->
        <ellipse cx="200" cy="66" rx="40" ry="48" fill="none" stroke="#bdc3c7" stroke-width="0.8" opacity="0.35"/>
        <!-- Jaw -->
        <path d="M168,98 Q200,115 232,98" fill="none" stroke="#bdc3c7" stroke-width="0.8" opacity="0.35"/>
        <!-- Spine -->
        <line x1="200" y1="120" x2="200" y2="330" stroke="#bdc3c7" stroke-width="1.2" opacity="0.3" stroke-dasharray="4,3"/>
        <!-- Ribs (simplified) -->
        <path d="M162,175 Q150,185 155,200 Q165,205 178,200" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M162,185 Q148,196 153,212 Q163,217 177,212" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M162,196 Q147,208 152,224 Q162,229 176,224" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M162,207 Q148,220 153,236 Q163,241 177,236" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M238,175 Q250,185 245,200 Q235,205 222,200" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M238,185 Q252,196 247,212 Q237,217 223,212" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M238,196 Q253,208 248,224 Q238,229 224,224" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <path d="M238,207 Q252,220 247,236 Q237,241 223,236" fill="none" stroke="#bdc3c7" stroke-width="0.7" opacity="0.3"/>
        <!-- Sternum -->
        <rect x="196" y="166" width="8" height="90" rx="3" fill="#bdc3c7" opacity="0.22"/>
        <!-- Pelvis outline -->
        <path d="M158,335 Q140,350 145,370 Q170,390 200,388 Q230,390 255,370 Q260,350 242,335 Z"
          fill="none" stroke="#bdc3c7" stroke-width="0.8" opacity="0.28"/>
        <!-- Femur left -->
        <line x1="175" y1="388" x2="170" y2="490" stroke="#bdc3c7" stroke-width="1.2" opacity="0.28"/>
        <!-- Femur right -->
        <line x1="225" y1="388" x2="230" y2="490" stroke="#bdc3c7" stroke-width="1.2" opacity="0.28"/>
        <!-- Tibia left -->
        <line x1="168" y1="492" x2="162" y2="568" stroke="#bdc3c7" stroke-width="1" opacity="0.25"/>
        <!-- Tibia right -->
        <line x1="232" y1="492" x2="238" y2="568" stroke="#bdc3c7" stroke-width="1" opacity="0.25"/>
        <!-- Clavicles -->
        <path d="M185,145 Q168,148 155,158" fill="none" stroke="#bdc3c7" stroke-width="0.8" opacity="0.4"/>
        <path d="M215,145 Q232,148 245,158" fill="none" stroke="#bdc3c7" stroke-width="0.8" opacity="0.4"/>
        <!-- Humerus left -->
        <line x1="148" y1="165" x2="122" y2="280" stroke="#bdc3c7" stroke-width="1" opacity="0.25"/>
        <!-- Humerus right -->
        <line x1="252" y1="165" x2="278" y2="280" stroke="#bdc3c7" stroke-width="1" opacity="0.25"/>
      </g>

      <!-- ========== CIRCULATORY LAYER ========== -->
      <g id="layer-circulatory" class="body-layer" data-system="circulatory">
        <!-- Aorta (descending) -->
        <path d="M200,240 Q205,280 202,330 Q200,380 200,440" fill="none" stroke="#e74c3c" stroke-width="2.5" opacity="0.5"/>
        <!-- Aortic arch -->
        <path d="M200,215 Q215,215 225,205 Q235,195 230,185 Q220,170 200,175"
          fill="none" stroke="#e74c3c" stroke-width="2" opacity="0.55"/>
        <!-- Superior vena cava -->
        <path d="M200,175 Q185,170 178,180 Q172,195 180,215 Q190,230 200,240"
          fill="none" stroke="#3498db" stroke-width="1.5" opacity="0.4"/>
        <!-- Pulmonary artery -->
        <path d="M200,215 Q190,208 178,210 Q165,215 160,225"
          fill="none" stroke="#e74c3c" stroke-width="1.2" opacity="0.45"/>
        <path d="M200,215 Q210,208 222,210 Q235,215 240,225"
          fill="none" stroke="#e74c3c" stroke-width="1.2" opacity="0.45"/>
        <!-- Iliac arteries -->
        <path d="M200,440 Q188,450 178,470 L170,520" fill="none" stroke="#e74c3c" stroke-width="1.5" opacity="0.4"/>
        <path d="M200,440 Q212,450 222,470 L230,520" fill="none" stroke="#e74c3c" stroke-width="1.5" opacity="0.4"/>
        <!-- Brachial arteries -->
        <path d="M160,175 Q145,200 132,260" fill="none" stroke="#e74c3c" stroke-width="1" opacity="0.35"/>
        <path d="M240,175 Q255,200 268,260" fill="none" stroke="#e74c3c" stroke-width="1" opacity="0.35"/>
        <!-- Carotid arteries -->
        <path d="M193,130 L190,148" stroke="#e74c3c" stroke-width="1" opacity="0.5"/>
        <path d="M207,130 L210,148" stroke="#e74c3c" stroke-width="1" opacity="0.5"/>
        <!-- Capillary haze on limbs -->
        <path d="M120,270 Q125,275 122,285" fill="none" stroke="#e74c3c" stroke-width="0.5" opacity="0.2"/>
      </g>

      <!-- ========== NERVOUS SYSTEM LAYER ========== -->
      <g id="layer-nervous" class="body-layer" data-system="nervous" opacity="0.6">
        <!-- Spinal cord -->
        <path d="M200,120 L200,330" stroke="#f39c12" stroke-width="1.5" opacity="0.4" stroke-dasharray="2,2"/>
        <!-- Brachial plexus left -->
        <path d="M190,148 Q175,155 165,168 Q155,185 148,210" fill="none" stroke="#f39c12" stroke-width="0.7" opacity="0.35"/>
        <!-- Brachial plexus right -->
        <path d="M210,148 Q225,155 235,168 Q245,185 252,210" fill="none" stroke="#f39c12" stroke-width="0.7" opacity="0.35"/>
        <!-- Sciatic nerve left -->
        <path d="M190,340 Q182,380 175,430 L168,520" fill="none" stroke="#f39c12" stroke-width="0.7" opacity="0.3"/>
        <!-- Sciatic nerve right -->
        <path d="M210,340 Q218,380 225,430 L232,520" fill="none" stroke="#f39c12" stroke-width="0.7" opacity="0.3"/>
        <!-- Vagus nerve -->
        <path d="M197,125 Q190,145 186,170 Q183,195 185,230" fill="none" stroke="#f39c12" stroke-width="0.5" opacity="0.3"/>
      </g>

      <!-- ========== LYMPHATIC LAYER ========== -->
      <g id="layer-lymphatic" class="body-layer" data-system="lymphatic" opacity="0.5">
        <!-- Thoracic duct -->
        <path d="M200,350 Q196,300 198,240 Q199,200 200,175" fill="none" stroke="#9b59b6" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.4"/>
        <!-- Right lymphatic duct -->
        <path d="M200,175 Q190,168 182,172" fill="none" stroke="#9b59b6" stroke-width="0.8" opacity="0.4"/>
        <!-- Inguinal nodes left -->
        <circle cx="178" cy="352" r="4" fill="#9b59b6" opacity="0.35"/>
        <!-- Inguinal nodes right -->
        <circle cx="222" cy="352" r="4" fill="#9b59b6" opacity="0.35"/>
        <!-- Axillary nodes left -->
        <circle cx="145" cy="175" r="4" fill="#9b59b6" opacity="0.35"/>
        <!-- Axillary nodes right -->
        <circle cx="255" cy="175" r="4" fill="#9b59b6" opacity="0.35"/>
        <!-- Cervical nodes -->
        <circle cx="182" cy="132" r="3" fill="#9b59b6" opacity="0.35"/>
        <circle cx="218" cy="132" r="3" fill="#9b59b6" opacity="0.35"/>
      </g>

      <!-- ========== ORGAN HOTSPOTS ========== -->
      <g id="organHotspots">
        <!-- Brain -->
        <g class="organ-dot" data-organ="brain" data-cx="200" data-cy="62">
          <circle class="pulse-ring" cx="200" cy="62" r="6" fill="none" stroke="#f39c12" stroke-width="1" opacity="0.4"/>
          <circle cx="200" cy="62" r="6" fill="#f39c12" opacity="0.75" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
          <text x="200" y="52" text-anchor="middle" font-size="7.5" fill="rgba(255,255,255,0.7)" font-family="Segoe UI,sans-serif">Brain</text>
        </g>

        <!-- Heart -->
        <g class="organ-dot" data-organ="heart" data-cx="191" data-cy="220">
          <circle class="pulse-ring" cx="191" cy="220" r="6" fill="none" stroke="#e74c3c" stroke-width="1" opacity="0.4"/>
          <circle cx="191" cy="220" r="6" fill="#e74c3c" opacity="0.8" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
          <text x="181" y="234" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.7)" font-family="Segoe UI,sans-serif">Heart</text>
        </g>

        <!-- Lung Left -->
        <g class="organ-dot" data-organ="lungs" data-cx="173" data-cy="215">
          <circle cx="173" cy="215" r="5" fill="#3498db" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="160" y="207" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.6)" font-family="Segoe UI,sans-serif">Lung</text>
        </g>

        <!-- Lung Right -->
        <g class="organ-dot" data-organ="lungs" data-cx="227" data-cy="215">
          <circle cx="227" cy="215" r="5" fill="#3498db" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        </g>

        <!-- Liver -->
        <g class="organ-dot" data-organ="liver" data-cx="215" data-cy="264">
          <circle cx="215" cy="264" r="6.5" fill="#27ae60" opacity="0.8" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="228" y="258" text-anchor="start" font-size="7" fill="rgba(255,255,255,0.65)" font-family="Segoe UI,sans-serif">Liver</text>
        </g>

        <!-- Stomach -->
        <g class="organ-dot" data-organ="stomach" data-cx="190" data-cy="268">
          <circle cx="190" cy="268" r="5" fill="#27ae60" opacity="0.7" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="174" y="263" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.65)" font-family="Segoe UI,sans-serif">Stomach</text>
        </g>

        <!-- Pancreas -->
        <g class="organ-dot" data-organ="pancreas" data-cx="200" data-cy="285">
          <circle cx="200" cy="285" r="4.5" fill="#1abc9c" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="200" y="296" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.6)" font-family="Segoe UI,sans-serif">Pancreas</text>
        </g>

        <!-- Spleen -->
        <g class="organ-dot" data-organ="spleen" data-cx="174" data-cy="270">
          <circle cx="174" cy="270" r="4.5" fill="#9b59b6" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="158" y="265" text-anchor="end" font-size="6.5" fill="rgba(255,255,255,0.6)" font-family="Segoe UI,sans-serif">Spleen</text>
        </g>

        <!-- Small Intestine -->
        <g class="organ-dot" data-organ="small_intestine" data-cx="200" data-cy="310">
          <circle cx="200" cy="310" r="5.5" fill="#27ae60" opacity="0.65" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
          <text x="200" y="302" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.6)" font-family="Segoe UI,sans-serif">S. Intestine</text>
        </g>

        <!-- Large Intestine -->
        <g class="organ-dot" data-organ="large_intestine" data-cx="200" data-cy="335">
          <circle cx="200" cy="335" r="5" fill="#27ae60" opacity="0.6" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
        </g>

        <!-- Kidneys Left -->
        <g class="organ-dot" data-organ="kidneys" data-cx="178" data-cy="290">
          <circle cx="178" cy="290" r="4.5" fill="#f1c40f" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="163" y="286" text-anchor="end" font-size="6.5" fill="rgba(255,255,255,0.6)" font-family="Segoe UI,sans-serif">Kidney</text>
        </g>

        <!-- Kidneys Right -->
        <g class="organ-dot" data-organ="kidneys" data-cx="222" data-cy="290">
          <circle cx="222" cy="290" r="4.5" fill="#f1c40f" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        </g>

        <!-- Thyroid -->
        <g class="organ-dot" data-organ="thyroid" data-cx="200" data-cy="134">
          <circle cx="200" cy="134" r="4" fill="#1abc9c" opacity="0.75" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          <text x="212" y="130" text-anchor="start" font-size="6.5" fill="rgba(255,255,255,0.6)" font-family="Segoe UI,sans-serif">Thyroid</text>
        </g>

        <!-- Adrenal Glands Left -->
        <g class="organ-dot" data-organ="adrenal_glands" data-cx="182" data-cy="278">
          <circle cx="182" cy="278" r="3" fill="#1abc9c" opacity="0.65" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
        </g>
        <g class="organ-dot" data-organ="adrenal_glands" data-cx="218" data-cy="278">
          <circle cx="218" cy="278" r="3" fill="#1abc9c" opacity="0.65" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
          <text x="228" y="274" text-anchor="start" font-size="6.5" fill="rgba(255,255,255,0.55)" font-family="Segoe UI,sans-serif">Adrenals</text>
        </g>

        <!-- Skin (whole body overlay click zone - top indicator) -->
        <g class="organ-dot" data-organ="skin" data-cx="200" data-cy="155">
          <circle cx="200" cy="155" r="4" fill="#cd7f32" opacity="0.5" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
          <text x="212" y="151" text-anchor="start" font-size="6" fill="rgba(255,255,255,0.45)" font-family="Segoe UI,sans-serif">Skin</text>
        </g>

        <!-- Eyes -->
        <g class="organ-dot" data-organ="eyes" data-cx="200" data-cy="60">
          <circle cx="186" cy="60" r="3" fill="#00bcd4" opacity="0.7" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>
          <circle cx="214" cy="60" r="3" fill="#00bcd4" opacity="0.7" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>
        </g>

        <!-- Spinal Cord -->
        <g class="organ-dot" data-organ="spinal_cord" data-cx="200" data-cy="230">
          <circle cx="204" cy="230" r="3" fill="#f39c12" opacity="0.5" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
          <text x="210" y="226" text-anchor="start" font-size="6" fill="rgba(255,255,255,0.4)" font-family="Segoe UI,sans-serif">Spinal</text>
        </g>

        <!-- Skeletal System (collarbone area) -->
        <g class="organ-dot" data-organ="skeleton" data-cx="200" data-cy="170">
          <circle cx="200" cy="170" r="3.5" fill="#bdc3c7" opacity="0.5" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
        </g>

        <!-- Muscular System (bicep area) -->
        <g class="organ-dot" data-organ="muscles" data-cx="135" data-cy="210">
          <circle cx="135" cy="210" r="4" fill="#e67e22" opacity="0.6" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
          <text x="120" y="206" text-anchor="end" font-size="6" fill="rgba(255,255,255,0.45)" font-family="Segoe UI,sans-serif">Muscle</text>
        </g>
        <g class="organ-dot" data-organ="muscles" data-cx="265" data-cy="210">
          <circle cx="265" cy="210" r="4" fill="#e67e22" opacity="0.6" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
        </g>
      </g>

      <!-- ========== BODY SILHOUETTE OUTLINE ========== -->
      <g id="bodyOutline" pointer-events="none">
        <!-- Head outline glow -->
        <ellipse cx="200" cy="68" rx="46" ry="55" fill="none" stroke="rgba(0,212,255,0.12)" stroke-width="1"/>
        <!-- Neck -->
        <rect x="186" y="118" width="28" height="28" rx="6" fill="none" stroke="rgba(0,212,255,0.1)" stroke-width="0.8"/>
        <!-- Shoulders and torso outline -->
        <path d="M150,146 Q140,155 135,175 L130,310 Q130,325 145,330 L255,330 Q270,325 270,310 L265,175 Q260,155 250,146 Z"
          fill="none" stroke="rgba(0,212,255,0.1)" stroke-width="0.8"/>
        <!-- Arm left -->
        <path d="M148,150 Q130,160 118,200 L110,300 Q108,320 118,325 L132,325 Q142,320 144,300 L148,200 Z"
          fill="none" stroke="rgba(0,212,255,0.08)" stroke-width="0.8"/>
        <!-- Arm right -->
        <path d="M252,150 Q270,160 282,200 L290,300 Q292,320 282,325 L268,325 Q258,320 256,300 L252,200 Z"
          fill="none" stroke="rgba(0,212,255,0.08)" stroke-width="0.8"/>
        <!-- Leg left -->
        <path d="M150,330 L140,480 Q138,520 148,560 L168,560 Q178,520 176,480 L166,330 Z"
          fill="none" stroke="rgba(0,212,255,0.08)" stroke-width="0.8"/>
        <!-- Leg right -->
        <path d="M250,330 L260,480 Q262,520 252,560 L232,560 Q222,520 224,480 L234,330 Z"
          fill="none" stroke="rgba(0,212,255,0.08)" stroke-width="0.8"/>
      </g>
    `;

    // Attach click events to organ dots
    document.querySelectorAll('.organ-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const organId = dot.dataset.organ;
        selectOrgan(organId);
      });

      dot.addEventListener('mouseenter', (e) => {
        const organId = dot.dataset.organ;
        const organ = window.getOrganById(organId);
        if (organ) showTooltip(e, organ);
      });

      dot.addEventListener('mousemove', (e) => {
        moveTooltip(e);
      });

      dot.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ── Organ Selection ──
  function selectOrgan(organId) {
    const organ = window.getOrganById(organId);
    if (!organ) return;

    state.activeOrgan = organ;

    // Update dot styles
    document.querySelectorAll('.organ-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.organ === organId);
    });

    // Show panel
    showInfoPanel(organ);
  }

  // ── Info Panel ──
  function showInfoPanel(organ) {
    const placeholder = document.getElementById('panelPlaceholder');
    const content = document.getElementById('panelContent');
    if (!placeholder || !content) return;

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    // Header
    const sys = window.BODY_SYSTEMS[organ.system] || {};
    document.getElementById('panelOrganIcon').textContent = organ.icon || sys.icon || '○';
    document.getElementById('panelOrganName').textContent = state.medicalMode ? organ.medicalName : organ.name;
    document.getElementById('panelMedicalName').textContent = state.medicalMode ? organ.name : organ.medicalName;

    const badge = document.getElementById('panelSystemBadge');
    badge.textContent = sys.label || organ.system;
    badge.style.color = sys.color || '#fff';
    badge.style.borderColor = (sys.color || '#fff') + '44';
    badge.style.backgroundColor = (sys.color || '#fff') + '11';

    // Render active tab
    renderTab(state.activeTab, organ);
  }

  function renderTab(tabName, organ) {
    organ = organ || state.activeOrgan;
    if (!organ) return;
    state.activeTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    const tabContent = document.getElementById('tabContent');
    if (!tabContent) return;
    tabContent.innerHTML = '';

    switch (tabName) {
      case 'overview': renderOverviewTab(tabContent, organ); break;
      case 'nutrition': renderNutritionTab(tabContent, organ); break;
      case 'cellular': renderCellularTab(tabContent, organ); break;
      case 'conditions': renderConditionsTab(tabContent, organ); break;
    }
  }

  function renderOverviewTab(container, organ) {
    const desc = state.medicalMode ? (organ.medicalDescription || organ.description) : organ.description;
    container.innerHTML = `
      <p class="overview-description">${desc}</p>
      <div class="overview-function">
        <strong style="color:var(--text-primary);font-size:11px;letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:5px;">Function</strong>
        ${organ.function}
      </div>
      ${organ.bloodFlow ? `
        <div class="flow-section">
          <div class="flow-title">🩸 Blood Flow</div>
          <div class="flow-text">${organ.bloodFlow}</div>
        </div>
      ` : ''}
      ${organ.fluidRole ? `
        <div class="flow-section">
          <div class="flow-title">💧 Fluids</div>
          <div class="flow-text">${organ.fluidRole}</div>
        </div>
      ` : ''}
      ${organ.fact ? `
        <div class="fact-card">
          <div class="fact-label">⚡ Did You Know?</div>
          <div class="fact-text">${organ.fact}</div>
        </div>
      ` : ''}
    `;
  }

  function renderNutritionTab(container, organ) {
    const vits = organ.vitamins || [];
    const mins = organ.minerals || [];
    const vitColors = ['#f39c12','#e74c3c','#3498db','#27ae60','#9b59b6','#1abc9c','#e67e22'];

    container.innerHTML = `
      <div class="nutrition-section">
        <div class="nutrition-heading">Vitamins</div>
        ${vits.map((v, i) => `
          <div class="nutrition-item">
            <div class="nutrition-name">
              <span class="vit-dot" style="background:${vitColors[i % vitColors.length]}"></span>
              ${v.name}
            </div>
            <div class="nutrition-role">${v.role}</div>
          </div>
        `).join('')}
        ${vits.length === 0 ? '<div style="color:var(--text-muted);font-size:12px">No specific vitamin data</div>' : ''}
      </div>
      <div class="nutrition-section">
        <div class="nutrition-heading">Minerals</div>
        ${mins.map(m => `
          <div class="nutrition-item">
            <div class="nutrition-name">
              <span class="vit-dot" style="background:#bdc3c7"></span>
              ${m.name}
            </div>
            <div class="nutrition-role">${m.role}</div>
          </div>
        `).join('')}
        ${mins.length === 0 ? '<div style="color:var(--text-muted);font-size:12px">No specific mineral data</div>' : ''}
      </div>
    `;
  }

  function renderCellularTab(container, organ) {
    const cells = organ.cellTypes || [];
    container.innerHTML = `
      ${organ.cellularProcess ? `
        <div class="cellular-process-box">
          <div class="cellular-title">⚛ Cellular Process</div>
          <div class="cellular-text">${organ.cellularProcess}</div>
        </div>
      ` : ''}
      <div style="margin-top:14px">
        <div class="nutrition-heading">Cell Types</div>
        ${cells.map(c => `
          <div class="cell-type-item">
            <div class="cell-type-name">${c.name}</div>
            <div class="cell-type-desc">${c.description}</div>
          </div>
        `).join('')}
        ${cells.length === 0 ? '<div style="color:var(--text-muted);font-size:12px">No cell type data</div>' : ''}
      </div>
    `;
  }

  function renderConditionsTab(container, organ) {
    const conds = organ.conditions || [];
    container.innerHTML = `
      <div style="color:var(--text-muted);font-size:11px;margin-bottom:12px;letter-spacing:0.5px;">
        Common conditions affecting this organ or system.
      </div>
      ${conds.map(c => `
        <div class="condition-item">
          <div class="condition-name">${c.name}</div>
          <div class="condition-desc">${c.description}</div>
        </div>
      `).join('')}
      ${conds.length === 0 ? '<div style="color:var(--text-muted);font-size:12px">No condition data available.</div>' : ''}
    `;
  }

  // ── SVG Visibility (system filter) ──
  function updateSVGVisibility() {
    document.querySelectorAll('.organ-dot').forEach(dot => {
      if (!state.activeSystem) {
        dot.style.opacity = '1';
        return;
      }
      const organ = window.getOrganById(dot.dataset.organ);
      const visible = organ && organ.system === state.activeSystem;
      dot.style.opacity = visible ? '1' : '0.1';
    });
    document.querySelectorAll('.body-layer[data-system]').forEach(layer => {
      if (!state.activeSystem) {
        layer.style.opacity = '';
        return;
      }
      layer.style.opacity = (layer.dataset.system === state.activeSystem) ? '1' : '0.06';
    });
  }

  // ── Tooltip ──
  const tooltip = document.createElement('div');
  tooltip.className = 'organ-tooltip';
  tooltip.innerHTML = '<div class="tooltip-name"></div><div class="tooltip-system"></div>';
  document.body.appendChild(tooltip);

  function showTooltip(e, organ) {
    tooltip.querySelector('.tooltip-name').textContent = state.medicalMode ? organ.medicalName : organ.name;
    const sys = window.BODY_SYSTEMS[organ.system];
    tooltip.querySelector('.tooltip-system').textContent = sys ? (sys.icon + ' ' + sys.label + ' System') : organ.system;
    tooltip.classList.add('visible');
    moveTooltip(e);
  }

  function moveTooltip(e) {
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  // ── Medical Mode ──
  function toggleMedicalMode() {
    state.medicalMode = !state.medicalMode;
    document.body.classList.toggle('medical-mode', state.medicalMode);
    const toggle = document.getElementById('medicalToggle');
    if (toggle) toggle.classList.toggle('active', state.medicalMode);
    if (state.activeOrgan) showInfoPanel(state.activeOrgan);
  }

  // ── Zoom & Pan ──
  function applyTransform() {
    const svg = document.getElementById('bodySVG');
    if (svg) {
      svg.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    }
  }

  // ── Search ──
  function handleSearch(e) {
    const query = e.target.value.trim();
    const resultsEl = document.getElementById('searchResults');
    if (!resultsEl) return;
    if (!query) { resultsEl.classList.remove('visible'); return; }

    const results = window.searchOrgans(query).slice(0, 6);
    if (!results.length) { resultsEl.classList.remove('visible'); return; }

    resultsEl.innerHTML = results.map(o => {
      const sys = window.BODY_SYSTEMS[o.system] || {};
      return `
        <div class="search-result-item" data-organ="${o.id}">
          <span class="search-result-icon">${o.icon || sys.icon || '○'}</span>
          <div class="search-result-info">
            <h4>${o.name}</h4>
            <span>${sys.label || o.system} System</span>
          </div>
        </div>
      `;
    }).join('');

    resultsEl.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        selectOrgan(item.dataset.organ);
        resultsEl.classList.remove('visible');
        e.target.value = '';
      });
    });

    resultsEl.classList.add('visible');
  }

  // ── 3D Organ Viewer (Three.js) ──
  function open3DViewer(organ) {
    const viewer = document.getElementById('organViewer3D');
    if (!viewer) return;
    viewer.classList.remove('hidden');

    const nameEl = document.getElementById('organ3DName');
    const medEl = document.getElementById('organ3DMedical');
    if (nameEl) nameEl.textContent = organ.name;
    if (medEl) medEl.textContent = organ.medicalName;

    if (state.threeAnimId) cancelAnimationFrame(state.threeAnimId);

    const canvas = document.getElementById('threeCanvas');
    const W = viewer.clientWidth;
    const H = viewer.clientHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 4);

    // Lighting
    const ambient = new THREE.AmbientLight(0x112233, 0.8);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0x00d4ff, 1.2);
    keyLight.position.set(3, 5, 3);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x2a7fff, 0.6);
    fillLight.position.set(-3, 0, -2);
    scene.add(fillLight);
    const rimLight = new THREE.PointLight(0xffffff, 0.4);
    rimLight.position.set(0, -4, 0);
    scene.add(rimLight);

    // Build organ mesh based on ID
    const sys = window.BODY_SYSTEMS[organ.system] || {};
    const color = new THREE.Color(sys.color || '#ffffff');
    const mesh = buildOrganMesh(organ.id, color);
    scene.add(mesh);

    // Particle system for atmosphere
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 300;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({ color: sys.color || '#ffffff', size: 0.02, transparent: true, opacity: 0.3 });
    scene.add(new THREE.Points(particleGeo, particleMat));

    // Orbit controls (mouse drag)
    let isDragging = false, prevMouse = { x: 0, y: 0 };
    canvas.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = (e.clientX - prevMouse.x) * 0.01;
      const dy = (e.clientY - prevMouse.y) * 0.01;
      mesh.rotation.y += dx;
      mesh.rotation.x += dy;
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', e => {
      camera.position.z = Math.max(1.5, Math.min(8, camera.position.z + e.deltaY * 0.005));
    });

    // Animate
    const clock = new THREE.Clock();
    function animate() {
      state.threeAnimId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!isDragging) {
        mesh.rotation.y = t * 0.4;
        mesh.rotation.x = Math.sin(t * 0.2) * 0.1;
      }
      mesh.scale.setScalar(1 + Math.sin(t * (organ.id === 'heart' ? 2.4 : 0.8)) * (organ.id === 'heart' ? 0.04 : 0.01));
      renderer.render(scene, camera);
    }
    animate();
  }

  function buildOrganMesh(organId, color) {
    let geo, mat;
    const emissive = color.clone().multiplyScalar(0.2);

    mat = new THREE.MeshPhongMaterial({
      color,
      emissive,
      shininess: 60,
      transparent: true,
      opacity: 0.92,
    });

    switch (organId) {
      case 'heart': {
        const group = new THREE.Group();
        // Two ventricle spheres
        const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), mat);
        const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), mat.clone());
        s1.position.set(-0.3, 0, 0);
        s2.position.set(0.3, 0, 0);
        // Top atria bumps
        const a1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 24), mat.clone());
        a1.position.set(-0.2, 0.55, 0.1);
        const a2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 24), mat.clone());
        a2.position.set(0.2, 0.52, 0.1);
        // Aorta
        const aortaGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 16);
        const aorta = new THREE.Mesh(aortaGeo, mat.clone());
        aorta.position.set(0.1, 0.9, 0);
        aorta.rotation.z = 0.2;
        group.add(s1, s2, a1, a2, aorta);
        group.rotation.z = 0.2;
        return group;
      }
      case 'lungs': {
        const group = new THREE.Group();
        // Right lung (3 lobes)
        const r1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 24), mat);
        r1.scale.set(0.7, 1.1, 0.6);
        r1.position.set(0.65, 0, 0);
        const r2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), mat.clone());
        r2.scale.set(0.7, 0.8, 0.6);
        r2.position.set(0.65, -0.7, 0.05);
        // Left lung (2 lobes, smaller for cardiac notch)
        const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), mat.clone());
        l1.scale.set(0.65, 1.1, 0.6);
        l1.position.set(-0.62, 0, 0);
        const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), mat.clone());
        l2.scale.set(0.65, 0.75, 0.6);
        l2.position.set(-0.62, -0.65, 0.05);
        // Bronchi
        const bGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12);
        const b1 = new THREE.Mesh(bGeo, mat.clone());
        b1.position.set(0.3, 0.2, 0); b1.rotation.z = -0.5;
        const b2 = new THREE.Mesh(bGeo, mat.clone());
        b2.position.set(-0.3, 0.2, 0); b2.rotation.z = 0.5;
        group.add(r1, r2, l1, l2, b1, b2);
        return group;
      }
      case 'brain': {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 48), mat);
        base.scale.set(1.1, 0.9, 1.0);
        // Gyri (ridges)
        for (let i = 0; i < 12; i++) {
          const gGeo = new THREE.TorusGeometry(0.7 + Math.random() * 0.1, 0.06, 8, 24, Math.PI * 0.6);
          const g = new THREE.Mesh(gGeo, mat.clone());
          g.rotation.x = (Math.random() - 0.5) * Math.PI;
          g.rotation.y = (Math.random() - 0.5) * Math.PI;
          g.position.set((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3);
          group.add(g);
        }
        // Cerebellum
        const cbl = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), mat.clone());
        cbl.scale.set(1.2, 0.7, 0.8);
        cbl.position.set(0, -0.72, -0.45);
        // Brain stem
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.5, 12), mat.clone());
        stem.position.set(0, -1.1, -0.2);
        group.add(base, cbl, stem);
        return group;
      }
      case 'liver': {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 32), mat);
        base.scale.set(1.4, 0.7, 0.8);
        // Right lobe bigger
        const rl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 24), mat.clone());
        rl.scale.set(1.1, 0.75, 0.9);
        rl.position.set(0.6, 0, 0);
        group.add(base, rl);
        return group;
      }
      case 'kidneys': {
        const group = new THREE.Group();
        // Two bean-shaped kidneys
        [[-0.75, 0, 0], [0.75, 0, 0]].forEach((pos, i) => {
          const bean = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), mat.clone());
          bean.scale.set(0.7, 1.15, 0.6);
          bean.position.set(...pos);
          if (i === 1) bean.rotation.y = Math.PI; // mirror
          group.add(bean);
        });
        return group;
      }
      case 'stomach': {
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), mat);
        body.scale.set(1.2, 0.8, 0.7);
        // Fundus bulge
        const fundus = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), mat.clone());
        fundus.position.set(-0.5, 0.45, 0);
        group.add(body, fundus);
        return group;
      }
      case 'skin': {
        // Show a stylized cross-section of skin layers
        const group = new THREE.Group();
        const layers = [
          { color: new THREE.Color('#d4a574'), y: 0.3, scale: [1.8, 0.15, 1.2] },   // epidermis
          { color: new THREE.Color('#b8724a'), y: 0.1, scale: [1.8, 0.2, 1.2] },    // dermis
          { color: new THREE.Color('#f5d6a0'), y: -0.15, scale: [1.8, 0.3, 1.2] },  // hypodermis
        ];
        layers.forEach(l => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshPhongMaterial({ color: l.color, transparent: true, opacity: 0.85 }));
          m.scale.set(...l.scale);
          m.position.y = l.y;
          group.add(m);
        });
        return group;
      }
      case 'skeleton': {
        const group = new THREE.Group();
        // Femur-like bone shape
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 1.4, 20), mat);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 20), mat.clone());
        head.position.y = 0.8;
        const condyle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), mat.clone());
        condyle.position.y = -0.8;
        group.add(shaft, head, condyle);
        return group;
      }
      case 'muscles': {
        const group = new THREE.Group();
        // Bicep-like shape
        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), mat);
        belly.scale.set(0.7, 1.5, 0.7);
        // Tendons
        [0.75, -0.75].forEach(y => {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 12), mat.clone());
          t.position.y = y * 1.2;
          group.add(t);
        });
        group.add(belly);
        return group;
      }
      default: {
        // Generic sphere
        geo = new THREE.SphereGeometry(0.75, 32, 32);
        return new THREE.Mesh(geo, mat);
      }
    }
  }

  function close3DViewer() {
    const viewer = document.getElementById('organViewer3D');
    if (viewer) viewer.classList.add('hidden');
    if (state.threeAnimId) {
      cancelAnimationFrame(state.threeAnimId);
      state.threeAnimId = null;
    }
  }

  // ── Bind Events ──
  function bindEvents() {
    // Medical mode toggle
    const medToggle = document.getElementById('medicalToggle');
    if (medToggle) medToggle.addEventListener('click', toggleMedicalMode);

    // Sex toggle
    document.querySelectorAll('[data-sex]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sex = btn.dataset.sex;
        document.querySelectorAll('[data-sex]').forEach(b => b.classList.toggle('active', b.dataset.sex === state.sex));
      });
    });

    // View toggle
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
      });
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => renderTab(btn.dataset.tab));
    });

    // 3D button
    const btn3d = document.getElementById('view3DBtn');
    if (btn3d) btn3d.addEventListener('click', () => state.activeOrgan && open3DViewer(state.activeOrgan));

    // Close 3D
    const close3d = document.getElementById('close3DBtn');
    if (close3d) close3d.addEventListener('click', close3DViewer);

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearch);
      searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchInput.value = ''; document.getElementById('searchResults')?.classList.remove('visible'); } });
    }
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) {
        document.getElementById('searchResults')?.classList.remove('visible');
      }
    });

    // Zoom
    document.getElementById('zoomIn')?.addEventListener('click', () => { state.zoom = Math.min(3, state.zoom + 0.15); applyTransform(); });
    document.getElementById('zoomOut')?.addEventListener('click', () => { state.zoom = Math.max(0.5, state.zoom - 0.15); applyTransform(); });
    document.getElementById('resetView')?.addEventListener('click', () => { state.zoom = 1; state.pan = { x: 0, y: 0 }; applyTransform(); });

    // Scroll zoom
    const container = document.getElementById('bodyContainer');
    if (container) {
      container.addEventListener('wheel', e => {
        e.preventDefault();
        state.zoom = Math.max(0.5, Math.min(3, state.zoom - e.deltaY * 0.001));
        applyTransform();
      }, { passive: false });

      // Pan
      container.addEventListener('mousedown', e => {
        if (e.target.closest('.organ-dot')) return;
        state.dragging = true;
        state.dragStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
      });
      document.addEventListener('mouseup', () => { state.dragging = false; });
      document.addEventListener('mousemove', e => {
        if (!state.dragging) return;
        state.pan.x = e.clientX - state.dragStart.x;
        state.pan.y = e.clientY - state.dragStart.y;
        applyTransform();
      });
    }

    // Layer checkboxes
    document.querySelectorAll('[data-layer]').forEach(cb => {
      cb.addEventListener('change', () => {
        const layerId = 'layer-' + cb.dataset.layer;
        const layer = document.getElementById(layerId);
        if (layer) layer.style.display = cb.checked ? '' : 'none';
      });
    });
  }
})();
