import * as THREE from 'three';
import { FIELD, PHYSICS, TEAMS } from './constants';
import { FieldBuilder } from './FieldBuilder';
import { PlayerMeshBuilder } from './PlayerModel';
import { FootballPhysics } from './FootballPhysics';
import { soundManager } from '../audio/SoundManager';
import {
  CameraViewMode,
  DriveState,
  GameMode,
  PlayOutcome,
  PlayType,
  Player3D,
  PlayerMovementInput,
  ReceiverRoute,
  TeamInfo,
  WeatherPreset,
} from '../types';

export class FootballEngine {
  public playerMode: 'BLOCK' | 'ATHLETE' = 'ATHLETE';
  private simulationRemainder = 0;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public fieldBuilder: FieldBuilder;
  public footballPhysics!: FootballPhysics;

  // Game & Drive State
  public gameMode: GameMode = 'MENU';
  public driveState: DriveState;
  public currentPlayType: PlayType = 'PASS_SLANTS';
  public cameraMode: CameraViewMode = 'BEHIND_QB';
  public weatherPreset: WeatherPreset = 'AURORA';
  public isGuidedMode: boolean = true;

  // Pocket & Timer
  public pocketTimeRemaining: number = PHYSICS.POCKET_TIME_LIMIT;
  public isBallSnapped: boolean = false;
  public isPassInAir: boolean = false;
  public targetReceiverIndex: number = 0; // 0 to 3
  public selectedTargetReceiver: Player3D | null = null;
  public activeBallCarrier: Player3D | null = null;
  public jukeActiveTimer: number = 0;

  // Player input for real-time movement
  public playerInput: PlayerMovementInput = {
    forward: 0,
    lateral: 0,
    sprint: false,
    juke: false,
  };

  // Players
  public offensePlayers: Player3D[] = [];
  public defensePlayers: Player3D[] = [];
  public playerMeshes: Map<string, {
    root: THREE.Group;
    torso: THREE.Mesh;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    head: THREE.Group;
    ballMesh?: THREE.Mesh;
    targetRing?: THREE.Mesh;
    badgeSprite?: THREE.Sprite;
  }> = new Map();

  // Internal Animation & Loop
  private animClock: THREE.Clock = new THREE.Clock();
  private animId: number = 0;
  private container: HTMLElement;
  private qbMeshGroup: THREE.Group | null = null;
  private activeFootballMesh!: THREE.Mesh;

  // Callbacks to React UI
  public onStateChange?: (state: DriveState, gameMode: GameMode, pocketTime: number, hasBallCarrier: boolean) => void;
  public onPlayEnd?: (outcome: PlayOutcome) => void;
  public onReceiverStatusUpdate?: (receivers: ReceiverRoute[]) => void;
  public invertControls: boolean = true;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);

    // 2. Camera
    const aspect = container.clientWidth / (container.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 1000);
    this.camera.position.set(0, 5.5, -28);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Field & Stadium
    this.fieldBuilder = new FieldBuilder();
    this.fieldBuilder.buildField(this.scene);

    // 5. Shared Active Football
    this.activeFootballMesh = PlayerMeshBuilder.createFootball();
    this.scene.add(this.activeFootballMesh);
    this.footballPhysics = new FootballPhysics(this.activeFootballMesh);

    // 6. Drive State Initialization
    this.driveState = {
      down: 1,
      yardsToGo: 10,
      ballYardLine: 20, // Own 20 (Z = -30)
      playClock: 40,
      quarter: 1,
      timeRemaining: '12:00',
      offenseTeam: { ...TEAMS.AURORA },
      defenseTeam: { ...TEAMS.CURRENT },
      isRedZone: false,
      driveYards: 0,
      playsInDrive: 1,
    };

    // 7. Lighting & Sky
    this.setupLighting();

    // 8. Resize listener
    window.addEventListener('resize', this.handleResize);

    // 9. Start Game Loop
    this.animate();
  }

  public setPlayerInput(input: Partial<PlayerMovementInput>): void {
    this.playerInput = { ...this.playerInput, ...input };
    if (input.juke) {
      this.jukeActiveTimer = 0.6;
    }
  }

  private setupLighting(): void {
    // Ambient Stadium Fill
    const ambientLight = new THREE.AmbientLight(0x7c3aed, 0.7); // Twilight purple tint
    this.scene.add(ambientLight);

    // Directional Stadium Floodlight
    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.2);
    dirLight.position.set(25, 45, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.normalBias = .035;
    const d = 75;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    this.fieldBuilder.applyWeather(this.weatherPreset, this.scene);
  }

  public setWeather(preset: WeatherPreset): void {
    this.weatherPreset = preset;
    this.fieldBuilder.applyWeather(preset, this.scene);
  }

  public setPlayerMode(mode: 'BLOCK' | 'ATHLETE'): void {
    this.playerMode = mode;
    [...this.offensePlayers,...this.defensePlayers].forEach(p=> {
      const old=this.playerMeshes.get(p.id); if(old) this.scene.remove(old.root);
      const parts=PlayerMeshBuilder.createPlayerGroup(p,p.team==='OFFENSE'?this.driveState.offenseTeam:this.driveState.defenseTeam,mode);
      this.playerMeshes.set(p.id,parts); this.scene.add(parts.root);
      if(p.role==='QB') this.qbMeshGroup=parts.root;
    });
  }

  public setCameraMode(mode: CameraViewMode): void {
    this.cameraMode = mode;
  }

  /**
   * Translates Football Yard Line (1 to 99) into Three.js field coordinate Z (-50 to +50)
   * Ball at Own 20 = Z -30
   * Ball at 50 = Z 0
   * Opponent 20 (Yard 80) = Z +30
   * Goal Line (Yard 100) = Z +50
   */
  public yardLineToZ(yardLine: number): number {
    return (yardLine - 50);
  }

  public setupPlay(playType: PlayType = this.currentPlayType): void {
    this.currentPlayType = playType;
    this.isBallSnapped = false;
    this.isPassInAir = false;
    this.pocketTimeRemaining = PHYSICS.POCKET_TIME_LIMIT;
    this.activeBallCarrier = null;
    this.selectedTargetReceiver = null;
    this.footballPhysics.hide();

    // Clear old player meshes
    this.playerMeshes.forEach((parts) => {
      this.scene.remove(parts.root);
    });
    this.playerMeshes.clear();
    this.offensePlayers = [];
    this.defensePlayers = [];

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const fdZ = this.yardLineToZ(this.driveState.ballYardLine + this.driveState.yardsToGo);

    // Update glowing line of scrimmage and first down line
    this.fieldBuilder.updateLines(losZ, fdZ);
    this.fieldBuilder.setPocketIntegrity(1.0);

    // 1. Offensive Line & QB
    // QB behind center
    const qb: Player3D = {
      id: 'QB_1',
      team: 'OFFENSE',
      role: 'QB',
      number: 7,
      name: 'V. Vance',
      x: 0,
      y: 0,
      z: losZ - 4.5, // 4.5 yards deep in shotgun
      targetX: 0,
      targetZ: losZ - 4.5,
      speed: PHYSICS.QB_SCRAMBLE_SPEED,
      heading: 0,
      state: 'STANCE',
      hasBall: true,
    };
    this.offensePlayers.push(qb);

    // Running Back next to QB with checkdown flat route
    const rb: Player3D = {
      id: 'RB_1',
      team: 'OFFENSE',
      role: 'RB',
      number: 22,
      name: 'M. Hayes',
      x: -2.5,
      y: 0,
      z: losZ - 4.5,
      targetX: -2.5,
      targetZ: losZ - 4.5,
      vx: 0,
      vz: 0,
      speed: PHYSICS.RECEIVER_SPEED,
      heading: 0,
      state: 'STANCE',
      route: {
        id: 'ROUTE_4',
        number: 22,
        name: 'M. Hayes',
        label: 'Pass 4 Flat (RB)',
        position: 'RB',
        targetKey: '4',
        currentWaypointIdx: 0,
        separation: 0.9,
        isOpen: true,
        isCovered: false,
        contestedChance: 0.1,
        waypoints: [
          { x: -5.0, z: losZ - 1.0, speed: PHYSICS.RECEIVER_SPEED * 0.8 },
          { x: -12.0, z: losZ + 2.5, speed: PHYSICS.RECEIVER_SPEED },
          { x: -14.0, z: losZ + 8.0, speed: PHYSICS.RECEIVER_SPEED },
        ],
      },
    };
    this.offensePlayers.push(rb);

    // 5 Offensive Linemen (LT, LG, C, RG, RT) in authentic pass-protection stance
    const oLineSpacing = [-3.8, -1.9, 0, 1.9, 3.8];
    const oLineNames = ['L. Thomas (LT)', 'G. Miller (LG)', 'C. Jensen (C)', 'R. Davis (RG)', 'T. Washington (RT)'];
    oLineSpacing.forEach((xOffset, idx) => {
      this.offensePlayers.push({
        id: `OL_${idx}`,
        team: 'OFFENSE',
        role: 'OL',
        number: 62 + idx * 3,
        name: oLineNames[idx],
        x: xOffset,
        y: 0,
        z: losZ - 0.75,
        targetX: xOffset,
        targetZ: losZ - 0.75,
        vx: 0,
        vz: 0,
        speed: 3.8,
        heading: 0,
        state: 'STANCE',
      });
    });

    // 3 Wide Receivers based on playType
    const wrConfigs = this.generateRoutesForPlay(playType, losZ);
    wrConfigs.forEach((wr) => {
      this.offensePlayers.push(wr);
    });

    // 2. Defensive Front (4 D-Linemen + 2 Linebackers + 3 Cornerbacks + 2 Safeties = 11 defenders)
    // 4 Defensive Linemen
    const dLineSpacing = [-4.0, -1.6, 1.6, 4.0];
    const dLineNames = ['E. Griffin (RE)', 'D. Payne (DT1)', 'J. Allen (DT2)', 'M. Crosby (LE)'];
    dLineSpacing.forEach((xOffset, idx) => {
      this.defensePlayers.push({
        id: `DL_${idx}`,
        team: 'DEFENSE',
        role: 'DL',
        number: 90 + idx * 3,
        name: dLineNames[idx],
        x: xOffset,
        y: 0,
        z: losZ + 1.1,
        targetX: xOffset,
        targetZ: losZ + 1.1,
        vx: 0,
        vz: 0,
        speed: 4.8,
        heading: Math.PI,
        state: 'STANCE',
      });
    });

    // 2 Linebackers covering hook/curl zones
    this.defensePlayers.push({
      id: 'LB_1',
      team: 'DEFENSE',
      role: 'LB',
      number: 54,
      name: 'F. Warner (MLB)',
      x: 0,
      y: 0,
      z: losZ + 4.5,
      targetX: 0,
      targetZ: losZ + 4.5,
      vx: 0,
      vz: 0,
      speed: PHYSICS.DEFENDER_SPEED * 0.95,
      heading: Math.PI,
      state: 'STANCE',
    });

    this.defensePlayers.push({
      id: 'LB_2',
      team: 'DEFENSE',
      role: 'LB',
      number: 58,
      name: 'M. Milano (WLB)',
      x: -4.5,
      y: 0,
      z: losZ + 4.0,
      targetX: -4.5,
      targetZ: losZ + 4.0,
      vx: 0,
      vz: 0,
      speed: PHYSICS.DEFENDER_SPEED * 0.95,
      heading: Math.PI,
      state: 'STANCE',
    });

    // 3 Cornerbacks covering receivers
    const wrPlayers = this.offensePlayers.filter((p) => p.role === 'WR');
    wrPlayers.forEach((wr, idx) => {
      this.defensePlayers.push({
        id: `CB_${idx}`,
        team: 'DEFENSE',
        role: 'CB',
        number: 21 + idx * 3,
        name: `CB ${idx + 1}`,
        x: wr.x,
        y: 0,
        z: losZ + 5.5, // 5.5 yards cushion
        targetX: wr.x,
        targetZ: losZ + 5.5,
        vx: 0,
        vz: 0,
        speed: PHYSICS.DEFENDER_SPEED,
        heading: Math.PI,
        state: 'STANCE',
        assignedDefenderId: wr.id,
      });
    });

    // 2 Deep Safeties (Cover-2 / Cover-1)
    this.defensePlayers.push({
      id: 'FS_1',
      team: 'DEFENSE',
      role: 'S',
      number: 31,
      name: 'K. Byard (FS)',
      x: -4.0,
      y: 0,
      z: losZ + 17.0,
      targetX: -4.0,
      targetZ: losZ + 17.0,
      vx: 0,
      vz: 0,
      speed: PHYSICS.DEFENDER_SPEED * 1.05,
      heading: Math.PI,
      state: 'STANCE',
    });

    this.defensePlayers.push({
      id: 'SS_1',
      team: 'DEFENSE',
      role: 'S',
      number: 33,
      name: 'D. James (SS)',
      x: 5.0,
      y: 0,
      z: losZ + 14.5,
      targetX: 5.0,
      targetZ: losZ + 14.5,
      vx: 0,
      vz: 0,
      speed: PHYSICS.DEFENDER_SPEED * 1.05,
      heading: Math.PI,
      state: 'STANCE',
    });

    // Create 3D meshes for all players
    this.offensePlayers.forEach((p) => {
      const parts = PlayerMeshBuilder.createPlayerGroup(p, this.driveState.offenseTeam, this.playerMode);
      this.playerMeshes.set(p.id, parts);
      this.scene.add(parts.root);
      if (p.role === 'QB') {
        this.qbMeshGroup = parts.root;
      }
    });

    this.defensePlayers.forEach((p) => {
      const parts = PlayerMeshBuilder.createPlayerGroup(p, this.driveState.defenseTeam, this.playerMode);
      this.playerMeshes.set(p.id, parts);
      this.scene.add(parts.root);
    });

    // Default target receiver = 1 (Mid/Slot) or 0 (Left)
    this.selectTargetReceiver(1);

    // Update Jumbotron screens
    this.updateJumbotron();

    this.notifyState();
  }

  private generateRoutesForPlay(playType: PlayType, losZ: number): Player3D[] {
    const receivers: Player3D[] = [];

    if (playType === 'PASS_SLANTS') {
      // Pass 1 Left: Quick 3-step slant inside
      receivers.push({
        id: 'WR_1',
        team: 'OFFENSE',
        role: 'WR',
        number: 84,
        name: 'D. Cross',
        x: -18.0,
        y: 0,
        z: losZ - 0.2,
        targetX: -18.0,
        targetZ: losZ - 0.2,
        speed: PHYSICS.RECEIVER_SPEED,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_1',
          number: 84,
          name: 'D. Cross',
          label: 'Pass 1 Left',
          position: 'WR_LEFT',
          targetKey: '1',
          currentWaypointIdx: 0,
          separation: 0.8,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.2,
          waypoints: [
            { x: -18.0, z: losZ + 3.0, speed: PHYSICS.RECEIVER_SPEED },
            { x: -5.0, z: losZ + 8.5, speed: PHYSICS.RECEIVER_SPEED * 1.05 },
            { x: 4.0, z: losZ + 14.0, speed: PHYSICS.RECEIVER_SPEED },
          ],
        },
      });

      // Pass 2 Mid: Seam streak right through hash
      receivers.push({
        id: 'WR_2',
        team: 'OFFENSE',
        role: 'WR',
        number: 11,
        name: 'K. Mercer',
        x: -5.0,
        y: 0,
        z: losZ - 0.4,
        targetX: -5.0,
        targetZ: losZ - 0.4,
        speed: PHYSICS.RECEIVER_SPEED * 1.08,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_2',
          number: 11,
          name: 'K. Mercer',
          label: 'Pass 2 Mid',
          position: 'SLOT_MID',
          targetKey: '2',
          currentWaypointIdx: 0,
          separation: 0.9,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.15,
          waypoints: [
            { x: -4.0, z: losZ + 6.0, speed: PHYSICS.RECEIVER_SPEED },
            { x: -2.0, z: losZ + 15.0, speed: PHYSICS.RECEIVER_SPEED * 1.08 },
            { x: 0.0, z: losZ + 25.0, speed: PHYSICS.RECEIVER_SPEED * 1.1 },
          ],
        },
      });

      // Pass 3 Right: Quick Out 6 yards to sideline
      receivers.push({
        id: 'WR_3',
        team: 'OFFENSE',
        role: 'WR',
        number: 17,
        name: 'J. Banks',
        x: 18.0,
        y: 0,
        z: losZ - 0.2,
        targetX: 18.0,
        targetZ: losZ - 0.2,
        speed: PHYSICS.RECEIVER_SPEED,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_3',
          number: 17,
          name: 'J. Banks',
          label: 'Pass 3 Right',
          position: 'WR_RIGHT',
          targetKey: '3',
          currentWaypointIdx: 0,
          separation: 0.6,
          isOpen: false,
          isCovered: true,
          contestedChance: 0.4,
          waypoints: [
            { x: 18.0, z: losZ + 5.5, speed: PHYSICS.RECEIVER_SPEED },
            { x: 23.5, z: losZ + 6.2, speed: PHYSICS.RECEIVER_SPEED * 1.1 },
          ],
        },
      });
    } else if (playType === 'PASS_POST_OUT') {
      // Post & Out combination
      receivers.push({
        id: 'WR_1',
        team: 'OFFENSE',
        role: 'WR',
        number: 84,
        name: 'D. Cross',
        x: -18.0,
        y: 0,
        z: losZ - 0.2,
        targetX: -18.0,
        targetZ: losZ - 0.2,
        speed: PHYSICS.RECEIVER_SPEED,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_1',
          number: 84,
          name: 'D. Cross',
          label: 'Pass 1 Left',
          position: 'WR_LEFT',
          targetKey: '1',
          currentWaypointIdx: 0,
          separation: 0.7,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.25,
          waypoints: [
            { x: -18.0, z: losZ + 11.0, speed: PHYSICS.RECEIVER_SPEED },
            { x: -2.0, z: losZ + 24.0, speed: PHYSICS.RECEIVER_SPEED * 1.1 },
          ],
        },
      });

      receivers.push({
        id: 'WR_2',
        team: 'OFFENSE',
        role: 'WR',
        number: 11,
        name: 'K. Mercer',
        x: -4.0,
        y: 0,
        z: losZ - 0.4,
        targetX: -4.0,
        targetZ: losZ - 0.4,
        speed: PHYSICS.RECEIVER_SPEED,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_2',
          number: 11,
          name: 'K. Mercer',
          label: 'Pass 2 Mid',
          position: 'SLOT_MID',
          targetKey: '2',
          currentWaypointIdx: 0,
          separation: 0.85,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.15,
          waypoints: [
            { x: -4.0, z: losZ + 5.0, speed: PHYSICS.RECEIVER_SPEED },
            { x: 6.0, z: losZ + 6.0, speed: PHYSICS.RECEIVER_SPEED },
          ],
        },
      });

      receivers.push({
        id: 'WR_3',
        team: 'OFFENSE',
        role: 'WR',
        number: 17,
        name: 'J. Banks',
        x: 18.0,
        y: 0,
        z: losZ - 0.2,
        targetX: 18.0,
        targetZ: losZ - 0.2,
        speed: PHYSICS.RECEIVER_SPEED,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_3',
          number: 17,
          name: 'J. Banks',
          label: 'Pass 3 Right',
          position: 'WR_RIGHT',
          targetKey: '3',
          currentWaypointIdx: 0,
          separation: 0.7,
          isOpen: false,
          isCovered: true,
          contestedChance: 0.3,
          waypoints: [
            { x: 18.0, z: losZ + 12.0, speed: PHYSICS.RECEIVER_SPEED },
            { x: 24.0, z: losZ + 14.0, speed: PHYSICS.RECEIVER_SPEED * 1.1 },
          ],
        },
      });
    } else {
      // Four Verticals
      receivers.push({
        id: 'WR_1',
        team: 'OFFENSE',
        role: 'WR',
        number: 84,
        name: 'D. Cross',
        x: -19.0,
        y: 0,
        z: losZ - 0.2,
        targetX: -19.0,
        targetZ: losZ - 0.2,
        speed: PHYSICS.RECEIVER_SPEED * 1.1,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_1',
          number: 84,
          name: 'D. Cross',
          label: 'Pass 1 Left',
          position: 'WR_LEFT',
          targetKey: '1',
          currentWaypointIdx: 0,
          separation: 0.8,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.2,
          waypoints: [
            { x: -19.0, z: losZ + 32.0, speed: PHYSICS.RECEIVER_SPEED * 1.1 },
          ],
        },
      });

      receivers.push({
        id: 'WR_2',
        team: 'OFFENSE',
        role: 'WR',
        number: 11,
        name: 'K. Mercer',
        x: -6.0,
        y: 0,
        z: losZ - 0.4,
        targetX: -6.0,
        targetZ: losZ - 0.4,
        speed: PHYSICS.RECEIVER_SPEED * 1.05,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_2',
          number: 11,
          name: 'K. Mercer',
          label: 'Pass 2 Mid',
          position: 'SLOT_MID',
          targetKey: '2',
          currentWaypointIdx: 0,
          separation: 0.85,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.15,
          waypoints: [
            { x: -5.0, z: losZ + 30.0, speed: PHYSICS.RECEIVER_SPEED * 1.05 },
          ],
        },
      });

      receivers.push({
        id: 'WR_3',
        team: 'OFFENSE',
        role: 'WR',
        number: 17,
        name: 'J. Banks',
        x: 19.0,
        y: 0,
        z: losZ - 0.2,
        targetX: 19.0,
        targetZ: losZ - 0.2,
        speed: PHYSICS.RECEIVER_SPEED * 1.12,
        heading: 0,
        state: 'STANCE',
        route: {
          id: 'ROUTE_3',
          number: 17,
          name: 'J. Banks',
          label: 'Pass 3 Right',
          position: 'WR_RIGHT',
          targetKey: '3',
          currentWaypointIdx: 0,
          separation: 0.75,
          isOpen: true,
          isCovered: false,
          contestedChance: 0.25,
          waypoints: [
            { x: 19.0, z: losZ + 32.0, speed: PHYSICS.RECEIVER_SPEED * 1.12 },
          ],
        },
      });
    }

    return receivers;
  }

  public snapBall(): void {
    if (this.isBallSnapped || this.gameMode !== 'PLAYING') return;

    this.isBallSnapped = true;
    soundManager.ensureStarted();
    if (this.driveState.down === 3) {
      soundManager.playDefenseDrumCadence();
    } else {
      soundManager.playSnapHut();
    }

    // Offensive line engages blocking
    this.offensePlayers.forEach((p) => {
      if (p.role === 'OL') {
        p.state = 'BLOCKING';
      } else if (p.role === 'WR') {
        p.state = 'RUNNING';
      } else if (p.role === 'QB') {
        p.state = 'DROPBACK';
      }
    });

    // Defensive line rushes
    this.defensePlayers.forEach((p) => {
      if (p.role === 'DL') {
        p.state = 'PASS_RUSH';
      } else {
        p.state = 'RUNNING';
      }
    });
  }

  public moveQB(direction: 'LEFT' | 'RIGHT'): void {
    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    if (!qb) return;

    // Lateral scramble with invert controls support
    const effectiveDir = this.invertControls ? (direction === 'LEFT' ? 'RIGHT' : 'LEFT') : direction;
    const deltaX = effectiveDir === 'LEFT' ? -1.8 : 1.8;
    qb.targetX = Math.max(-10, Math.min(10, qb.x + deltaX));
  }

  public selectTargetReceiver(index: number): void {
    const targets = this.offensePlayers.filter((p) => p.role === 'WR' || p.role === 'RB');
    if (index >= 0 && index < targets.length) {
      this.targetReceiverIndex = index;
      this.selectedTargetReceiver = targets[index];
    }
  }

  public throwPass(isBullet: boolean = true): void {
    if (!this.isBallSnapped || this.isPassInAir) return;

    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    if (!qb) return;

    // Pick target receiver
    const targets = this.offensePlayers.filter((p) => p.role === 'WR' || p.role === 'RB');
    const receiver = this.selectedTargetReceiver || targets[0];
    if (!receiver) return;

    this.isPassInAir = true;
    qb.state = 'THROWING';
    qb.hasBall = false;

    soundManager.playThrowWhoosh(isBullet ? 1.3 : 0.85);

    // Anticipate receiver velocity and throw in stride into open grass
    const from = new THREE.Vector3(qb.x, 1.8, qb.z);
    const leadDistance = isBullet ? 3.5 : 6.5;
    const targetX = receiver.x + (receiver.vx ?? 0) * 0.4;
    const targetZ = receiver.z + leadDistance;
    const to = new THREE.Vector3(targetX, 1.7, targetZ);

    this.footballPhysics.launchPass(from, to, isBullet);
  }

  private updateReceiversAndCoverage(delta: number): void {
    const targets = this.offensePlayers.filter((p) => p.role === 'WR' || p.role === 'RB');
    const cbs = this.defensePlayers.filter((p) => p.role === 'CB');
    const lbs = this.defensePlayers.filter((p) => p.role === 'LB');
    const safeties = this.defensePlayers.filter((p) => p.role === 'S');

    const receiverInfoList: ReceiverRoute[] = [];

    targets.forEach((wr, idx) => {
      if (!wr.route) return;

      if (this.isBallSnapped && !this.activeBallCarrier) {
        // Step along route waypoints
        const waypoints = wr.route.waypoints;
        const currentIdx = wr.route.currentWaypointIdx;
        if (currentIdx < waypoints.length) {
          const wp = waypoints[currentIdx];
          const dx = wp.x - wr.x;
          const dz = wp.z - wr.z;
          const dist = Math.hypot(dx, dz);

          if (dist < 0.8) {
            wr.route.currentWaypointIdx++;
          } else {
            wr.vx = (dx / dist) * wr.speed;
            wr.vz = (dz / dist) * wr.speed;
            wr.x += wr.vx * delta;
            wr.z += wr.vz * delta;
            wr.heading = Math.atan2(wr.vx, wr.vz);
          }
        } else {
          // Continue downfield with momentum
          wr.vz = wr.speed;
          wr.z += wr.vz * delta;
          wr.heading = 0;
        }

        // Cornerback coverage matching
        const cb = cbs[idx];
        if (cb) {
          // CB maintains cushion, then mirrors route
          const targetCbZ = wr.z + 1.2;
          const cbDx = wr.x - cb.x;
          const cbDz = targetCbZ - cb.z;
          const cbDist = Math.hypot(cbDx, cbDz);
          if (cbDist > 0.4) {
            cb.vx = (cbDx / cbDist) * cb.speed;
            cb.vz = (cbDz / cbDist) * cb.speed;
            cb.x += cb.vx * delta;
            cb.z += cb.vz * delta;
            cb.heading = Math.atan2(cbDx, cbDz);
          }

          // Evaluate separation
          const separationYards = Math.hypot(wr.x - cb.x, wr.z - cb.z);
          wr.route.separation = Math.min(1.0, separationYards / 3.2);
          wr.route.isOpen = separationYards >= 1.6;
          wr.route.isCovered = !wr.route.isOpen;
          wr.route.contestedChance = wr.route.isOpen ? 0.12 : 0.6;
        }
      }

      receiverInfoList.push(wr.route);
    });

    // Linebackers patrol middle short zones
    if (this.isBallSnapped && !this.activeBallCarrier) {
      const losZ = this.yardLineToZ(this.driveState.ballYardLine);
      const qb = this.offensePlayers.find((p) => p.role === 'QB');
      lbs.forEach((lb, i) => {
        // Read QB eyes/lateral position
        const targetLbX = qb ? qb.x * 0.4 + (i === 0 ? 0 : -3.5) : 0;
        lb.x = THREE.MathUtils.lerp(lb.x, targetLbX, 0.05);
        lb.z = THREE.MathUtils.lerp(lb.z, losZ + 4.5, 0.05);
        lb.heading = Math.PI; // facing offense
      });

      // Safeties patrol deep zones
      safeties.forEach((s, i) => {
        const targetSafetyX = qb ? qb.x * 0.3 + (i === 0 ? -4 : 4) : 0;
        s.x = THREE.MathUtils.lerp(s.x, targetSafetyX, 0.04);
        s.heading = Math.PI;
      });
    }

    if (this.onReceiverStatusUpdate) {
      this.onReceiverStatusUpdate(receiverInfoList);
    }
  }

  private updatePocketAndRushers(delta: number): void {
    if (!this.isBallSnapped || this.isPassInAir || this.activeBallCarrier) return;

    this.pocketTimeRemaining -= delta;
    const ratio = Math.max(0, this.pocketTimeRemaining / PHYSICS.POCKET_TIME_LIMIT);
    this.fieldBuilder.setPocketIntegrity(ratio);

    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    if (!qb) return;

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const oLinemen = this.offensePlayers.filter((p) => p.role === 'OL');
    const dLinemen = this.defensePlayers.filter((p) => p.role === 'DL');

    // Linemen engagement & blocking pocket
    dLinemen.forEach((dl, idx) => {
      const assignedOl = oLinemen[idx % oLinemen.length];

      if (this.pocketTimeRemaining > 0.8 && Math.abs(qb.x) < 4.8) {
        // Pocket holds! OL actively blocks DL at the line of scrimmage
        if (assignedOl) {
          assignedOl.state = 'BLOCKING';
          assignedOl.z = THREE.MathUtils.lerp(assignedOl.z, losZ - 0.9, 0.1);
          assignedOl.x = THREE.MathUtils.lerp(assignedOl.x, dl.x, 0.15);
        }
        dl.state = 'PASS_RUSH';
        dl.z = THREE.MathUtils.lerp(dl.z, losZ + 0.3, 0.08);
      } else {
        // Pocket collapsed or QB rolled outside! Rushers break through
        const dx = qb.x - dl.x;
        const dz = qb.z - dl.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.4) {
          dl.vx = (dx / dist) * dl.speed * 1.25;
          dl.vz = (dz / dist) * dl.speed * 1.25;
          dl.x += dl.vx * delta;
          dl.z += dl.vz * delta;
          dl.heading = Math.atan2(dx, dz);
        }

        // Sack check!
        if (dist < 1.0 && !this.isPassInAir && qb.hasBall && !this.activeBallCarrier) {
          this.handleSack(qb);
        }
      }
    });
  }

  private updatePlayerControlsAndCarrier(delta: number): void {
    if (this.jukeActiveTimer > 0) {
      this.jukeActiveTimer -= delta;
    }

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const qb = this.offensePlayers.find((p) => p.role === 'QB');

    // Case 1: QB in pocket before throwing
    if (!this.isPassInAir && !this.activeBallCarrier && qb && qb.hasBall && this.isBallSnapped) {
      const speedMultiplier = this.playerInput.sprint ? 1.45 : 1.0;
      const moveSpeed = PHYSICS.QB_SCRAMBLE_SPEED * speedMultiplier;
      const lateralInput = this.invertControls ? -this.playerInput.lateral : this.playerInput.lateral;

      const inputLength = Math.max(1, Math.hypot(lateralInput, this.playerInput.forward));
      const grip = this.weatherPreset === 'RAIN' ? 5 : this.weatherPreset === 'SNOW' ? 3.5 : 8;
      const response = 1 - Math.exp(-grip * delta);
      qb.vx = THREE.MathUtils.lerp(qb.vx ?? 0, lateralInput / inputLength * moveSpeed, response);
      qb.vz = THREE.MathUtils.lerp(qb.vz ?? 0, this.playerInput.forward / inputLength * moveSpeed, response);

      qb.x += qb.vx * delta;
      qb.z += qb.vz * delta;

      // Restrict QB within field boundary
      qb.x = Math.max(-FIELD.WIDTH / 2 + 3, Math.min(FIELD.WIDTH / 2 - 3, qb.x));

      if (Math.hypot(qb.vx, qb.vz) > 0.5) {
        qb.heading = Math.atan2(qb.vx, qb.vz);
        qb.speed = Math.hypot(qb.vx, qb.vz);
      } else {
        qb.heading = 0;
        qb.speed = 0;
      }

      // If QB runs past the Line of Scrimmage, play becomes an active QB Scramble run!
      if (qb.z > losZ) {
        this.activeBallCarrier = qb;
        qb.state = 'RUNNING';
        soundManager.playCrowdRoar('CHEER');
      }
    }

    // Case 2: Active Ball Carrier (WR after catch or Scrambling QB)
    if (this.activeBallCarrier && this.gameMode === 'PLAYING') {
      const carrier = this.activeBallCarrier;
      const isSprinting = this.playerInput.sprint;
      const baseSpeed = carrier.role === 'RB' ? 10.5 : carrier.role === 'WR' ? 11.2 : 9.5;
      const currentSpeed = isSprinting ? baseSpeed * 1.35 : baseSpeed;
      const lateralInput = this.invertControls ? -this.playerInput.lateral : this.playerInput.lateral;

      let targetVx = lateralInput * currentSpeed;
      let targetVz = this.playerInput.forward * currentSpeed;

      // If user is not holding back/forward, auto-maintain downfield forward momentum
      if (Math.abs(this.playerInput.forward) < 0.1 && Math.abs(this.playerInput.lateral) < 0.1) {
        targetVz = baseSpeed * 0.7;
      }

      // Juke sidestep bonus
      if (this.jukeActiveTimer > 0) {
        targetVx *= 1.35;
        targetVz *= 1.15;
      }

      carrier.vx = THREE.MathUtils.lerp(carrier.vx ?? 0, targetVx, 0.22);
      carrier.vz = THREE.MathUtils.lerp(carrier.vz ?? 0, targetVz, 0.22);

      carrier.x += carrier.vx * delta;
      carrier.z += carrier.vz * delta;
      carrier.speed = Math.hypot(carrier.vx, carrier.vz);

      if (carrier.speed > 0.3) {
        carrier.heading = Math.atan2(carrier.vx, carrier.vz);
        carrier.state = 'RUNNING';
      }

      // Sync active football mesh to carrier
      const parts = this.playerMeshes.get(carrier.id);
      if (parts && parts.ballMesh) {
        parts.ballMesh.visible = true;
      }
      this.activeFootballMesh.visible = false;

      // 1. Out of Bounds Check
      if (Math.abs(carrier.x) > FIELD.WIDTH / 2) {
        soundManager.playWhistle();
        const yardsGained = Math.round(carrier.z - losZ);
        const newYardLine = Math.min(100, Math.max(1, this.driveState.ballYardLine + yardsGained));
        this.completePlay({
          result: yardsGained >= 0 ? 'COMPLETE' : 'SACK',
          yardsGained,
          description: `Run out of bounds at the ${newYardLine <= 50 ? newYardLine : 100 - newYardLine} yd line (${yardsGained >= 0 ? '+' : ''}${yardsGained} yds).`,
        }, newYardLine);
        return;
      }

      // 2. Touchdown Check (Crosses Opponent Goal Line at Z = 50)
      if (carrier.z >= 50) {
        soundManager.playCrowdRoar('TOUCHDOWN');
        carrier.state = 'CELEBRATING';
        const yardsGained = Math.round(50 - losZ);
        this.completePlay({
          result: 'TOUCHDOWN',
          yardsGained,
          description: `TOUCHDOWN AURORA! ${carrier.name} breaks all tackles into the end zone for ${yardsGained} yards!`,
        }, 100);
        return;
      }

      // 3. Defensive Pursuit and Tackling
      this.defensePlayers.forEach((def) => {
        const dx = carrier.x - def.x;
        const dz = carrier.z - def.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.3) {
          const pursuitSpeed = def.role === 'CB' || def.role === 'S' ? 9.8 : 8.6;
          def.vx = (dx / dist) * pursuitSpeed;
          def.vz = (dz / dist) * pursuitSpeed;
          def.x += def.vx * delta;
          def.z += def.vz * delta;
          def.heading = Math.atan2(dx, dz);
          def.state = 'RUNNING';
          def.speed = pursuitSpeed;
        }

        // Contact tackle check
        if (dist < 1.15 && this.gameMode === 'PLAYING') {
          if (this.jukeActiveTimer > 0) {
            // Juke broken tackle!
            soundManager.playCrowdRoar('CHEER');
            def.x -= (dx / dist) * 1.5;
            def.state = 'TACKLED';
          } else {
            // Tackle!
            soundManager.playTackle();
            soundManager.playWhistle();
            carrier.state = 'TACKLED';
            def.state = 'TACKLED';

            const yardsGained = Math.round(carrier.z - losZ);
            const newYardLine = Math.min(99, Math.max(1, this.driveState.ballYardLine + yardsGained));
            this.completePlay({
              result: yardsGained >= 0 ? 'COMPLETE' : 'SACK',
              yardsGained,
              description: `Tackled by ${def.name} after a gain of ${yardsGained} yards.`,
            }, newYardLine);
          }
        }
      });
    }
  }

  private handleSack(qb: Player3D): void {
    soundManager.playTackle();
    soundManager.playWhistle();

    qb.state = 'TACKLED';
    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const lossYards = Math.round(Math.abs(qb.z - losZ));
    const newYardLine = Math.max(1, this.driveState.ballYardLine - lossYards);

    this.completePlay({
      result: 'SACK',
      yardsGained: -lossYards,
      description: `Sacked for a loss of ${lossYards} yards!`,
    }, newYardLine);
  }

  private handlePassResolution(hitGround: boolean): void {
    const targets = this.offensePlayers.filter((p) => p.role === 'WR' || p.role === 'RB');
    const receiver = this.selectedTargetReceiver || targets[0];

    if (hitGround || !receiver) {
      soundManager.playWhistle();
      this.completePlay({
        result: 'INCOMPLETE',
        yardsGained: 0,
        description: 'Incomplete pass. Ball hit turf.',
      }, this.driveState.ballYardLine);
      return;
    }

    // Evaluate catch probability
    const isOpen = receiver.route?.isOpen ?? true;
    const catchChance = isOpen ? 0.94 : 0.55;
    const roll = Math.random();

    if (roll < catchChance) {
      // Completed Catch!
      soundManager.playCatch();
      soundManager.playCrowdRoar('CHEER');
      soundManager.announce(`Completed pass to ${receiver.name}!`);
      receiver.state = 'RUNNING';
      receiver.hasBall = true;
      this.activeBallCarrier = receiver;

      // Hide free ball, show in receiver's hands
      this.activeFootballMesh.visible = false;
      const parts = this.playerMeshes.get(receiver.id);
      if (parts && parts.ballMesh) {
        parts.ballMesh.visible = true;
      }
      this.notifyState();
      // Note: play continues! User now controls activeBallCarrier!
    } else {
      // Incomplete or Intercepted
      if (!isOpen && Math.random() < 0.22) {
        soundManager.playCrowdRoar('GROAN');
        soundManager.playWhistle();
        this.completePlay({
          result: 'INTERCEPTION',
          yardsGained: 0,
          description: 'INTERCEPTED by Current secondary!',
        }, this.driveState.ballYardLine);
      } else {
        soundManager.playWhistle();
        this.completePlay({
          result: 'INCOMPLETE',
          yardsGained: 0,
          description: 'Pass broken up. Incomplete.',
        }, this.driveState.ballYardLine);
      }
    }
  }

  public completePlay(outcome: PlayOutcome, newYardLine: number): void {
    this.gameMode = outcome.result === 'TOUCHDOWN' ? 'TOUCHDOWN' : 'PLAY_OVER';

    const previousBallLine = this.driveState.ballYardLine;
    const gained = newYardLine - previousBallLine;
    this.driveState.ballYardLine = newYardLine;
    this.driveState.driveYards += gained;
    this.driveState.playsInDrive++;
    this.driveState.lastPlayResult = outcome.description;

    if (outcome.result === 'TOUCHDOWN') {
      this.driveState.offenseTeam.score += 6;
      this.fieldBuilder.triggerTouchdownFireworks(this.scene);
      soundManager.playStadiumHorn();
      soundManager.playFireworksExplosion();
      soundManager.playCrowdRoar('TOUCHDOWN');
      soundManager.playOrganFanfare();
      soundManager.announce('TOUCHDOWN AURORA! Incredible play into the end zone!');
    } else if (newYardLine >= previousBallLine + this.driveState.yardsToGo) {
      // 1st Down!
      this.driveState.down = 1;
      this.driveState.yardsToGo = Math.min(10, 100 - newYardLine);
      soundManager.playCrowdRoar('CHEER');
      soundManager.playOrganFanfare();
      soundManager.announce('First down Aurora!');
    } else {
      // Next Down
      if (this.driveState.down < 4) {
        this.driveState.down = (this.driveState.down + 1) as 1 | 2 | 3 | 4;
        this.driveState.yardsToGo = Math.max(1, this.driveState.yardsToGo - gained);
        if (this.driveState.down === 3) {
          soundManager.playDefenseDrumCadence();
        }
      } else {
        // Turnover on Downs
        this.gameMode = 'TURNOVER';
        this.driveState.down = 1;
        this.driveState.yardsToGo = 10;
        this.driveState.ballYardLine = 100 - newYardLine;
        soundManager.playCrowdRoar('GROAN');
        soundManager.announce('Turnover on downs! Defense stands tall!');
      }
    }

    this.driveState.isRedZone = this.driveState.ballYardLine >= 80;

    this.updateJumbotron();

    if (this.onPlayEnd) {
      this.onPlayEnd(outcome);
    }
    this.notifyState();
  }

  public nextDown(): void {
    if (this.gameMode === 'TOUCHDOWN' || this.gameMode === 'TURNOVER') {
      // Reset drive from 20
      this.driveState.ballYardLine = 20;
      this.driveState.down = 1;
      this.driveState.yardsToGo = 10;
      this.driveState.driveYards = 0;
      this.driveState.playsInDrive = 1;
    }

    this.gameMode = 'PLAYING';
    this.setupPlay(this.currentPlayType);
  }

  private updateJumbotron(): void {
    const downOrdinal = ['1st', '2nd', '3rd', '4th'][this.driveState.down - 1];
    const toGoText = this.driveState.ballYardLine >= 90 ? 'Goal' : `${this.driveState.yardsToGo}`;
    const downDist = `${downOrdinal} & ${toGoText}`;
    const ballLoc = `Ball on ${this.driveState.ballYardLine <= 50 ? this.driveState.ballYardLine : 100 - this.driveState.ballYardLine}`;
    const score = `${this.driveState.offenseTeam.name} ${this.driveState.offenseTeam.score} - ${this.driveState.defenseTeam.name} ${this.driveState.defenseTeam.score}`;

    this.fieldBuilder.renderJumbotron(0, downDist, ballLoc, score);
    this.fieldBuilder.renderJumbotron(1, downDist, ballLoc, score);
  }

  private notifyState(): void {
    if (this.onStateChange) {
      this.onStateChange(this.driveState, this.gameMode, Math.max(0, this.pocketTimeRemaining), Boolean(this.activeBallCarrier));
    }
  }

  private animate = (): void => {
    this.animId = requestAnimationFrame(this.animate);

    const delta = Math.min(this.animClock.getDelta(), 0.1);
    const animTime = this.animClock.getElapsedTime();

    // 1. Weather particles & Living Stadium Atmosphere
    this.fieldBuilder.updatePrecipitation(delta);

    let excitement = 1.0;
    if (this.gameMode === 'TOUCHDOWN') {
      excitement = 2.8;
    } else if (this.activeBallCarrier || this.isPassInAir) {
      excitement = 1.8;
    } else if (this.driveState.down === 3) {
      excitement = 1.4;
    }
    this.fieldBuilder.updateStadiumEffects(animTime, delta, this.scene, excitement);

    // 2. Play mechanics update
    this.simulationRemainder += delta;
    while (this.simulationRemainder >= 1/120) {
      this.simulationRemainder -= 1/120;
      const delta = 1/120;
      if (this.gameMode !== 'PLAYING') continue;
      this.updatePocketAndRushers(delta);
      this.updateReceiversAndCoverage(delta);
      this.updatePlayerControlsAndCarrier(delta);

      // Ball in Flight Physics update
      if (this.isPassInAir) {
        const physicsResult = this.footballPhysics.update(delta);
        if (physicsResult.arrived || physicsResult.hitGround) {
          this.isPassInAir = false;
          this.handlePassResolution(physicsResult.hitGround);
        }
      }
    }

    // 3. Synchronize player 3D meshes & procedural skeletal animation
    const allPlayers = [...this.offensePlayers, ...this.defensePlayers];
    allPlayers.forEach((player) => {
      const parts = this.playerMeshes.get(player.id);
      if (parts) {
        parts.root.position.set(player.x, player.y, player.z);

        // Heading rotation
        parts.root.rotation.y = player.heading;

        const isOpen = player.route ? player.route.isOpen : false;
        PlayerMeshBuilder.animatePlayer(parts, player, animTime, isOpen);
      }
    });

    // 4. Update Camera
    this.updateCamera();

    // 5. Update Catch point indicator chevron (Screenshot 2: "Catch point: Open")
    if (this.isGuidedMode && this.selectedTargetReceiver && this.gameMode === 'PLAYING' && !this.activeBallCarrier) {
      this.fieldBuilder.catchPointChevron.visible = true;
      this.fieldBuilder.catchPointChevron.position.set(
        this.selectedTargetReceiver.x,
        3.2 + Math.sin(animTime * 4) * 0.2,
        this.selectedTargetReceiver.z
      );
    } else {
      this.fieldBuilder.catchPointChevron.visible = false;
    }

    // 6. Render Frame
    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(): void {
    if (this.gameMode === 'MENU') {
      const animTime = this.animClock.getElapsedTime();
      const t = animTime * 0.08;
      const camX = Math.sin(t) * 22;
      const camZ = -25 + Math.cos(t) * 12;
      const camY = 8.5 + Math.sin(t * 0.5) * 2.0;
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(0, 3.5, 15);
      return;
    }

    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    const carrier = this.activeBallCarrier || qb;
    const losZ = this.yardLineToZ(this.driveState.ballYardLine);

    if (this.cameraMode === 'BEHIND_QB') {
      // Dynamic 3rd person follow Cam
      if (carrier) {
        let targetCamX = carrier.x * 0.6;
        let targetCamY = 3.6;
        let targetCamZ = carrier.z - 7.5;
        let lookTargetX = carrier.x * 0.3;
        let lookTargetY = 1.8;
        let lookTargetZ = carrier.z + 14;

        // If ball is in flight, zoom back and track downfield towards target
        if (this.isPassInAir && this.activeFootballMesh.visible) {
          targetCamZ = this.activeFootballMesh.position.z - 9.5;
          targetCamY = 5.8;
          lookTargetX = this.activeFootballMesh.position.x * 0.5;
          lookTargetY = 2.0;
          lookTargetZ = this.activeFootballMesh.position.z + 6.0;
        }

        this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, 0.1);
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, 0.1);
        this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, 0.1);
        this.camera.lookAt(lookTargetX, lookTargetY, lookTargetZ);
      }
    } else if (this.cameraMode === 'BROADCAST') {
      // Sideline TV broadcast angle tracking current ball position
      const focusZ = carrier ? carrier.z : losZ;
      this.camera.position.set(-FIELD.WIDTH / 2 - 8, 14, focusZ - 2);
      this.camera.lookAt(carrier ? carrier.x * 0.5 : 0, 1.5, focusZ + 4);
    } else if (this.cameraMode === 'ALL_22') {
      // High End Zone All-22 coach cam
      const focusZ = carrier ? carrier.z : losZ;
      this.camera.position.set(0, 26, focusZ - 28);
      this.camera.lookAt(0, 0, focusZ + 15);
    } else if (this.cameraMode === 'FIRST_PERSON') {
      // Helmet Cam
      if (carrier) {
        this.camera.position.set(carrier.x, 2.0, carrier.z + 0.1);
        this.camera.lookAt(carrier.x, 2.0, carrier.z + 20);
      }
    }
  }

  private handleResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / (height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public destroy(): void {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
